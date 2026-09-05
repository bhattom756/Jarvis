import { useEffect, useRef, useState } from "react";
import { jarvisApi } from "../lib/jarvis-api";
import { useJarvisStore } from "../store";
import { sendUtteranceOverSocket } from "./useBackendSocket";

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    jarvisDesktop?: {
      toggleHud: () => Promise<boolean>;
      startNativeSpeechRecognition: () => Promise<{ started: boolean; error?: string }>;
      stopNativeSpeechRecognition: () => Promise<{ stopped: boolean }>;
      onNativeSpeechRecognition: (listener: (event: { type: string; text?: string; message?: string }) => void) => () => void;
    };
  }
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

const SMART_PAUSE_DEBOUNCE_MS = 700;

export function useSpeechRecognition() {
  const [isMicActive, setIsMicActive] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const currentState = useJarvisStore((state) => state.state);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldListenRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const accumTextRef = useRef("");
  const pauseTimerRef = useRef<number | null>(null);

  const clearPauseTimer = () => {
    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  };

  const interruptPlayback = () => {
    window.dispatchEvent(new CustomEvent("jarvis:barge-in"));
  };

  const submitSpokenUtterance = (rawText?: string) => {
    const textToSubmit = (rawText ?? accumTextRef.current).trim();
    accumTextRef.current = "";
    setTranscript("");
    clearPauseTimer();

    if (!textToSubmit || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    interruptPlayback();
    console.info("🎤 [LIVE VOICE INPUT] Submitting spoken text:", textToSubmit);

    const sentOverSocket = sendUtteranceOverSocket(textToSubmit, "speech");
    if (!sentOverSocket) {
      void jarvisApi
        .submitUtterance({ text: textToSubmit, source: "speech" })
        .catch((err: unknown) => {
          console.error("Failed to submit speech input:", err);
          setError("Failed to reach FRIDAY core service.");
        });
    }

    window.setTimeout(() => {
      isSubmittingRef.current = false;
    }, 300);
  };

  useEffect(() => {
    shouldListenRef.current = isMicActive;
  }, [isMicActive]);

  useEffect(() => {
    let disposed = false;

    // ----------------------------------------------------
    // STRATEGY 1: NATIVE WINDOWS DESKTOP SPEECH RECOGNITION
    // ----------------------------------------------------
    if (window.jarvisDesktop?.onNativeSpeechRecognition) {
      console.info("🎙️ Connecting to Native Windows Desktop Speech Engine...");
      setIsListening(true);
      setError(null);

      void window.jarvisDesktop.startNativeSpeechRecognition().then((res) => {
        if (!res.started && res.error) {
          console.warn("Native Windows Speech failed to start:", res.error);
        }
      });

      const unsubscribe = window.jarvisDesktop.onNativeSpeechRecognition((payload) => {
        if (disposed || !shouldListenRef.current) return;

        if (payload.type === "ready") {
          setIsListening(true);
          setError(null);
        } else if (payload.type === "final" && payload.text) {
          const spokenText = payload.text.trim();
          console.info("🗣️ [NATIVE MIC HEARD]:", spokenText);
          setTranscript(spokenText);
          if (currentState === "SPEAKING") {
            interruptPlayback();
          }
          submitSpokenUtterance(spokenText);
        } else if (payload.type === "error" && payload.message) {
          console.warn("Native mic error:", payload.message);
          setError(payload.message);
        }
      });

      return () => {
        disposed = true;
        unsubscribe();
        void window.jarvisDesktop?.stopNativeSpeechRecognition();
      };
    }

    // ----------------------------------------------------
    // STRATEGY 2: WEB SPEECH API (Browser Fallback)
    // ----------------------------------------------------
    const SpeechRecognitionAPI = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setError("Speech recognition is not supported in this browser environment.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      if (disposed) return;
      setIsListening(true);
      setError(null);
      console.info("🎙️ [WEB MIC ACTIVE] Browser microphone listening...");
    };

    recognition.onend = () => {
      if (disposed) return;
      setIsListening(false);
      if (shouldListenRef.current && !disposed) {
        window.setTimeout(() => {
          try {
            if (shouldListenRef.current && !disposed) {
              recognition.start();
            }
          } catch {
            // Already started
          }
        }, 150);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      console.warn("🎤 [MIC ERROR]:", event.error);
      if (event.error === "not-allowed") {
        setError("Microphone permission denied.");
      }
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        const text = res?.[0]?.transcript ?? "";
        if (!text) continue;

        if (res.isFinal) {
          final += ` ${text}`;
        } else {
          interim += ` ${text}`;
        }
      }

      if (final.trim()) {
        accumTextRef.current = `${accumTextRef.current} ${final}`.trim();
      }

      const currentSpeech = (accumTextRef.current + " " + interim).trim();
      if (!currentSpeech) return;

      setTranscript(currentSpeech);

      if (currentState === "SPEAKING") {
        interruptPlayback();
      }

      clearPauseTimer();
      pauseTimerRef.current = window.setTimeout(() => submitSpokenUtterance(), SMART_PAUSE_DEBOUNCE_MS);
    };

    // Request stream without track stopping
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then(() => {
        if (!disposed && shouldListenRef.current) {
          try {
            recognition.start();
          } catch {
            // Already started
          }
        }
      })
      .catch((err) => {
        console.warn("Microphone access failed:", err);
        setError("Microphone access denied or unavailable.");
      });

    return () => {
      disposed = true;
      clearPauseTimer();
      try {
        recognition.stop();
      } catch {
        // Recognition already stopped
      }
      recognitionRef.current = null;
    };
  }, []);

  const toggleMic = () => {
    const nextState = !isMicActive;
    setIsMicActive(nextState);
    shouldListenRef.current = nextState;

    if (!nextState) {
      clearPauseTimer();
      accumTextRef.current = "";
      setTranscript("");
      if (window.jarvisDesktop?.stopNativeSpeechRecognition) {
        void window.jarvisDesktop.stopNativeSpeechRecognition();
      }
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
    } else {
      setError(null);
      if (window.jarvisDesktop?.startNativeSpeechRecognition) {
        void window.jarvisDesktop.startNativeSpeechRecognition();
      }
      try {
        recognitionRef.current?.start();
      } catch {
        // Ignore
      }
    }
  };

  return { isMicActive, isListening, transcript, error, toggleMic };
}
