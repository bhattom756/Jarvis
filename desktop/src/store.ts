import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AssistantState,
  ConversationMessage,
  ConversationSession,
  EventEnvelope,
  SystemStatus,
} from "./types";

interface JarvisStore {
  connected: boolean;
  muted: boolean;
  conversationMenuOpen: boolean;
  activeConversationId: string | null;
  state: AssistantState;
  goal: string;
  task: string;
  confidence: number;
  lastHeard: string;
  system: SystemStatus;
  conversationSessions: ConversationSession[];
  conversationMessages: Record<string, ConversationMessage[]>;
  setConnected: (connected: boolean) => void;
  setMuted: (muted: boolean) => void;
  toggleConversationMenu: () => void;
  setActiveConversation: (conversationId: string) => void;
  setConversationBootstrap: (activeConversationId: string | null, sessions: ConversationSession[]) => void;
  setConversationMessages: (conversationId: string, messages: ConversationMessage[]) => void;
  applyEvent: (event: EventEnvelope) => void;
}

function upsertSession(
  sessions: ConversationSession[],
  sessionId: string,
  preview: string,
  createdAt: string,
): ConversationSession[] {
  const existing = sessions.find((session) => session.id === sessionId);
  if (!existing) {
    return [
      {
        id: sessionId,
        title: preview.slice(0, 48) || "Conversation",
        preview,
        created_at: createdAt,
        updated_at: createdAt,
        message_count: 1,
      },
      ...sessions,
    ];
  }

  return sessions
    .map((session) =>
      session.id === sessionId
        ? {
            ...session,
            preview,
            updated_at: createdAt,
            message_count: session.message_count + 1,
          }
        : session,
    )
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export const useJarvisStore = create<JarvisStore>()(
  persist(
    (set) => ({
      connected: false,
      muted: false,
      conversationMenuOpen: true,
      activeConversationId: null,
      state: "IDLE",
      goal: "Connecting to backend",
      task: "Waiting for live status",
      confidence: 0,
      lastHeard: "",
      system: {},
      conversationSessions: [],
      conversationMessages: {},
      setConnected: (connected) => set({ connected }),
      setMuted: (muted) => set({ muted }),
      toggleConversationMenu: () =>
        set((state) => ({ conversationMenuOpen: !state.conversationMenuOpen })),
      setActiveConversation: (conversationId) => set({ activeConversationId: conversationId }),
      setConversationBootstrap: (activeConversationId, sessions) =>
        set((state) => ({
          activeConversationId: activeConversationId ?? state.activeConversationId ?? sessions[0]?.id ?? null,
          conversationSessions: sessions,
        })),
      setConversationMessages: (conversationId, messages) =>
        set((state) => ({
          conversationMessages: {
            ...state.conversationMessages,
            [conversationId]: messages,
          },
        })),
      applyEvent: (event) =>
        set((state) => {
          switch (event.type) {
            case "assistant.state":
              return {
                ...state,
                state: String(event.payload.state) as AssistantState,
                goal: String(event.payload.goal ?? state.goal),
                task: String(event.payload.task ?? state.task),
                confidence: Number(event.payload.confidence ?? state.confidence),
              };
            case "transcript.segment":
              return {
                ...state,
                lastHeard: String(event.payload.text ?? ""),
              };
            case "conversation.message": {
              const message = event.payload as unknown as ConversationMessage;
              const existing = state.conversationMessages[message.conversation_id] ?? [];
              const updatedMessages = existing.some((entry) => entry.id === message.id)
                ? existing
                : [...existing, message];

              return {
                ...state,
                activeConversationId: state.activeConversationId ?? message.conversation_id,
                conversationMessages: {
                  ...state.conversationMessages,
                  [message.conversation_id]: updatedMessages,
                },
                conversationSessions: upsertSession(
                  state.conversationSessions,
                  message.conversation_id,
                  message.content,
                  message.created_at,
                ),
              };
            }
            case "system.status":
              return {
                ...state,
                system: event.payload as SystemStatus,
              };
            default:
              return state;
          }
        }),
    }),
    {
      name: "jarvis-conversation-state",
      partialize: (state) => ({
        activeConversationId: state.activeConversationId,
        conversationMenuOpen: state.conversationMenuOpen,
      }),
    },
  ),
);
