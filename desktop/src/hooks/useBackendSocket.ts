import { useEffect } from "react";
import { useJarvisStore } from "../store";
import type { ConversationMessage, ConversationSession, EventEnvelope } from "../types";

const BACKEND_HTTP_URL = import.meta.env.VITE_JARVIS_BACKEND_URL ?? "http://127.0.0.1:8000";
const BACKEND_WS_URL = BACKEND_HTTP_URL.replace(/^http/, "ws") + "/ws/desktop";

export function useBackendSocket(): void {
  const setConnected = useJarvisStore((state) => state.setConnected);
  const applyEvent = useJarvisStore((state) => state.applyEvent);
  const setConversationBootstrap = useJarvisStore((state) => state.setConversationBootstrap);
  const setConversationMessages = useJarvisStore((state) => state.setConversationMessages);
  const activeConversationId = useJarvisStore((state) => state.activeConversationId);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let attempts = 0;
    let closed = false;
    let activeSpeechId: string | null = null;
    let activeAudio: HTMLAudioElement | null = null;

    const sendPlayback = (id: string, status: "playing" | "completed" | "cancelled" | "failed") => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "speech.playback", payload: { id, status } }));
      }
    };

    const stopSpeaking = (id?: string) => {
      const speechId = id || activeSpeechId;
      if (activeAudio) {
        try {
          activeAudio.pause();
          activeAudio.currentTime = 0;
        } catch {
          // ignore audio pause error
        }
        activeAudio = null;
      }
      window.speechSynthesis.cancel();
      if (speechId) {
        sendPlayback(speechId, "cancelled");
      }
      activeSpeechId = null;
    };

    const finishSpeech = (id: string, status: "completed" | "failed") => {
      if (activeSpeechId !== id) {
        return;
      }
      activeSpeechId = null;
      activeAudio = null;
      sendPlayback(id, status);
    };

    const speak = (id: string, text: string, audioUrl: string | null) => {
      if (!id || !text.trim()) {
        if (id) {
          sendPlayback(id, "failed");
        }
        return;
      }
      stopSpeaking();
      activeSpeechId = id;
      if (audioUrl) {
        const audio = new Audio(`${BACKEND_HTTP_URL}${audioUrl}`);
        activeAudio = audio;
        audio.onplay = () => sendPlayback(id, "playing");
        audio.onended = () => finishSpeech(id, "completed");
        audio.onerror = () => finishSpeech(id, "failed");
        void audio.play().catch(() => finishSpeech(id, "failed"));
        return;
      }
      if (!("speechSynthesis" in window)) {
        finishSpeech(id, "failed");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.96;
      utterance.pitch = 0.9;
      utterance.volume = 1;
      utterance.onstart = () => sendPlayback(id, "playing");
      utterance.onend = () => {
        finishSpeech(id, "completed");
      };
      utterance.onerror = () => {
        finishSpeech(id, "failed");
      };
      window.speechSynthesis.speak(utterance);
    };



    const loadSessions = async () => {
      const response = await fetch(`${BACKEND_HTTP_URL}/conversations`);
      const payload = (await response.json()) as {
        active_session_id: string | null;
        sessions: ConversationSession[];
      };
      setConversationBootstrap(payload.active_session_id, payload.sessions);
      if (payload.active_session_id) {
        const messagesResponse = await fetch(`${BACKEND_HTTP_URL}/conversations/${payload.active_session_id}`);
        const messagesPayload = (await messagesResponse.json()) as {
          conversation_id: string;
          messages: ConversationMessage[];
        };
        setConversationMessages(messagesPayload.conversation_id, messagesPayload.messages);
      }
    };

    void loadSessions().catch(() => undefined);

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
          const event = JSON.parse(message.data) as EventEnvelope;
          applyEvent(event);
          if (event.type === "speech.output") {
            speak(
              String(event.payload.id ?? ""),
              String(event.payload.text ?? ""),
              typeof event.payload.audio_url === "string" ? event.payload.audio_url : null,
            );
          }
          if (event.type === "speech.interrupt") {
            stopSpeaking(String(event.payload.id ?? ""));
          }
        } catch {
          // Ignore malformed websocket frames.
        }
      });
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      stopSpeaking();
      socket?.close();
    };
  }, [applyEvent, setConnected, setConversationBootstrap, setConversationMessages]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    void fetch(`${BACKEND_HTTP_URL}/conversations/${activeConversationId}`)
      .then((response) => response.json())
      .then((payload: { conversation_id: string; messages: ConversationMessage[] }) => {
        setConversationMessages(payload.conversation_id, payload.messages);
      })
      .catch(() => undefined);
  }, [activeConversationId, setConversationMessages]);
}
