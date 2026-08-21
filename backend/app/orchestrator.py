from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable
from uuid import uuid4

from app.actions import ActionEngine, BrowserActionProvider, EmailActionProvider, WindowsActionProvider
from app.config import settings
from app.event_bus import EventBus
from app.memory import MemoryStore, NullMemoryStore, QdrantMemoryStore
from app.monitoring import ImapInboxConnector, MonitoringEngine, StubConnector
from app.personality import PersonalityEngine
from app.planner import PlannerEngine
from app.providers import EmbeddingProvider, ElevenLabsTTSProvider, StubTTSProvider, build_llm_provider
from app.schemas import (
    ActionResult,
    ActivityPayload,
    AssistantState,
    AssistantStatePayload,
    ConfirmationPayload,
    EmailDraftRequest,
    EventEnvelope,
    MemoryPayload,
    MonitoringPayload,
    PlanPayload,
    SpeechOutputPayload,
    SystemStatusPayload,
    TaskPayload,
    TranscriptPayload,
    UserUtterance,
)
from app.speech import SpeechEngine
from app.state_machine import AssistantStateMachine
from app.storage import SQLiteStore


logger = logging.getLogger(__name__)


@dataclass
class PendingConfirmation:
    payload: ConfirmationPayload
    execute: Callable[[], ActionResult]


class Orchestrator:
    def __init__(self) -> None:
        self.settings = settings
        self.events = EventBus()
        self.store = SQLiteStore(settings.sqlite_path)
        self.state_machine = AssistantStateMachine()
        self.speech = SpeechEngine(settings)
        self.planner = PlannerEngine()
        self.personality = PersonalityEngine()
        self.llm = build_llm_provider(settings)
        self.memory: MemoryStore = self._build_memory_store()
        self.tts = ElevenLabsTTSProvider(settings) if settings.elevenlabs_api_key else StubTTSProvider()
        self.action_engine = ActionEngine(settings, BrowserActionProvider(settings), WindowsActionProvider())
        self.email = EmailActionProvider(settings)
        connectors = [StubConnector("windows_notifications"), StubConnector("discord"), StubConnector("slack"), StubConnector("teams"), StubConnector("whatsapp_web")]
        self.email_inbox = ImapInboxConnector(settings) if settings.enable_email_connector else None
        connectors.append(self.email_inbox or StubConnector("email_inbox"))
        self.monitoring = MonitoringEngine(connectors)
        self.pending_confirmations: dict[str, PendingConfirmation] = {}
        self._monitor_task: asyncio.Task[None] | None = None
        self._speech_loop: asyncio.AbstractEventLoop | None = None
        self._processing_lock = asyncio.Lock()
        self.muted = False
        self.monitoring_paused = False

    def _build_memory_store(self) -> MemoryStore:
        if self.settings.enable_qdrant and isinstance(self.llm, EmbeddingProvider):
            try:
                return QdrantMemoryStore(self.settings, self.llm)
            except Exception:
                logger.exception("Qdrant unavailable; using in-process memory")
        return NullMemoryStore()

    async def startup(self) -> None:
        self._speech_loop = asyncio.get_running_loop()
        self.speech.set_handler(self._on_microphone_utterance)
        self.speech.start()
        await self.publish_system_status()
        await self._poll_connectors_once()
        if self.settings.enable_monitoring:
            self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def shutdown(self) -> None:
        self.speech.stop()
        self.action_engine.close()
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass

    async def ingest_manual_utterance(self, utterance: UserUtterance) -> None:
        transcript = self.speech.ingest_text(utterance.text)
        await self.publish_transcript(transcript)
        completed = self.speech.consume_if_final(transcript)
        if completed:
            await self.process_utterance(completed)

    async def process_utterance(self, text: str) -> None:
        async with self._processing_lock:
            await self._set_state(AssistantState.THINKING, goal=text, task="Understanding request", confidence=0.72)
            plan = self.planner.build_plan(text)
            await self.publish_event("plan.updated", plan.model_dump(mode="json"))
            self._persist_plan_as_task(plan)
            memory_context = self.memory.retrieve(text)
            await self.publish_event("memory.updated", MemoryPayload(scope="short_term", summary="Retrieved relevant context", items=memory_context).model_dump(mode="json"))
            action_result = self.action_engine.evaluate(text)
            if action_result.confirmation:
                self.pending_confirmations[action_result.confirmation.id] = PendingConfirmation(
                    payload=action_result.confirmation,
                    execute=lambda: self.action_engine.evaluate(text, approved=True),
                )
            await self._publish_action_result(action_result)
            if action_result.confirmation:
                return
            await self._respond(text, memory_context, plan.confidence)

    async def resolve_confirmation(self, confirmation_id: str, approved: bool) -> ConfirmationPayload | None:
        pending = self.pending_confirmations.pop(confirmation_id, None)
        if not pending:
            return None
        payload = pending.payload.model_copy(update={"status": "approved" if approved else "denied"})
        self.store.insert("confirmations", {"id": payload.id, "category": payload.category, "risk_level": payload.risk_level, "summary": payload.summary, "reversible": int(payload.reversible), "expires_at": payload.expires_at.isoformat() if payload.expires_at else None, "status": payload.status, "created_at": datetime.now(timezone.utc).isoformat()})
        await self.publish_event("confirmation.resolved", payload.model_dump(mode="json"))
        if approved:
            await self._set_state(AssistantState.EXECUTING, goal=payload.summary, task="Executing approved action", confidence=0.88)
            result = pending.execute()
            await self._publish_action_result(result)
            await self._respond(payload.summary, [], 0.88, prefix=f"Approval received. {result.summary} ")
        return payload

    async def request_email_send(self, draft: EmailDraftRequest) -> ActionResult:
        validation = self.email.validate(draft)
        if not validation.ok:
            await self._publish_action_result(validation)
            return validation
        confirmation = ConfirmationPayload(category="email_send", risk_level="high", summary=validation.summary, reversible=False)
        self.pending_confirmations[confirmation.id] = PendingConfirmation(payload=confirmation, execute=lambda: self.email.send(draft))
        result = ActionResult(ok=False, summary="Confirmation required before sending email.", confirmation=confirmation)
        await self._publish_action_result(result)
        return result

    async def list_unread_email(self, limit: int = 10) -> list[dict[str, str]]:
        if self.email_inbox is None:
            raise RuntimeError("Email monitoring is disabled. Set JARVIS_ENABLE_EMAIL_CONNECTOR=true.")
        return await self.email_inbox.list_unread(limit)

    async def set_muted(self, muted: bool) -> None:
        self.muted = muted
        if muted:
            self.speech.stop()
        else:
            self.speech.start()
        await self.publish_system_status()

    async def set_monitoring_paused(self, paused: bool) -> None:
        self.monitoring_paused = paused
        await self.publish_system_status()

    async def publish_system_status(self) -> None:
        connector_status = {connector.name: ("active" if not isinstance(connector, StubConnector) else "not_configured") for connector in self.monitoring.connectors}
        payload = SystemStatusPayload(
            microphone="muted" if self.muted else self.speech.status,
            speech_error=self.speech.last_error,
            memory_db="ready",
            vector_memory="enabled" if isinstance(self.memory, QdrantMemoryStore) else "local fallback",
            llm_provider="openai" if isinstance(self.llm, EmbeddingProvider) else "local fallback",
            tts_provider="elevenlabs" if self.settings.elevenlabs_api_key else "local fallback",
            browser="enabled" if self.settings.enable_browser_actions else "disabled",
            monitoring="paused" if self.monitoring_paused else "active",
            connectors={**connector_status, "email_sending": "active" if self.email._configured else "not_configured"},
        )
        self.store.insert("system_status_snapshots", {"id": str(uuid4()), "payload": payload.model_dump(mode="json"), "created_at": datetime.now(timezone.utc).isoformat()})
        await self.publish_event("system.status", payload.model_dump(mode="json"))

    async def _respond(self, text: str, memory_context: list[str], confidence: float, prefix: str = "") -> None:
        try:
            response_text = self.llm.respond(text, memory_context)
        except Exception:
            logger.exception("LLM response failed; using fallback response")
            response_text = "I recorded the request, but the configured language provider is unavailable."
        response = self.personality.wrap_response(prefix + response_text)
        await self._set_state(AssistantState.SPEAKING, goal=text, task="Delivering response", confidence=confidence)
        try:
            speech_status = self.tts.synthesize(response)["status"]
        except Exception:
            logger.exception("TTS provider failed")
            speech_status = "failed"
        await self.publish_event("speech.output", SpeechOutputPayload(text=response, status=speech_status).model_dump(mode="json"))
        self._persist_conversation("user", text)
        self._persist_conversation("assistant", response)
        try:
            self.memory.remember("episodic", f"User asked: {text}", [response])
        except Exception:
            logger.exception("Memory write failed")
        await self._set_state(AssistantState.IDLE, goal="Awaiting next instruction", task="Monitoring", confidence=0.95)

    def _on_microphone_utterance(self, text: str) -> None:
        if self.muted or self._speech_loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._handle_microphone_utterance(text), self._speech_loop)

    async def _handle_microphone_utterance(self, text: str) -> None:
        transcript = TranscriptPayload(text=text, is_final=True, source="microphone")
        await self.publish_transcript(transcript)
        await self.process_utterance(text)

    async def _publish_action_result(self, result: ActionResult) -> None:
        payload = ActivityPayload(category="action", summary=result.summary, detail=result.detail)
        self.store.insert("actions", {"id": payload.id, "category": payload.category, "summary": payload.summary, "detail": payload.detail, "created_at": datetime.now(timezone.utc).isoformat()})
        await self.publish_event("activity.logged", payload.model_dump(mode="json"))
        if result.confirmation:
            await self.publish_event("confirmation.requested", result.confirmation.model_dump(mode="json"))
            self.store.insert("confirmations", {"id": result.confirmation.id, "category": result.confirmation.category, "risk_level": result.confirmation.risk_level, "summary": result.confirmation.summary, "reversible": int(result.confirmation.reversible), "expires_at": result.confirmation.expires_at.isoformat() if result.confirmation.expires_at else None, "status": result.confirmation.status, "created_at": datetime.now(timezone.utc).isoformat()})

    async def _set_state(self, state: AssistantState, goal: str, task: str, confidence: float) -> None:
        self.state_machine.transition(state)
        await self.publish_event("assistant.state", AssistantStatePayload(state=state, goal=goal, task=task, confidence=confidence).model_dump(mode="json"))

    async def publish_transcript(self, transcript: TranscriptPayload) -> None:
        await self.publish_event("transcript.segment", transcript.model_dump(mode="json"))

    async def publish_event(self, event_type: str, payload: dict) -> None:
        await self.events.publish(EventEnvelope(type=event_type, payload=payload))

    def _persist_plan_as_task(self, plan: PlanPayload) -> None:
        detail = ", ".join(step.title for step in plan.steps)
        task = TaskPayload(id=plan.id, title=plan.goal, status="running", detail=detail)
        self.store.insert("tasks", {"id": task.id, "title": task.title, "status": task.status, "detail": task.detail, "created_at": datetime.now(timezone.utc).isoformat()})

    def _persist_conversation(self, role: str, content: str) -> None:
        self.store.insert("conversations", {"id": str(uuid4()), "role": role, "content": content, "created_at": datetime.now(timezone.utc).isoformat()})

    async def _monitor_loop(self) -> None:
        while True:
            await asyncio.sleep(self.settings.proactive_interval_seconds)
            if not self.monitoring_paused:
                await self._poll_connectors_once()

    async def _poll_connectors_once(self) -> None:
        await self._set_state(AssistantState.MONITORING, goal="Scheduled proactive review", task="Polling connectors", confidence=0.66)
        for alert in await self.monitoring.poll_once():
            self.store.insert("connector_events", {"id": str(uuid4()), "source": alert.source, "severity": alert.severity, "summary": alert.summary, "detail": alert.detail, "created_at": datetime.now(timezone.utc).isoformat()})
            await self.publish_event("monitoring.alert", alert.model_dump(mode="json"))
        await self._set_state(AssistantState.IDLE, goal="Awaiting next instruction", task="Monitoring", confidence=0.95)
