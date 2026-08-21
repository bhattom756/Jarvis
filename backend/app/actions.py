from __future__ import annotations

import logging
import mimetypes
import os
import smtplib
import ssl
import subprocess
import webbrowser
from datetime import timedelta
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote_plus

try:
    from playwright.sync_api import BrowserContext, Playwright, sync_playwright
except ImportError:  # pragma: no cover - optional runtime dependency
    BrowserContext = Playwright = None  # type: ignore[assignment]
    sync_playwright = None  # type: ignore[assignment]

try:
    import pyautogui
except ImportError:  # pragma: no cover - optional runtime dependency
    pyautogui = None  # type: ignore[assignment]

try:
    import pygetwindow
except ImportError:  # pragma: no cover - optional runtime dependency
    pygetwindow = None  # type: ignore[assignment]

from app.config import Settings, settings as default_settings
from app.schemas import ActionResult, ConfirmationPayload, EmailDraftRequest, utc_now


logger = logging.getLogger(__name__)


class BrowserActionProvider:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or default_settings
        self._playwright: Playwright | None = None
        self._context: BrowserContext | None = None

    def search(self, query: str) -> ActionResult:
        return self.navigate(f"https://www.google.com/search?q={quote_plus(query)}", summary=f"Searched the web for '{query}'.")

    def navigate(self, url: str, summary: str | None = None) -> ActionResult:
        target = url if url.startswith(("http://", "https://")) else f"https://{url}"
        if not self.settings.enable_browser_actions:
            return ActionResult(ok=False, summary="Browser actions are disabled.")
        try:
            page = self._page()
            page.goto(target, wait_until="domcontentloaded", timeout=30_000)
            title = page.title()
            return ActionResult(ok=True, summary=summary or f"Opened {title or target}.", detail=page.url)
        except Exception as exc:
            logger.warning("Playwright navigation failed; opening default browser: %s", exc)
            try:
                webbrowser.open(target)
                return ActionResult(ok=True, summary=summary or f"Opened {target} in the default browser.", detail=target)
            except Exception as fallback_exc:
                return ActionResult(ok=False, summary="Unable to open browser.", detail=str(fallback_exc))

    def extract(self, url: str) -> ActionResult:
        try:
            page = self._page()
            page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            text = page.locator("body").inner_text(timeout=10_000)
            excerpt = " ".join(text.split())[:2000]
            return ActionResult(ok=True, summary=f"Extracted page content from {page.title() or url}.", detail=excerpt)
        except Exception as exc:
            return ActionResult(ok=False, summary="Unable to extract page content.", detail=str(exc))

    def close(self) -> None:
        if self._context is not None:
            self._context.close()
        if self._playwright is not None:
            self._playwright.stop()
        self._context = None
        self._playwright = None

    def _page(self):
        if sync_playwright is None:
            raise RuntimeError("Playwright is not installed")
        if self._context is None:
            self._playwright = sync_playwright().start()
            self._context = self._playwright.chromium.launch_persistent_context(
                user_data_dir=str(self.settings.browser_session_dir),
                headless=self.settings.browser_headless,
            )
        return self._context.pages[0] if self._context.pages else self._context.new_page()


class WindowsActionProvider:
    APP_ALIASES = {
        "vscode": "code",
        "visual studio code": "code",
        "chrome": "chrome",
        "notepad": "notepad",
        "calculator": "calc",
        "file explorer": "explorer",
        "explorer": "explorer",
    }

    def open_application(self, target: str) -> ActionResult:
        executable = self.APP_ALIASES.get(target.lower(), target)
        try:
            subprocess.Popen([executable], shell=False)
            return ActionResult(ok=True, summary=f"Launched {target}.")
        except OSError:
            try:
                os.startfile(target)  # type: ignore[attr-defined]
                return ActionResult(ok=True, summary=f"Launched {target}.")
            except Exception as exc:
                return ActionResult(ok=False, summary=f"Failed to launch {target}.", detail=str(exc))

    def list_windows(self) -> ActionResult:
        if pygetwindow is None:
            return ActionResult(ok=False, summary="Window discovery requires pygetwindow.")
        titles = [title for title in pygetwindow.getAllTitles() if title.strip()]
        return ActionResult(ok=True, summary=f"Found {len(titles)} open windows.", detail="\n".join(titles[:30]))

    def focus_window(self, title: str) -> ActionResult:
        if pygetwindow is None:
            return ActionResult(ok=False, summary="Window switching requires pygetwindow.")
        matches = pygetwindow.getWindowsWithTitle(title)
        if not matches:
            return ActionResult(ok=False, summary=f"No window matched '{title}'.")
        window = matches[0]
        window.restore()
        window.activate()
        return ActionResult(ok=True, summary=f"Focused window '{window.title}'.")

    def type_text(self, text: str) -> ActionResult:
        if pyautogui is None:
            return ActionResult(ok=False, summary="Keyboard automation requires pyautogui.")
        pyautogui.write(text, interval=0.02)
        return ActionResult(ok=True, summary="Typed text into the active window.")


class EmailActionProvider:
    """SMTP sender used only after an explicit confirmation is resolved."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def validate(self, draft: EmailDraftRequest) -> ActionResult:
        if not self._configured:
            return ActionResult(ok=False, summary="SMTP email sending is not configured.")
        try:
            attachment_names = [self._validate_attachment(Path(path)).name for path in draft.attachments]
        except ValueError as exc:
            return ActionResult(ok=False, summary="Email draft contains an invalid attachment.", detail=str(exc))
        attachment_note = f" Attachments: {', '.join(attachment_names)}." if attachment_names else ""
        return ActionResult(ok=True, summary=f"Send email to {', '.join(draft.recipients)} with subject '{draft.subject}'.{attachment_note}")

    def send(self, draft: EmailDraftRequest) -> ActionResult:
        validation = self.validate(draft)
        if not validation.ok:
            return validation
        message = EmailMessage()
        message["From"] = self.settings.email_from_address or self.settings.email_smtp_username or self.settings.email_imap_username
        message["To"] = ", ".join(draft.recipients)
        message["Subject"] = draft.subject
        message.set_content(draft.body)
        try:
            for path_str in draft.attachments:
                path = self._validate_attachment(Path(path_str))
                mime_type, _ = mimetypes.guess_type(path.name)
                major, minor = (mime_type or "application/octet-stream").split("/", 1)
                message.add_attachment(path.read_bytes(), maintype=major, subtype=minor, filename=path.name)
            context = ssl.create_default_context()
            if self.settings.email_smtp_use_ssl:
                with smtplib.SMTP_SSL(self.settings.email_smtp_host, self.settings.email_smtp_port, context=context, timeout=30) as client:
                    client.login(self._username, self._password)
                    client.send_message(message)
            else:
                with smtplib.SMTP(self.settings.email_smtp_host, self.settings.email_smtp_port, timeout=30) as client:
                    client.starttls(context=context)
                    client.login(self._username, self._password)
                    client.send_message(message)
            return ActionResult(ok=True, summary=f"Email sent to {', '.join(draft.recipients)}.", detail=validation.summary)
        except Exception as exc:
            logger.exception("SMTP email send failed")
            return ActionResult(ok=False, summary="Email was not sent.", detail=str(exc))

    @property
    def _username(self) -> str:
        return self.settings.email_smtp_username or self.settings.email_imap_username or ""

    @property
    def _password(self) -> str:
        return self.settings.email_smtp_password or self.settings.email_imap_password or ""

    @property
    def _configured(self) -> bool:
        return bool(self.settings.email_smtp_host and self._username and self._password and (self.settings.email_from_address or self._username))

    def _validate_attachment(self, path: Path) -> Path:
        resolved = path.expanduser().resolve()
        if not resolved.is_file():
            raise ValueError(f"Attachment does not exist or is not a file: {path}")
        if resolved.stat().st_size > self.settings.email_max_attachment_bytes:
            raise ValueError(f"Attachment exceeds {self.settings.email_max_attachment_bytes // 1_000_000} MB: {resolved.name}")
        return resolved


class ActionEngine:
    def __init__(self, settings: Settings, browser_provider: BrowserActionProvider, windows_provider: WindowsActionProvider) -> None:
        self.settings = settings
        self.browser = browser_provider
        self.windows = windows_provider

    def evaluate(self, utterance: str, approved: bool = False) -> ActionResult:
        if self._requires_confirmation(utterance) and not approved:
            return self._confirmation(utterance, "high_risk_action", "high", reversible=False)

        lower = utterance.lower().strip()
        if not self.settings.enable_windows_actions and any(lower.startswith(prefix) for prefix in ("open ", "launch ", "list windows", "switch to ", "focus ", "type ")):
            return ActionResult(ok=False, summary="Windows actions are disabled.")
        if lower.startswith(("open ", "launch ")):
            target = utterance.split(" ", 1)[1].strip()
            if target.startswith(("http://", "https://")) or "." in target:
                return self.browser.navigate(target)
            return self.windows.open_application(target)
        if "search for" in lower:
            return self.browser.search(utterance.split("search for", 1)[1].strip())
        if lower.startswith("go to ") or lower.startswith("navigate to "):
            return self.browser.navigate(utterance.split(" ", 2)[-1].strip())
        if lower.startswith("extract ") or lower.startswith("read page "):
            return self.browser.extract(utterance.split(" ", 1)[1].strip())
        if "list windows" in lower or "open windows" in lower:
            return self.windows.list_windows()
        if lower.startswith("switch to ") or lower.startswith("focus "):
            return self.windows.focus_window(utterance.split(" ", 2)[-1].strip())
        if lower.startswith("type "):
            return self.windows.type_text(utterance.split(" ", 1)[1])
        if lower.startswith("create file "):
            return self._create_file(utterance.split("create file ", 1)[1].strip(), approved)
        return ActionResult(ok=True, summary="No direct action executed. Plan updated for response.")

    def close(self) -> None:
        self.browser.close()

    def _create_file(self, path_str: str, approved: bool) -> ActionResult:
        path = Path(path_str)
        if not self._is_approved_path(path) and not approved:
            return self._confirmation(f"Create file {path}", "file_write", "medium", reversible=True)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch(exist_ok=True)
        return ActionResult(ok=True, summary=f"Created file at {path}.")

    def _confirmation(self, summary: str, category: str, risk_level: str, reversible: bool) -> ActionResult:
        return ActionResult(
            ok=False,
            summary="Confirmation required before execution.",
            confirmation=ConfirmationPayload(
                category=category,
                risk_level=risk_level,  # type: ignore[arg-type]
                summary=summary,
                reversible=reversible,
                expires_at=utc_now() + timedelta(minutes=5),
            ),
        )

    def _requires_confirmation(self, utterance: str) -> bool:
        risky_terms = ("delete", "send", "purchase", "shutdown", "format", "move all", "run script", "type ")
        return any(term in utterance.lower() for term in risky_terms)

    def _is_approved_path(self, path: Path) -> bool:
        resolved = path.resolve()
        for root in self.settings.approved_write_roots:
            try:
                resolved.relative_to(Path(root).resolve())
                return True
            except ValueError:
                continue
        return False
