from __future__ import annotations

import asyncio
import email
import imaplib
import logging
from abc import ABC, abstractmethod
from email.header import decode_header

from app.config import Settings
from app.schemas import MonitoringPayload


logger = logging.getLogger(__name__)


class NotificationConnector(ABC):
    name: str

    @abstractmethod
    async def poll(self) -> list[MonitoringPayload]:
        raise NotImplementedError


class ChatConnector(NotificationConnector):
    pass


class StubConnector(NotificationConnector):
    def __init__(self, name: str) -> None:
        self.name = name
        self._primed = False

    async def poll(self) -> list[MonitoringPayload]:
        if self._primed:
            return []
        self._primed = True
        return [MonitoringPayload(source=self.name, severity="info", summary=f"{self.name} connector is available but not configured.")]


class ImapInboxConnector(NotificationConnector):
    """Read-only IMAP unread-mail summaries. It never marks, moves, or sends mail."""

    name = "email_inbox"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._seen_uids: set[bytes] = set()

    async def poll(self) -> list[MonitoringPayload]:
        return await asyncio.to_thread(self._poll_sync)

    async def list_unread(self, limit: int = 10) -> list[dict[str, str]]:
        return await asyncio.to_thread(self._list_unread_sync, limit)

    def _poll_sync(self) -> list[MonitoringPayload]:
        if not self.settings.email_imap_host or not self.settings.email_imap_username or not self.settings.email_imap_password:
            return [MonitoringPayload(source=self.name, severity="warning", summary="Email connector is enabled but IMAP credentials are incomplete.")]
        client: imaplib.IMAP4_SSL | None = None
        try:
            client = imaplib.IMAP4_SSL(self.settings.email_imap_host, self.settings.email_imap_port)
            client.login(self.settings.email_imap_username, self.settings.email_imap_password)
            status, _ = client.select(self.settings.email_imap_folder, readonly=True)
            if status != "OK":
                raise RuntimeError(f"Unable to open IMAP folder {self.settings.email_imap_folder}")
            status, data = client.uid("search", None, "UNSEEN")
            if status != "OK":
                raise RuntimeError("Unable to search unread IMAP messages")
            uids = data[0].split()[-10:]
            new_uids = [uid for uid in uids if uid not in self._seen_uids]
            self._seen_uids.update(new_uids)
            alerts: list[MonitoringPayload] = []
            for uid in new_uids:
                status, message_data = client.uid("fetch", uid, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
                if status != "OK" or not message_data:
                    continue
                raw = next((part[1] for part in message_data if isinstance(part, tuple)), b"")
                message = email.message_from_bytes(raw)
                subject = self._decode_header(message.get("Subject", "(no subject)"))
                sender = self._decode_header(message.get("From", "unknown sender"))
                severity = "warning" if any(word in subject.lower() for word in ("urgent", "action required", "invoice", "security")) else "info"
                alerts.append(
                    MonitoringPayload(
                        source=self.name,
                        severity=severity,
                        summary=f"Unread email from {sender}: {subject}",
                        detail=f"Received {message.get('Date', 'unknown time')}. Read-only summary; no message was sent or modified.",
                    )
                )
            return alerts
        except Exception as exc:
            logger.exception("IMAP inbox poll failed")
            return [MonitoringPayload(source=self.name, severity="warning", summary="Email inbox polling failed.", detail=str(exc))]
        finally:
            if client is not None:
                try:
                    client.logout()
                except Exception:
                    pass

    def _list_unread_sync(self, limit: int) -> list[dict[str, str]]:
        if not self.settings.email_imap_host or not self.settings.email_imap_username or not self.settings.email_imap_password:
            raise RuntimeError("IMAP credentials are incomplete.")
        client: imaplib.IMAP4_SSL | None = None
        try:
            client = imaplib.IMAP4_SSL(self.settings.email_imap_host, self.settings.email_imap_port)
            client.login(self.settings.email_imap_username, self.settings.email_imap_password)
            status, _ = client.select(self.settings.email_imap_folder, readonly=True)
            if status != "OK":
                raise RuntimeError(f"Unable to open IMAP folder {self.settings.email_imap_folder}")
            status, data = client.uid("search", None, "UNSEEN")
            if status != "OK":
                raise RuntimeError("Unable to search unread IMAP messages")
            messages: list[dict[str, str]] = []
            for uid in reversed(data[0].split()[-limit:]):
                status, message_data = client.uid("fetch", uid, "(BODY.PEEK[])")
                if status != "OK":
                    continue
                raw = next((part[1] for part in message_data if isinstance(part, tuple)), b"")
                message = email.message_from_bytes(raw)
                messages.append(
                    {
                        "id": uid.decode("ascii", errors="replace"),
                        "from": self._decode_header(message.get("From", "unknown sender")),
                        "subject": self._decode_header(message.get("Subject", "(no subject)")),
                        "date": message.get("Date", "unknown time"),
                        "body": self._message_body(message),
                    }
                )
            return messages
        finally:
            if client is not None:
                try:
                    client.logout()
                except Exception:
                    pass

    @staticmethod
    def _decode_header(value: str) -> str:
        parts: list[str] = []
        for text, encoding in decode_header(value):
            parts.append(text.decode(encoding or "utf-8", errors="replace") if isinstance(text, bytes) else text)
        return "".join(parts)

    @staticmethod
    def _message_body(message: email.message.Message) -> str:
        if message.is_multipart():
            for part in message.walk():
                if part.get_content_type() == "text/plain" and "attachment" not in str(part.get("Content-Disposition", "")).lower():
                    payload = part.get_payload(decode=True) or b""
                    return payload.decode(part.get_content_charset() or "utf-8", errors="replace").strip()[:10_000]
            return "[No plain-text message body available.]"
        payload = message.get_payload(decode=True) or b""
        return payload.decode(message.get_content_charset() or "utf-8", errors="replace").strip()[:10_000]


class MonitoringEngine:
    def __init__(self, connectors: list[NotificationConnector]) -> None:
        self.connectors = connectors

    async def poll_once(self) -> list[MonitoringPayload]:
        results = await asyncio.gather(*(connector.poll() for connector in self.connectors), return_exceptions=True)
        alerts: list[MonitoringPayload] = []
        for connector, result in zip(self.connectors, results):
            if isinstance(result, Exception):
                logger.exception("Monitoring connector %s failed", connector.name, exc_info=result)
                alerts.append(MonitoringPayload(source=connector.name, severity="warning", summary=f"{connector.name} poll failed.", detail=str(result)))
            else:
                alerts.extend(result)
        return alerts
