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
  | "system.status";

export interface JarvisEvent<TPayload = Record<string, unknown>> {
  type: EventType;
  timestamp: string;
  payload: TPayload;
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
  confidence: number;
  requiresConfirmation: boolean;
  steps: PlanStep[];
}

export interface ActivityPayload {
  id: string;
  category: string;
  summary: string;
  detail?: string;
  taskId?: string;
}

export interface ConfirmationPayload {
  id: string;
  category: string;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  reversible: boolean;
  expiresAt?: string;
  status: "pending" | "approved" | "denied";
}
