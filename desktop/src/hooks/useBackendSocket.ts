import { useEffect } from "react";
import { useJarvisStore } from "../store";
import type { EventEnvelope, TimelineRecord } from "../types";

const BACKEND_HTTP_URL = import.meta.env.VITE_JARVIS_BACKEND_URL ?? "http://127.0.0.1:8000";
const BACKEND_WS_URL = BACKEND_HTTP_URL.replace(/^http/, "ws") + "/ws/desktop";

export function useBackendSocket(): void {
  const setConnected = useJarvisStore((state) => state.setConnected);
  const applyEvent = useJarvisStore((state) => state.applyEvent);
  const setTimeline = useJarvisStore((state) => state.setTimeline);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let attempts = 0;
    let closed = false;

    void fetch(`${BACKEND_HTTP_URL}/timeline`)
      .then((response) => response.json())
      .then((timeline) => setTimeline(timeline as Record<string, TimelineRecord[]>))
      .catch(() => undefined);

    const connect = () => {
      socket = new WebSocket(BACKEND_WS_URL);
      socket.addEventListener("open", () => {
        attempts = 0;
        setConnected(true);
      });
      socket.addEventListener("close", () => {
        setConnected(false);
        if (!closed) {
          const delay = Math.min(15_000, 500 * 2 ** attempts++);
          reconnectTimer = window.setTimeout(connect, delay);
        }
      });
      socket.addEventListener("message", (message) => {
        try {
          applyEvent(JSON.parse(message.data) as EventEnvelope);
        } catch {
          // A malformed event must not take down the dashboard stream.
        }
      });
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [applyEvent, setConnected, setTimeline]);
}
