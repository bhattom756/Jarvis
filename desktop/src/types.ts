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

export interface TimelineRecord {
  id: string;
  goal?: string;
  summary?: string;
  detail?: string;
  category?: string;
  title?: string;
  status?: string;
  source?: string;
  severity?: string;
  risk_level?: string;
  created_at?: string;
}
