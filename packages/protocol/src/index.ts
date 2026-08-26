import { z } from "zod";

export const assistantStateSchema = z.enum([
  "IDLE",
  "LISTENING",
  "THINKING",
  "RESEARCHING",
  "EXECUTING",
  "MONITORING",
  "LEARNING",
  "SPEAKING",
]);

export const eventTypeSchema = z.enum([
  "assistant.state",
  "conversation.message",
  "transcript.segment",
  "plan.updated",
  "task.updated",
  "activity.logged",
  "memory.updated",
  "monitoring.alert",
  "confirmation.requested",
  "confirmation.resolved",
  "speech.output",
  "speech.interrupt",
  "system.status",
  "error.reported",
]);

export const eventEnvelopeSchema = z.object({
  type: z.union([eventTypeSchema, z.string().min(1)]),
  timestamp: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export const errorEnvelopeSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().optional(),
  cause: z.unknown().optional(),
  recoverable: z.boolean(),
});

export const userUtteranceSchema = z.object({
  text: z.string().trim().min(1),
  source: z.string().trim().min(1).default("manual"),
});

export const confirmationDecisionSchema = z.object({
  approved: z.boolean(),
});

export const emailDraftRequestSchema = z.object({
  recipients: z.array(z.string().trim().min(1)).min(1),
  subject: z.string().trim().min(1).max(250),
  body: z.string().trim().min(1).max(50_000),
  attachments: z.array(z.string()).max(10).default([]),
});

export const speechPlaybackSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["playing", "completed", "cancelled", "failed"]),
});

export const desktopWebSocketMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("utterance.submit"),
    payload: userUtteranceSchema,
  }),
  z.object({
    type: z.literal("confirmation.resolve"),
    payload: confirmationDecisionSchema.extend({ id: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("speech.playback"),
    payload: speechPlaybackSchema,
  }),
]);

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  state: assistantStateSchema,
});

export const configResponseSchema = z.object({
  backend_url: z.string(),
  monitoring_enabled: z.boolean(),
  browser_actions_enabled: z.boolean(),
  windows_actions_enabled: z.boolean(),
});

export type DesktopWebSocketMessage = z.infer<typeof desktopWebSocketMessageSchema>;
