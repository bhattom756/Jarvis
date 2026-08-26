import { describe, expect, it } from "vitest";
import {
  desktopWebSocketMessageSchema,
  errorEnvelopeSchema,
  eventEnvelopeSchema,
  healthResponseSchema,
  userUtteranceSchema,
} from "./index.js";

describe("@jarvis/protocol", () => {
  it("validates event envelopes", () => {
    expect(() =>
      eventEnvelopeSchema.parse({
        type: "system.status",
        timestamp: new Date().toISOString(),
        payload: {},
      }),
    ).not.toThrow();
  });

  it("rejects empty utterances", () => {
    expect(() => userUtteranceSchema.parse({ text: "" })).toThrow();
  });

  it("validates websocket client messages", () => {
    const parsed = desktopWebSocketMessageSchema.parse({
      type: "speech.playback",
      payload: { id: "speech-1", status: "completed" },
    });
    expect(parsed.type).toBe("speech.playback");
    if (parsed.type === "speech.playback") {
      expect(parsed.payload.status).toBe("completed");
    }
  });

  it("keeps the shared error envelope stable", () => {
    expect(errorEnvelopeSchema.parse({ code: "X", message: "Failed", recoverable: false })).toEqual({
      code: "X",
      message: "Failed",
      recoverable: false,
    });
  });

  it("validates health responses", () => {
    expect(healthResponseSchema.parse({ ok: true, service: "jarvis-core", state: "IDLE" }).state).toBe("IDLE");
  });
});

