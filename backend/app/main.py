from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.orchestrator import Orchestrator
from app.schemas import ConfirmationDecision, EmailDraftRequest, UserUtterance


def configure_logging() -> None:
    settings.ensure_directories()
    log_path = settings.sqlite_path.parent / "logs" / "jarvis.log"
    root = logging.getLogger()
    if root.handlers:
        return
    root.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    stream = logging.StreamHandler()
    stream.setFormatter(formatter)
    rotating = RotatingFileHandler(log_path, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    rotating.setFormatter(formatter)
    root.addHandler(stream)
    root.addHandler(rotating)


configure_logging()
app = FastAPI(title="JARVIS Backend", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = Orchestrator()


@app.on_event("startup")
async def on_startup() -> None:
    await orchestrator.startup()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await orchestrator.shutdown()


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": settings.app_name, "state": orchestrator.state_machine.state}


@app.get("/config")
async def config_summary() -> dict:
    return {
        "backend_url": f"http://{settings.backend_host}:{settings.backend_port}",
        "monitoring_enabled": settings.enable_monitoring,
        "browser_actions_enabled": settings.enable_browser_actions,
        "windows_actions_enabled": settings.enable_windows_actions,
    }


@app.get("/connectors")
async def connectors() -> dict:
    return {connector.name: ("active" if connector.__class__.__name__ != "StubConnector" else "not_configured") for connector in orchestrator.monitoring.connectors}


@app.post("/utterances")
async def submit_utterance(utterance: UserUtterance) -> dict:
    await orchestrator.ingest_manual_utterance(utterance)
    return {"accepted": True}


@app.post("/emails/send")
async def request_email_send(draft: EmailDraftRequest) -> dict:
    result = await orchestrator.request_email_send(draft)
    return {"accepted": result.ok or result.confirmation is not None, "summary": result.summary, "confirmation": result.confirmation.model_dump(mode="json") if result.confirmation else None}


@app.get("/emails/unread")
async def unread_email(limit: int = 10) -> dict:
    try:
        return {"messages": await orchestrator.list_unread_email(max(1, min(limit, 25)))}
    except RuntimeError as exc:
        return {"messages": [], "error": str(exc)}


@app.post("/confirmations/{confirmation_id}")
async def resolve_confirmation(confirmation_id: str, decision: ConfirmationDecision) -> dict:
    payload = await orchestrator.resolve_confirmation(confirmation_id, decision.approved)
    return {"resolved": payload is not None, "payload": payload.model_dump(mode="json") if payload else None}


@app.post("/controls/mute")
async def set_mute(payload: dict) -> dict:
    muted = bool(payload.get("muted", False))
    await orchestrator.set_muted(muted)
    return {"ok": True, "muted": muted}


@app.post("/controls/monitoring")
async def set_monitoring(payload: dict) -> dict:
    paused = bool(payload.get("paused", False))
    await orchestrator.set_monitoring_paused(paused)
    return {"ok": True, "paused": paused}


@app.get("/timeline")
async def timeline() -> dict:
    return {
        "activities": orchestrator.store.list_recent("actions"),
        "tasks": orchestrator.store.list_recent("tasks"),
        "conversations": orchestrator.store.list_recent("conversations"),
        "confirmations": orchestrator.store.list_recent("confirmations"),
        "system": orchestrator.store.list_recent("system_status_snapshots", limit=1),
    }


@app.websocket(settings.desktop_ws_path)
async def desktop_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    async def subscriber(event) -> None:
        await websocket.send_text(event.model_dump_json())

    orchestrator.events.subscribe(subscriber)
    await orchestrator.publish_system_status()
    try:
        while True:
            payload = json.loads(await websocket.receive_text())
            event_type = payload.get("type")
            if event_type == "utterance.submit":
                await orchestrator.ingest_manual_utterance(UserUtterance(**payload["payload"]))
            elif event_type == "confirmation.resolve":
                decision = ConfirmationDecision(**payload["payload"])
                await orchestrator.resolve_confirmation(payload["payload"]["id"], decision.approved)
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        logging.getLogger(__name__).warning("Invalid desktop websocket message: %s", exc)
    except WebSocketDisconnect:
        pass
    finally:
        orchestrator.events.unsubscribe(subscriber)
