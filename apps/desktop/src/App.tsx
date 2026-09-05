import { useEffect, useMemo, useRef, useState } from "react";
import { HudView } from "./components/HudView";
import { JarvisHologram } from "./components/JarvisHologram";
import { WindowControls } from "./components/WindowControls";
import { sendUtteranceOverSocket, useBackendSocket } from "./hooks/useBackendSocket";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useJarvisStore } from "./store";
import type { ConversationMessage, ConversationSession } from "./types";

import { jarvisApi } from "./lib/jarvis-api";

function dayLabel(value: string) {
  const createdAt = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfCreated = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
  const diff = Math.round((startOfToday.getTime() - startOfCreated.getTime()) / 86_400_000);

  if (diff <= 0) return "Today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function SessionListItem(props: {
  session: ConversationSession;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`no-drag w-full rounded-[1.4rem] border px-4 py-3 text-left transition ${
        props.active
          ? "border-sky-300/60 bg-gradient-to-r from-sky-400/20 to-cyan-500/15 backdrop-blur-md shadow-[0_0_25px_rgba(56,189,248,0.25)] text-white"
          : "border-white/10 bg-slate-950/30 backdrop-blur-sm hover:border-sky-400/35 hover:bg-slate-900/40 text-slate-200"
      }`}
      onClick={props.onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-100">{dayLabel(props.session.created_at)}</span>
        <span className="text-[11px] uppercase tracking-[0.24em] text-sky-200/75 font-mono">
          {timeLabel(props.session.updated_at)}
        </span>
      </div>
      <div className="mt-2 line-clamp-2 text-sm text-slate-300">
        {props.session.preview || props.session.title}
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="rounded-full border border-sky-300/30 bg-sky-400/15 backdrop-blur-md px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-sky-100 shadow-[0_4px_15px_rgba(0,0,0,0.2)]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-[1.6rem] border px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur-md ${
          isUser
            ? "border-sky-300/50 bg-gradient-to-br from-sky-400/25 via-cyan-500/15 to-blue-600/10 text-sky-50"
            : "border-white/12 bg-slate-950/70 text-slate-100"
        }`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-sky-300">
            {isUser ? "User" : "Friday"}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">{timeLabel(message.created_at)}</span>
        </div>
        <div className="whitespace-pre-wrap text-[15px] leading-7">{message.content}</div>
      </div>
    </div>
  );
}

export function App() {
  if (window.location.hash === "#hud") {
    return <HudApp />;
  }

  return <DashboardApp />;
}

function HudApp() {
  const [socketReady, setSocketReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSocketReady(true), 1_000);
    return () => window.clearTimeout(timer);
  }, []);

  if (socketReady) {
    return <HudSocketView />;
  }
  return <HudView />;
}

function HudSocketView() {
  // The HUD mirrors live state but must never contend with the dashboard for
  // microphone access or audio playback.
  useBackendSocket({ playSpeech: false });
  return <HudView />;
}

function DashboardApp() {
  useBackendSocket();
  const { isMicActive, isListening, transcript, error: speechError, toggleMic } = useSpeechRecognition();

  const [input, setInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const connected = useJarvisStore((state) => state.connected);
  const conversationMenuOpen = useJarvisStore((state) => state.conversationMenuOpen);
  const toggleConversationMenu = useJarvisStore((state) => state.toggleConversationMenu);
  const activeConversationId = useJarvisStore((state) => state.activeConversationId);
  const setActiveConversation = useJarvisStore((state) => state.setActiveConversation);
  const conversationSessions = useJarvisStore((state) => state.conversationSessions);
  const conversationMessages = useJarvisStore((state) => state.conversationMessages);
  const currentState = useJarvisStore((state) => state.state);
  const goal = useJarvisStore((state) => state.goal);
  const task = useJarvisStore((state) => state.task);
  const confidence = useJarvisStore((state) => state.confidence);
  const lastHeard = useJarvisStore((state) => state.lastHeard);
  const system = useJarvisStore((state) => state.system);

  const activeMessages = useMemo(
    () => (activeConversationId ? conversationMessages[activeConversationId] ?? [] : []),
    [activeConversationId, conversationMessages],
  );

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [activeMessages]);

  async function submitUtterance() {
    const text = input.trim();
    if (!text) {
      return;
    }
    setInput("");
    const sentViaWs = sendUtteranceOverSocket(text, "desktop");
    if (!sentViaWs) {
      try {
        await jarvisApi.submitUtterance({ text, source: "desktop" });
      } catch (err) {
        console.error("Failed to submit typed prompt:", err);
      }
    }
  }

  let liveStatus = "IDLE";
  let statusChipClass = "status-chip-blue";

  if (!isMicActive) {
    liveStatus = "MUTED";
    statusChipClass = "status-chip-muted";
  } else if (currentState === "THINKING") {
    liveStatus = "PROCESSING";
    statusChipClass = "status-chip-live";
  } else if (currentState === "SPEAKING") {
    liveStatus = "SPEAKING";
    statusChipClass = "status-chip-live";
  } else if (isListening || currentState === "LISTENING" || transcript) {
    liveStatus = "LISTENING";
    statusChipClass = "status-chip-live";
  }

  return (
    <div className="jarvis-root">
      <div className={`jarvis-shell ${!conversationMenuOpen ? "sidebar-collapsed" : ""}`}>
        <aside className="sidebar-panel">
          <div className={`drag-region ${conversationMenuOpen ? "px-2 pb-3 pt-2" : "flex justify-center py-2"}`}>
            <button
              className={`no-drag transition shadow-md ${
                conversationMenuOpen
                  ? "flex w-full items-center justify-between rounded-2xl border border-sky-300/30 bg-slate-900/60 backdrop-blur-md px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100 hover:bg-sky-400/25 hover:border-sky-300/60"
                  : "flex h-10 w-10 items-center justify-center rounded-full border border-sky-300/30 bg-slate-900/60 backdrop-blur-md text-sky-200 hover:bg-sky-400/25 hover:border-sky-300/60 hover:text-white active:scale-95"
              }`}
              onClick={toggleConversationMenu}
              title={conversationMenuOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {conversationMenuOpen && <span className="truncate">Conversation</span>}
              <svg className="h-4 w-4 shrink-0 text-sky-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          </div>

          {conversationMenuOpen && (
            <div className="no-drag sidebar-scroll space-y-3 px-2 pb-2">
              {conversationSessions.map((session) => (
                <SessionListItem
                  key={session.id}
                  session={session}
                  active={session.id === activeConversationId}
                  onClick={() => setActiveConversation(session.id)}
                />
              ))}
            </div>
          )}
        </aside>

        <main className="glass-panel main-panel">
          <div className="drag-region shell-header">
            <div>
              <div className="text-[11px] uppercase tracking-[0.45em] text-cyan-200/45">Neural Assistant</div>
              <div className="mt-2 text-4xl font-semibold tracking-tight text-slate-50">FRIDAY</div>
            </div>
            <div className="no-drag flex flex-wrap items-center justify-end gap-2.5">
              <div className={`status-chip ${connected ? "status-chip-live" : "status-chip-muted"}`}>
                {connected ? "Backend connected" : "Backend offline"}
              </div>
              <div className={`status-chip flex items-center gap-1.5 ${statusChipClass}`}>
                {(liveStatus === "LISTENING" || liveStatus === "PROCESSING" || liveStatus === "SPEAKING") && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
                {liveStatus}
              </div>
              <div className="h-5 w-px bg-cyan-400/20 mx-1 hidden sm:block" />
              <WindowControls />
            </div>
          </div>

          <div className="shell-body">
            <section className="conversation-panel no-drag">
              <div className="conversation-scroll" ref={chatScrollRef}>
                {activeMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {currentState === "THINKING" && (
                  <div className="flex items-center gap-3 rounded-[1.4rem] border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-cyan-200">
                    <span className="text-xs uppercase tracking-[0.25em]">FRIDAY is thinking</span>
                    <div className="dot-pulse">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
                {(transcript || speechError) && (
                  <div className="flex items-center gap-2 rounded-[1.4rem] border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-xs text-emerald-200 italic">
                    <span className="font-semibold non-italic text-emerald-400 uppercase tracking-wider">
                      {speechError ? "Voice input:" : "Hearing:"}
                    </span>
                    <span>{speechError ?? `"${transcript}"`}</span>
                  </div>
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitUtterance();
                }}
                className="mt-3 flex items-center gap-3 pb-1"
              >
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`no-drag shrink-0 rounded-[1.3rem] border px-4 py-3 font-semibold backdrop-blur-md transition shadow-[0_4px_15px_rgba(0,0,0,0.2)] ${
                    isMicActive ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" : "border-white/15 bg-slate-900/60 text-slate-300 hover:bg-slate-800/80"
                  }`}
                  title={isMicActive ? "Mute Microphone" : "Unmute Microphone"}
                >
                  {isMicActive ? "🎙️" : "🔇"}
                </button>
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  className="no-drag flex-1 rounded-[1.3rem] border border-sky-300/25 bg-slate-950/70 backdrop-blur-md px-4 py-3 text-slate-100 placeholder-slate-400/80 outline-none transition focus:border-sky-300/60 focus:ring-2 focus:ring-sky-400/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]"
                  placeholder={isMicActive ? "Speak or type a command..." : "Microphone muted. Type a command..."}
                />
                <button
                  type="submit"
                  className="no-drag shrink-0 rounded-[1.3rem] border border-sky-300/35 bg-gradient-to-r from-sky-400/25 to-cyan-500/20 backdrop-blur-md px-6 py-3 font-semibold text-sky-100 transition hover:border-sky-300/60 hover:bg-sky-400/35 shadow-[0_4px_20px_rgba(56,189,248,0.25)] active:scale-98"
                >
                  Send
                </button>
              </form>
            </section>

            <aside className="orb-panel no-drag">
              <div className="orb-stage">
                <JarvisHologram state={currentState} size={460} showControls={false} interactive={false} />
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
