import { useEffect } from "react";
import { jarvisApi, jarvisBackendUrls } from "../lib/jarvis-api";
import { useJarvisStore } from "../store";
import type { ConversationMessage, ConversationSession, EventEnvelope } from "../types";

const BACKEND_HTTP_URL = jarvisBackendUrls.httpUrl;
const BACKEND_WS_URL = jarvisBackendUrls.desktopWsUrl;

let activeSocket: WebSocket | undefined;

export function sendUtteranceOverSocket(text: string, source = "desktop"): boolean {
  if (activeSocket?.readyState === WebSocket.OPEN) {
    activeSocket.send(JSON.stringify({ type: "utterance.submit", payload: { text, source } }));
    return true;
  }
  return false;
}

export function useBackendSocket(options: { playSpeech?: boolean } = {}): void {
  const playSpeech = options.playSpeech ?? true;
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

    const fallbackSpeechSynthesis = (id: string, text: string) => {
      if (!("speechSynthesis" in window)) {
        finishSpeech(id, "failed");
        return;
      }

      try {
        window.speechSynthesis.resume();
      } catch {
        // ignore
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 0.95;
      utterance.volume = 1.0;

      const setVoiceAndPlay = () => {
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice =
          voices.find((v) =>
            /zira|female|samantha|victoria|karen|veena|fiona|hazel|susan|eva|google UK english female/i.test(v.name),
          ) ||
          voices.find((v) => v.lang.startsWith("en") && !/david|mark|george|male/i.test(v.name)) ||
          voices[0];

        if (femaleVoice) {
          utterance.voice = femaleVoice;
        }
        utterance.onstart = () => sendPlayback(id, "playing");
        utterance.onend = () => finishSpeech(id, "completed");
        utterance.onerror = () => finishSpeech(id, "failed");
        try {
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(utterance);
        } catch {
          finishSpeech(id, "failed");
        }
      };

      if (window.speechSynthesis.getVoices().length > 0) {
        setVoiceAndPlay();
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          setVoiceAndPlay();
        };
        window.setTimeout(setVoiceAndPlay, 100);
      }
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

      if (text.length < 250) {
        try {
          const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(text)}`;
          const audio = new Audio(ttsUrl);
          activeAudio = audio;
          audio.onplay = () => sendPlayback(id, "playing");
          audio.onended = () => finishSpeech(id, "completed");
          audio.onerror = () => {
            fallbackSpeechSynthesis(id, text);
          };
          void audio.play().catch(() => {
            fallbackSpeechSynthesis(id, text);
          });
          return;
        } catch {
          // Fall through
        }
      }

      fallbackSpeechSynthesis(id, text);
    };

    const onBargeIn = () => stopSpeaking();
    if (playSpeech) {
      window.addEventListener("jarvis:barge-in", onBargeIn);
    }



    const loadSessions = async () => {
      const payload = await jarvisApi.conversations();
      setConversationBootstrap(payload.active_session_id, payload.sessions);
      if (payload.active_session_id) {
        const messagesPayload = await jarvisApi.conversationMessages(payload.active_session_id);
        setConversationMessages(messagesPayload.conversation_id, messagesPayload.messages);
      }
    };

    void loadSessions().catch(() => undefined);

    const connect = () => {
      socket = new WebSocket(BACKEND_WS_URL);
      if (playSpeech) {
        activeSocket = socket;
      }
      socket.addEventListener("open", () => {
        attempts = 0;
        setConnected(true);
      });
      socket.addEventListener("close", () => {
        if (activeSocket === socket) {
          activeSocket = undefined;
        }
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
          if (playSpeech && event.type === "speech.output") {
            speak(
              String(event.payload.id ?? ""),
              String(event.payload.text ?? ""),
              typeof event.payload.audio_url === "string" ? event.payload.audio_url : null,
            );
          }
          if (playSpeech && event.type === "speech.interrupt") {
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
      if (activeSocket === socket) {
        activeSocket = undefined;
      }
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      stopSpeaking();
      if (playSpeech) {
        window.removeEventListener("jarvis:barge-in", onBargeIn);
      }
      socket?.close();
    };
  }, [applyEvent, playSpeech, setConnected, setConversationBootstrap, setConversationMessages]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    void jarvisApi
      .conversationMessages(activeConversationId)
      .then((payload: { conversation_id: string; messages: ConversationMessage[] }) => {
        setConversationMessages(payload.conversation_id, payload.messages);
      })
      .catch(() => undefined);
  }, [activeConversationId, setConversationMessages]);
}
