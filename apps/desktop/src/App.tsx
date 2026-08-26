import { useEffect, useMemo, useRef, useState } from "react";
import { HudView } from "./components/HudView";
import { JarvisHologram } from "./components/JarvisHologram";
import { useBackendSocket } from "./hooks/useBackendSocket";
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
          ? "border-cyan-300/60 bg-cyan-300/12 shadow-[0_0_30px_rgba(85,180,255,0.18)]"
          : "border-white/8 bg-white/5 hover:border-cyan-400/30 hover:bg-white/8"
      }`}
      onClick={props.onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-100">{dayLabel(props.session.created_at)}</span>
        <span className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/55">
          {timeLabel(props.session.updated_at)}
        </span>
      </div>
      <div className="mt-2 line-clamp-2 text-sm text-slate-300/78">
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
        <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-1.5 text-xs uppercase tracking-[0.28em] text-cyan-100/75">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-[1.6rem] border px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.16)] ${
          isUser
            ? "border-cyan-300/45 bg-gradient-to-br from-cyan-300/20 to-sky-400/8 text-cyan-50"
            : "border-white/8 bg-[#071625]/88 text-slate-100"
        }`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-4">
          <span className="text-[11px] uppercase tracking-[0.28em] text-cyan-100/55">
            {isUser ? "User" : "Friday"}
          </span>
          <span className="text-[11px] text-slate-400">{timeLabel(message.created_at)}</span>
        </div>
        <div className="whitespace-pre-wrap text-[15px] leading-7">{message.content}</div>
      </div>
    </div>
  );
}

export function App() {
  useBackendSocket();

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
    await jarvisApi.submitUtterance({ text, source: "desktop" });
    setInput("");
  }

  if (window.location.hash === "#hud") {
    return <HudView />;
  }

  return (
    <div className="jarvis-root">
      <div className={`jarvis-shell ${!conversationMenuOpen ? "sidebar-collapsed" : ""}`}>
        <aside className="glass-panel sidebar-panel">
          <div className="drag-region px-2 pb-3 pt-2">
            <button
              className="no-drag flex w-full items-center justify-between rounded-[1.6rem] border border-cyan-300/20 bg-cyan-300/10 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.25em] text-cyan-50 transition hover:bg-cyan-300/14"
              onClick={toggleConversationMenu}
              title={conversationMenuOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {conversationMenuOpen && <span className="truncate">Conversation</span>}
              <svg className="h-4 w-4 shrink-0 text-cyan-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <div className="no-drag flex flex-wrap items-center justify-end gap-2">
              <div className={`status-chip ${connected ? "status-chip-live" : "status-chip-muted"}`}>
                {connected ? "Backend connected" : "Backend offline"}
              </div>
              <div
                className={`status-chip ${
                  currentState === "THINKING" || currentState === "SPEAKING" || currentState === "LISTENING"
                    ? "status-chip-live"
                    : "status-chip-blue"
                }`}
              >
                {currentState}
              </div>
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
              </div>

              <div className="mt-3 flex items-center gap-3 pb-1">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void submitUtterance();
                    }
                  }}
                  className="no-drag flex-1 rounded-[1.3rem] border border-cyan-300/16 bg-[#07131d]/88 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/40"
                  placeholder="Speak or type here..."
                />
                <button
                  className="no-drag shrink-0 rounded-[1.3rem] border border-cyan-300/28 bg-cyan-300/15 px-6 py-3 font-semibold text-cyan-50 transition hover:bg-cyan-300/24"
                  onClick={() => void submitUtterance()}
                >
                  Send
                </button>
              </div>
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
