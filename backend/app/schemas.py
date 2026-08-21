from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AssistantState(str, Enum):
    IDLE = "IDLE"
    LISTENING = "LISTENING"
    THINKING = "THINKING"
    RESEARCHING = "RESEARCHING"
    EXECUTING = "EXECUTING"
    MONITORING = "MONITORING"
    LEARNING = "LEARNING"
    SPEAKING = "SPEAKING"


class EventEnvelope(BaseModel):
    type: str
    timestamp: datetime = Field(default_factory=utc_now)
    payload: dict[str, Any]


class AssistantStatePayload(BaseModel):
    state: AssistantState
    goal: str | None = None
    task: str | None = None
    confidence: float = 0.0


class TranscriptPayload(BaseModel):
    text: str
    is_final: bool = False
    source: str = "microphone"


class PlanStep(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    status: Literal["pending", "in_progress", "completed", "blocked"] = "pending"


class PlanPayload(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    goal: str
    status: Literal["pending", "in_progress", "completed", "blocked"] = "pending"
    current_step_id: str | None = None
    confidence: float = 0.0
    requires_confirmation: bool = False
    steps: list[PlanStep]


class TaskPayload(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    status: Literal["pending", "running", "completed", "failed"] = "pending"
    detail: str | None = None


class ActivityPayload(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    category: str
    summary: str
    detail: str | None = None
    task_id: str | None = None


class MemoryPayload(BaseModel):
    scope: Literal["short_term", "episodic", "long_term"]
    summary: str
    items: list[str] = Field(default_factory=list)


class MonitoringPayload(BaseModel):
    source: str
    severity: Literal["info", "warning", "critical"] = "info"
    summary: str
    detail: str | None = None


class ConfirmationPayload(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    category: str
    risk_level: Literal["low", "medium", "high"]
    summary: str
    reversible: bool = False
    expires_at: datetime | None = None
    status: Literal["pending", "approved", "denied"] = "pending"


class SpeechOutputPayload(BaseModel):
    text: str
    voice: str = "jarvis"
    status: Literal["queued", "playing", "completed", "failed"] = "queued"


class SystemStatusPayload(BaseModel):
    microphone: str = "unknown"
    memory_db: str = "unknown"
    vector_memory: str = "unknown"
    llm_provider: str = "unknown"
    tts_provider: str = "unknown"
    connectors: dict[str, str] = Field(default_factory=dict)
    speech_error: str | None = None
    browser: str = "unknown"
    monitoring: str = "unknown"


class UserUtterance(BaseModel):
    text: str
    source: str = "manual"


class ConfirmationDecision(BaseModel):
    approved: bool


class EmailDraftRequest(BaseModel):
    recipients: list[str] = Field(min_length=1)
    subject: str = Field(min_length=1, max_length=250)
    body: str = Field(min_length=1, max_length=50_000)
    attachments: list[str] = Field(default_factory=list, max_length=10)


class ActionResult(BaseModel):
    ok: bool
    summary: str
    detail: str | None = None
    confirmation: ConfirmationPayload | None = None
