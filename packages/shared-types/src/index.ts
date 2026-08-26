export type AssistantState =
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "RESEARCHING"
  | "EXECUTING"
  | "MONITORING"
  | "LEARNING"
  | "SPEAKING";

export type EventType =
  | "assistant.state"
  | "conversation.message"
  | "transcript.segment"
  | "plan.updated"
  | "task.updated"
  | "activity.logged"
  | "memory.updated"
  | "monitoring.alert"
  | "confirmation.requested"
  | "confirmation.resolved"
  | "speech.output"
  | "speech.interrupt"
  | "system.status"
  | "error.reported";

export interface EventEnvelope<TPayload = unknown> {
  type: EventType | string;
  timestamp: string;
  payload: TPayload;
}

export type JarvisEvent<TPayload = unknown> = EventEnvelope<TPayload>;

export interface AssistantStatePayload {
  state: AssistantState;
  goal?: string | null;
  task?: string | null;
  confidence: number;
}

export interface TranscriptPayload {
  text: string;
  is_final?: boolean;
  source?: string;
  conversation_id?: string | null;
}

export interface PlanStep {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
}

export interface PlanPayload {
  id: string;
  goal: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  currentStepId?: string;
  current_step_id?: string | null;
  confidence: number;
  requiresConfirmation: boolean;
  requires_confirmation?: boolean;
  steps: PlanStep[];
}

export interface TaskPayload {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  detail?: string | null;
}

export interface ActivityPayload {
  id: string;
  category: string;
  summary: string;
  detail?: string | null;
  taskId?: string;
  task_id?: string | null;
}

export interface MemoryPayload {
  scope: "short_term" | "episodic" | "long_term";
  summary: string;
  items: string[];
}

export interface MonitoringPayload {
  source: string;
  severity: "info" | "warning" | "critical";
  summary: string;
  detail?: string | null;
}

export interface ConfirmationPayload {
  id: string;
  category: string;
  riskLevel?: "low" | "medium" | "high";
  risk_level?: "low" | "medium" | "high";
  summary: string;
  reversible: boolean;
  expiresAt?: string | null;
  expires_at?: string | null;
  status: "pending" | "approved" | "denied";
}

export interface SpeechOutputPayload {
  id: string;
  text: string;
  voice: string;
  status: "queued" | "playing" | "completed" | "failed";
  conversation_id?: string | null;
  audio_url?: string | null;
}

export interface SpeechPlaybackPayload {
  id: string;
  status: "playing" | "completed" | "cancelled" | "failed";
}

export interface ConversationSession {
  id: string;
  title: string;
  preview?: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: "assistant" | "user" | "system";
  content: string;
  source: string;
  status?: string | null;
  created_at: string;
}

export interface SystemStatus {
  microphone?: string;
  memory_db?: string;
  conversation_store?: string;
  vector_memory?: string;
  llm_provider?: string;
  tts_provider?: string;
  browser?: string;
  monitoring?: string;
  connectors?: Record<string, string>;
  speech_error?: string | null;
}

export interface UserUtterance {
  text: string;
  source?: string;
}

export interface ConfirmationDecision {
  approved: boolean;
}

export interface EmailDraftRequest {
  recipients: string[];
  subject: string;
  body: string;
  attachments?: string[];
}

export interface ActionResult {
  ok: boolean;
  summary: string;
  detail?: string | null;
  confirmation?: ConfirmationPayload | null;
}

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  label: string;
  platform: "desktop" | "mobile" | "core" | "unknown";
  createdAt: string;
}
