import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { JarvisError, toErrorEnvelope } from "@jarvis/errors";
import { createLogger } from "@jarvis/logger";
import {
  confirmationDecisionSchema,
  desktopWebSocketMessageSchema,
  emailDraftRequestSchema,
  userUtteranceSchema,
} from "@jarvis/protocol";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { createCoreState, type CoreState } from "./state.js";

const logger = createLogger("core");

export interface CreateAppOptions {
  state?: CoreState;
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const state = options.state ?? createCoreState();
  const clients = new Set<{ send: (data: string) => void }>();
  let initialGreetingSent = false;

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
  });
  await app.register(websocket);

  function broadcast(event: unknown) {
    const payload = JSON.stringify(event);
    for (const client of clients) {
      try {
        client.send(payload);
      } catch (error) {
        logger.error("Failed to broadcast websocket event", error);
        clients.delete(client);
      }
    }
  }

  app.setErrorHandler((error, request, reply) => {
    const normalized =
      error instanceof ZodError
        ? new JarvisError("VALIDATION_ERROR", "Request payload failed validation.", {
            statusCode: 400,
            recoverable: true,
            cause: error.issues,
          })
        : error;
    const envelope = toErrorEnvelope(normalized, request.id);
    const statusCode = normalized instanceof JarvisError ? normalized.statusCode : 500;
    logger.error("HTTP request failed", normalized, { requestId: request.id, url: request.url });
    void reply.status(statusCode).send({ error: envelope });
  });

  app.get("/health", async () => ({
    ok: true,
    service: "jarvis-core",
    state: state.assistantState,
  }));

  app.get("/config", async () => ({
    backend_url: "http://127.0.0.1:8000",
    monitoring_enabled: false,
    browser_actions_enabled: false,
    windows_actions_enabled: false,
  }));

  app.get("/connectors", async () => state.systemStatus.connectors ?? {});

  app.post("/utterances", async (request) => {
    const utterance = userUtteranceSchema.parse(request.body);
    void state.ingestUtterance(utterance, broadcast);
    return { accepted: true };
  });

  app.post("/emails/send", async (request) => {
    emailDraftRequestSchema.parse(request.body);
    return {
      accepted: false,
      summary: "Email sending is pending migration to the TypeScript core service.",
      confirmation: null,
    };
  });

  app.get("/emails/unread", async () => ({
    messages: [],
    error: "Email monitoring is pending migration to the TypeScript core service.",
  }));

  app.post("/confirmations/:confirmationId", async (request) => {
    confirmationDecisionSchema.parse(request.body);
    const confirmationId = (request.params as { confirmationId: string }).confirmationId;
    return { resolved: false, payload: null, confirmation_id: confirmationId };
  });

  app.post("/controls/mute", async (request) => {
    const muted = Boolean((request.body as { muted?: unknown } | null)?.muted);
    state.systemStatus.microphone = muted ? "muted" : "not_connected";
    broadcast({ type: "system.status", timestamp: new Date().toISOString(), payload: state.systemStatus });
    return { ok: true, muted };
  });

  app.post("/controls/monitoring", async (request) => {
    const paused = Boolean((request.body as { paused?: unknown } | null)?.paused);
    state.systemStatus.monitoring = paused ? "paused" : "active";
    broadcast({ type: "system.status", timestamp: new Date().toISOString(), payload: state.systemStatus });
    return { ok: true, paused };
  });

  app.get("/timeline", async () => ({
    activities: [],
    tasks: [],
    conversations: state.sessions,
    confirmations: [],
    system: [{ payload: state.systemStatus, created_at: new Date().toISOString() }],
  }));

  app.get("/conversations", async () => ({
    active_session_id: state.activeConversationId,
    sessions: state.sessions,
  }));

  app.get("/conversations/:conversationId", async (request) => {
    const conversationId = (request.params as { conversationId: string }).conversationId;
    return {
      conversation_id: conversationId,
      messages: state.messages[conversationId] ?? [],
    };
  });

  app.get("/speech/:speechId", async () => {
    throw new JarvisError("SPEECH_AUDIO_NOT_FOUND", "Speech audio is not available in the TypeScript core shell.", {
      statusCode: 404,
      recoverable: true,
    });
  });

  app.get("/ws/desktop", { websocket: true }, (socket) => {
    clients.add(socket);

    // Send system status
    socket.send(JSON.stringify({ type: "system.status", timestamp: new Date().toISOString(), payload: state.systemStatus }));

    state.getInitialGreetingEvents().forEach((event) => {
      socket.send(JSON.stringify(event));
    });

    socket.on("message", (rawMessage: Buffer | string | { toString: () => string }) => {
      try {
        const parsed = desktopWebSocketMessageSchema.parse(JSON.parse(rawMessage.toString()));

        if (parsed.type === "utterance.submit") {
          void state.ingestUtterance(parsed.payload, broadcast);
        }

        if (parsed.type === "speech.playback") {
          if (parsed.payload.status === "completed" || parsed.payload.status === "cancelled") {
            const idleEvent = {
              type: "assistant.state",
              timestamp: new Date().toISOString(),
              payload: {
                state: "LISTENING",
                goal: "Active 8-second conversation window",
                task: "Listening for follow-up prompt",
                confidence: 1.0,
              },
            };
            broadcast(idleEvent);
          }
        }
      } catch (error) {
        logger.error("❌ Invalid WebSocket message received", error);
        socket.send(
          JSON.stringify({
            type: "error.reported",
            timestamp: new Date().toISOString(),
            payload: toErrorEnvelope(
              new JarvisError("INVALID_WEBSOCKET_MESSAGE", "Desktop websocket message failed validation.", {
                recoverable: true,
                cause: error instanceof Error ? error.message : error,
              }),
            ),
          }),
        );
      }
    });

    socket.on("close", () => {
      clients.delete(socket);
    });
  });

  return app;
}
