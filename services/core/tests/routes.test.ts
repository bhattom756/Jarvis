import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("@jarvis/core routes", () => {
  it("preserves the health endpoint", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, service: "jarvis-core", state: "IDLE" });
  });

  it("normalizes validation errors", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "POST", url: "/utterances", payload: { text: "" } });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({
      code: "VALIDATION_ERROR",
      recoverable: true,
    });
  });

  it("returns conversation bootstrap data", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/conversations" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().sessions).toHaveLength(1);
  });
});

