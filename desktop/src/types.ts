export type AssistantState =
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "RESEARCHING"
  | "EXECUTING"
  | "MONITORING"
  | "LEARNING"
  | "SPEAKING";

export interface EventEnvelope {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
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
