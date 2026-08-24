from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable
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
    ConversationMessagePayload,
    ConfirmationPayload,
    EmailDraftRequest,
    EventEnvelope,
    MemoryPayload,
    MonitoringPayload,
    PlanPayload,
    SpeechOutputPayload,
    SpeechPlaybackPayload,
    SystemStatusPayload,
    TaskPayload,
    TranscriptPayload,
    UserUtterance,
)
from app.speech import SpeechEngine
from app.state_machine import AssistantStateMachine
from app.storage import MongoConversationStore, SQLiteConversationStore, SQLiteStore


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
        self.conversations, self.conversation_store_name = self._build_conversation_store()
        self.state_machine = AssistantStateMachine()
        self.speech = SpeechEngine(settings)
        self.planner = PlannerEngine()
        self.personality = PersonalityEngine()
        self.llm = build_llm_provider(settings)
        self.memory: MemoryStore = self._build_memory_store()
        self.tts = EdgeTTSProvider()
        self.action_engine = ActionEngine(settings, BrowserActionProvider(settings), WindowsActionProvider())
        self.email = EmailActionProvider(settings)
        connectors = [StubConnector("windows_notifications"), StubConnector("discord"), StubConnector("slack"), StubConnector("teams"), StubConnector("whatsapp_web")]
        self.email_inbox = ImapInboxConnector(settings) if settings.enable_email_connector else None
        connectors.append(self.email_inbox or StubConnector("email_inbox"))
        self.monitoring = MonitoringEngine(connectors)
        self.pending_confirmations: dict[str, PendingConfirmation] = {}
        self.active_conversation_id: str | None = None
        self._pending_greeting: dict[str, Any] | None = None
        self._monitor_task: asyncio.Task[None] | None = None
        self._speech_playback_timeout_task: asyncio.Task[None] | None = None
        self._speech_loop: asyncio.AbstractEventLoop | None = None
        self._processing_lock = asyncio.Lock()
        self._speech_output_active = False
        self._speech_playback_id: str | None = None
        self._speech_audio: dict[str, tuple[bytes, str]] = {}
        self._follow_up_deadline: float | None = None
        self.muted = False
        self.monitoring_paused = False

    def _build_memory_store(self) -> MemoryStore:
        if self.settings.enable_qdrant and isinstance(self.llm, EmbeddingProvider):
            try:
                return QdrantMemoryStore(self.settings, self.llm)
            except Exception:
                logger.exception("Qdrant unavailable; using in-process memory")
        return NullMemoryStore()

    def _build_conversation_store(self) -> tuple[MongoConversationStore | SQLiteConversationStore, str]:
        if self.settings.mongodb_uri:
            try:
                return MongoConversationStore(self.settings.mongodb_uri), "mongodb"
            except Exception:
                logger.exception("MongoDB conversation store unavailable; using SQLite fallback")
        return SQLiteConversationStore(self.settings.sqlite_path), "sqlite_fallback"

    async def startup(self) -> None:
        self._speech_loop = asyncio.get_running_loop()
        self.speech.set_handler(self._on_microphone_utterance)
        self.speech.set_speech_started_handler(self._on_microphone_activity)
        self.speech.start()
        self.active_conversation_id = self.conversations.start_session("New conversation")["id"]
        self._pending_greeting = None
        await self._set_resting_state(goal="Awaiting wake word", task="Say 'Friday' to begin", confidence=0.95)
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
        if self._speech_playback_timeout_task:
            self._speech_playback_timeout_task.cancel()

    async def ingest_manual_utterance(self, utterance: UserUtterance) -> None:
        transcript = self.speech.ingest_text(utterance.text)
        await self.publish_transcript(transcript)
        completed = self.speech.consume_if_final(transcript)
        if completed:
            await self.process_utterance(completed, source=utterance.source)

    async def process_utterance(self, text: str, source: str = "microphone") -> None:
        async with self._processing_lock:
            await self._record_conversation_message(role="user", content=text, source=source)
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
                await self._set_resting_state(goal="Awaiting approval", task="Listening for your voice", confidence=0.74)
                return
            await self._respond(text, memory_context, plan.confidence, action_result=action_result.summary if action_result.ok else "")

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
        else:
            await self._set_resting_state(goal="Awaiting next instruction", task="Listening for your voice", confidence=0.92)
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
            conversation_store=self.conversation_store_name,
            vector_memory="enabled" if isinstance(self.memory, QdrantMemoryStore) else "local fallback",
            llm_provider="openai" if isinstance(self.llm, EmbeddingProvider) else "local fallback",
            tts_provider="edge-tts neural",
            browser="enabled" if self.settings.enable_browser_actions else "disabled",
            monitoring="paused" if self.monitoring_paused else "active",
            connectors={**connector_status, "email_sending": "active" if self.email._configured else "not_configured"},
        )
        self.store.insert("system_status_snapshots", {"id": str(uuid4()), "payload": payload.model_dump(mode="json"), "created_at": datetime.now(timezone.utc).isoformat()})
        await self.publish_event("system.status", payload.model_dump(mode="json"))

    async def _respond(self, text: str, memory_context: list[str], confidence: float, prefix: str = "", action_result: str = "") -> None:
        try:
            response_text = self.llm.respond(text, memory_context, action_result=action_result)
        except Exception:
            logger.exception("LLM response failed; using fallback response")
            response_text = "I recorded the request, but the configured language provider is unavailable."
        response = self.personality.wrap_response(prefix + response_text)
        await self._set_state(AssistantState.SPEAKING, goal=text, task="Delivering response", confidence=confidence)
        await self._start_speech_output(response, self.active_conversation_id)
        await self._record_conversation_message(role="assistant", content=response, source="jarvis", status="queued")
        try:
            self.memory.remember("episodic", f"User asked: {text}", [response])
        except Exception:
            logger.exception("Memory write failed")

    def _on_microphone_utterance(self, text: str) -> None:
        if self.muted or self._speech_loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._handle_microphone_utterance(text), self._speech_loop)

    def _on_microphone_activity(self) -> None:
        if self.muted or self._speech_loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._handle_microphone_activity(), self._speech_loop)

    async def _handle_microphone_utterance(self, text: str) -> None:
        command = self._command_from_microphone_text(text)
        if command is None:
            return

        # If assistant is currently speaking, prevent laptop speaker self-echoing
        if self._speech_output_active:
            lowered = command.lower().strip(" .,!?\"'")
            if "friday" not in lowered and not text.lower().startswith("friday"):
                logger.info("Ignoring speaker self-echo while assistant is speaking: '%s'", command)
                return

            # Interrupt active speech output if user explicitly calls Friday
            speech_id = self._speech_playback_id
            self._speech_output_active = False
            self._speech_playback_id = None
            if speech_id:
                self._speech_audio.pop(speech_id, None)
                await self.publish_event("speech.interrupt", {"id": speech_id})
            if self._speech_playback_timeout_task:
                self._speech_playback_timeout_task.cancel()
                self._speech_playback_timeout_task = None

        if not command:
            await self.publish_transcript(
                TranscriptPayload(text=self.settings.hotword_phrase, is_final=True, source="wake_word", conversation_id=self.active_conversation_id)
            )
            await self._set_resting_state(
                goal="Wake word detected",
                task="Live Mode active (Listening for request)",
                confidence=0.96,
            )
            return
        transcript = TranscriptPayload(text=command, is_final=True, source="microphone", conversation_id=self.active_conversation_id)
        await self.publish_transcript(transcript)
        await self.process_utterance(command, source="microphone")

    async def _handle_microphone_activity(self) -> None:
        # Do not interrupt playback on raw audio energy (prevents stopping on mumbles/coughing).
        return

    def _command_from_microphone_text(self, text: str) -> str | None:
        cleaned = text.strip()
        if not cleaned:
            return None

        # Filter out Whisper noise hallucinations
        lowered = cleaned.lower().strip(" .,!?\"'")
        noise_phrases = {
            "ah", "right it", "take it", "you", "thank you", "subtitles", "subtitle by",
            "the end", "subscribe", "right", "like that", "so it's like", "i mean"
        }
        if lowered in noise_phrases or len(lowered) < 3:
            logger.info("Ignoring noise fragment: '%s'", cleaned)
            return None

        logger.info("Microphone transcribed: '%s'", cleaned)
        now = time.monotonic()
        timeout_sec = self.settings.hotword_follow_up_timeout_ms / 1000
        
        if self._follow_up_deadline is not None:
            if now <= self._follow_up_deadline:
                self._follow_up_deadline = now + timeout_sec
                return cleaned
            self._follow_up_deadline = None

        if not self.settings.hotword_enabled:
            self._follow_up_deadline = now + timeout_sec
            return cleaned

        phrase = self.settings.hotword_phrase.strip()
        if not phrase:
            self._follow_up_deadline = now + timeout_sec
            return cleaned

        patterns = [
            rf"\b{re.escape(phrase)}\b",
            r"\bhey\s+friday\b",
            r"\bhi\s+friday\b",
            r"\bok\s+friday\b",
            r"\bokay\s+friday\b",
            r"\bfry\s*day\b",
            r"\bfrida\b",
            r"\bf\.r\.i\.d\.a\.y\.\b",
        ]
        match = re.search("|".join(patterns), cleaned, flags=re.IGNORECASE)
        if match is None:
            logger.info("Ignoring transcript without wake word ('friday'): '%s'", cleaned)
            return None

        self._follow_up_deadline = now + timeout_sec
        command = cleaned[match.end():].lstrip(" ,.:;!?-")
        if command:
            return command
        return ""

    async def _start_speech_output(self, text: str, conversation_id: str | None) -> None:
        payload = SpeechOutputPayload(text=text, status="queued", conversation_id=conversation_id)
        if self._speech_playback_id:
            self._speech_audio.pop(self._speech_playback_id, None)
        try:
            synthesis = await asyncio.to_thread(self.tts.synthesize, text)
            audio = synthesis.get("audio")
            if isinstance(audio, bytes) and audio:
                content_type = str(synthesis.get("content_type", "audio/mpeg"))
                self._speech_audio[payload.id] = (audio, content_type)
                payload = payload.model_copy(update={"audio_url": f"/speech/{payload.id}"})
        except Exception:
            logger.exception("TTS provider preparation failed; using desktop voice fallback")
        self._speech_output_active = True
        self._speech_playback_id = payload.id
        if self._speech_playback_timeout_task:
            self._speech_playback_timeout_task.cancel()
        timeout_seconds = max(30.0, len(text.split()) / 1.2 + 10.0)
        self._speech_playback_timeout_task = asyncio.create_task(
            self._end_speech_after_timeout(payload.id, timeout_seconds)
        )
        await self.publish_event("speech.output", payload.model_dump(mode="json"))

    async def handle_speech_playback(self, payload: SpeechPlaybackPayload) -> None:
        if payload.id != self._speech_playback_id:
            return
        if payload.status == "playing":
            return
        self._speech_output_active = False
        self._speech_playback_id = None
        self._speech_audio.pop(payload.id, None)
        if self._speech_playback_timeout_task:
            self._speech_playback_timeout_task.cancel()
            self._speech_playback_timeout_task = None

        self._follow_up_deadline = time.monotonic() + self.settings.hotword_follow_up_timeout_ms / 1000

        task_status = "Live Mode active (Say anything)" if self._follow_up_deadline else "Say 'Friday' to begin"
        await self._set_resting_state(
            goal="Awaiting next instruction",
            task=task_status,
            confidence=0.95,
        )

    async def _end_speech_after_timeout(self, speech_id: str, timeout_seconds: float) -> None:
        try:
            await asyncio.sleep(timeout_seconds)
            if speech_id == self._speech_playback_id:
                await self.handle_speech_playback(SpeechPlaybackPayload(id=speech_id, status="completed"))
        except asyncio.CancelledError:
            return

    def get_speech_audio(self, speech_id: str) -> tuple[bytes, str] | None:
        return self._speech_audio.get(speech_id)

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

    async def _set_resting_state(self, goal: str, task: str, confidence: float) -> None:
        resting_state = AssistantState.LISTENING if self.settings.enable_microphone and not self.muted else AssistantState.IDLE
        if resting_state == AssistantState.LISTENING and self.settings.hotword_enabled:
            task = "Say 'Jarvis' to begin" if task == "Listening for your voice" else task
        await self._set_state(resting_state, goal=goal, task=task, confidence=confidence)

    async def publish_transcript(self, transcript: TranscriptPayload) -> None:
        await self.publish_event("transcript.segment", transcript.model_dump(mode="json"))

    async def publish_event(self, event_type: str, payload: dict) -> None:
        await self.events.publish(EventEnvelope(type=event_type, payload=payload))

    def _persist_plan_as_task(self, plan: PlanPayload) -> None:
        detail = ", ".join(step.title for step in plan.steps)
        task = TaskPayload(id=plan.id, title=plan.goal, status="running", detail=detail)
        self.store.insert("tasks", {"id": task.id, "title": task.title, "status": task.status, "detail": task.detail, "created_at": datetime.now(timezone.utc).isoformat()})

    async def _record_conversation_message(
        self,
        role: str,
        content: str,
        source: str,
        status: str | None = None,
        publish: bool = True,
    ) -> dict[str, Any]:
        if self.active_conversation_id is None:
            self.active_conversation_id = self.conversations.start_session("New conversation")["id"]
        record = self.conversations.append_message(
            conversation_id=self.active_conversation_id,
            role=role,
            content=content,
            source=source,
            status=status,
        )
        if publish:
            payload = ConversationMessagePayload(
                id=record["id"],
                conversation_id=record["conversation_id"],
                role=record["role"],
                content=record["content"],
                source=record["source"],
                status=record.get("status"),
                created_at=datetime.fromisoformat(record["created_at"]),
            )
            await self.publish_event("conversation.message", payload.model_dump(mode="json"))
        return record

    def list_conversation_sessions(self) -> list[dict[str, Any]]:
        return self.conversations.list_sessions()

    def list_conversation_messages(self, conversation_id: str) -> list[dict[str, Any]]:
        return self.conversations.list_messages(conversation_id)

    async def deliver_pending_greeting(self) -> None:
        if self._pending_greeting is None:
            return
        greeting = self._pending_greeting
        self._pending_greeting = None
        payload = ConversationMessagePayload(
            id=greeting["id"],
            conversation_id=greeting["conversation_id"],
            role=greeting["role"],
            content=greeting["content"],
            source=greeting["source"],
            status=greeting.get("status"),
            created_at=datetime.fromisoformat(greeting["created_at"]),
        )
        await self.publish_event("conversation.message", payload.model_dump(mode="json"))
        await self._start_speech_output(greeting["content"], greeting["conversation_id"])

    def _startup_greeting(self) -> str:
        hour = datetime.now().hour
        if hour < 12:
            part_of_day = "morning"
        elif hour < 17:
            part_of_day = "afternoon"
        else:
            part_of_day = "evening"
        return f"Good {part_of_day}. I am online, listening, and ready when you are."

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
        await self._set_resting_state(goal="Awaiting next instruction", task="Listening for your voice", confidence=0.95)
