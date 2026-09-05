import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AssistantState,
  ConversationMessage,
  ConversationSession,
  EventEnvelope,
  SystemStatus,
  TimelineRecord,
} from "./types";

export type TabKey = "conversation" | "memory" | "tasks" | "activity" | "system";

export interface JarvisStore {
  connected: boolean;
  muted: boolean;
  monitoringPaused: boolean;
  conversationMenuOpen: boolean;
  activeConversationId: string | null;
  activeTab: TabKey;
  state: AssistantState;
  goal: string;
  task: string;
  confidence: number;
  lastHeard: string;
  system: SystemStatus;
  conversationSessions: ConversationSession[];
  conversationMessages: Record<string, ConversationMessage[]>;
  transcript: string[];
  memories: string[];
  tasks: TimelineRecord[];
  activities: TimelineRecord[];
  confirmations: TimelineRecord[];
  alerts: TimelineRecord[];
  setConnected: (connected: boolean) => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  setMonitoringPaused: (paused: boolean) => void;
  toggleMonitoring: () => void;
  setActiveTab: (tab: TabKey) => void;
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
      monitoringPaused: false,
      conversationMenuOpen: true,
      activeConversationId: null,
      activeTab: "conversation",
      state: "IDLE",
      goal: "Connecting to backend",
      task: "Waiting for live status",
      confidence: 0,
      lastHeard: "",
      system: {},
      conversationSessions: [],
      conversationMessages: {},
      transcript: [],
      memories: [],
      tasks: [],
      activities: [],
      confirmations: [],
      alerts: [],
      setConnected: (connected) => set({ connected }),
      setMuted: (muted) => set({ muted }),
      toggleMuted: () => set((state) => ({ muted: !state.muted })),
      setMonitoringPaused: (monitoringPaused) => set({ monitoringPaused }),
      toggleMonitoring: () => set((state) => ({ monitoringPaused: !state.monitoringPaused })),
      setActiveTab: (activeTab) => set({ activeTab }),
      toggleConversationMenu: () =>
        set((state) => ({ conversationMenuOpen: !state.conversationMenuOpen })),
      setActiveConversation: (conversationId) => set({ activeConversationId: conversationId }),
      setConversationBootstrap: (activeConversationId, sessions) =>
        set(() => ({
          activeConversationId: activeConversationId ?? sessions[0]?.id ?? null,
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
                transcript: [String(event.payload.text ?? ""), ...state.transcript],
              };
            case "conversation.message": {
              const message = event.payload as unknown as ConversationMessage;
              const existing = state.conversationMessages[message.conversation_id] ?? [];
              const updatedMessages = existing.some((entry) => entry.id === message.id)
                ? existing
                : [...existing, message];

              return {
                ...state,
                activeConversationId: message.conversation_id,
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
            case "task.updated":
              return {
                ...state,
                tasks: [event.payload as TimelineRecord, ...state.tasks],
              };
            case "activity.logged":
              return {
                ...state,
                activities: [event.payload as TimelineRecord, ...state.activities],
              };
            case "confirmation.requested":
              return {
                ...state,
                confirmations: [event.payload as TimelineRecord, ...state.confirmations],
              };
            case "monitoring.alert":
              return {
                ...state,
                alerts: [event.payload as TimelineRecord, ...state.alerts],
              };
            default:
              return state;
          }
        }),
    }),
    {
      name: "jarvis-conversation-state",
      partialize: (state) => ({
        conversationMenuOpen: state.conversationMenuOpen,
      }),
    },
  ),
);
