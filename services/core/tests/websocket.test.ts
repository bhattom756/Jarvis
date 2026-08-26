import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

function onceMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.addEventListener(
      "message",
      (event) => {
        resolve(JSON.parse(String(event.data)));
      },
      { once: true },
    );
    socket.addEventListener("error", reject, { once: true });
  });
}

describe("@jarvis/core websocket", () => {
  it("sends an error envelope for malformed websocket messages", async () => {
    const app = await createApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address");
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws/desktop`);
    await onceMessage(socket);
    socket.send("{");
    const message = await onceMessage(socket);

    socket.close();
    await app.close();

    expect(message).toMatchObject({
      type: "error.reported",
      payload: {
        code: "INVALID_WEBSOCKET_MESSAGE",
        recoverable: true,
      },
    });
  });
});
