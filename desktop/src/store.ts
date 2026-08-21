import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AssistantState, EventEnvelope, TimelineRecord } from "./types";

type TabKey = "conversation" | "memory" | "tasks" | "activity" | "system";

interface JarvisStore {
  connected: boolean;
  muted: boolean;
  monitoringPaused: boolean;
  activeTab: TabKey;
  state: AssistantState;
  goal: string;
  task: string;
  confidence: number;
  transcript: string[];
  activities: TimelineRecord[];
  tasks: TimelineRecord[];
  memories: string[];
  alerts: TimelineRecord[];
  confirmations: TimelineRecord[];
  system: Record<string, unknown>;
  setActiveTab: (tab: TabKey) => void;
  setConnected: (connected: boolean) => void;
  setTimeline: (timeline: Record<string, TimelineRecord[]>) => void;
  toggleMuted: () => void;
  toggleMonitoring: () => void;
  applyEvent: (event: EventEnvelope) => void;
}

export const useJarvisStore = create<JarvisStore>()(persist((set) => ({
  connected: false,
  muted: false,
  monitoringPaused: false,
  activeTab: "conversation",
  state: "IDLE",
  goal: "Awaiting next instruction",
  task: "Monitoring",
  confidence: 0,
  transcript: [],
  activities: [],
  tasks: [],
  memories: [],
  alerts: [],
  confirmations: [],
  system: {},
  setActiveTab: (tab) => set({ activeTab: tab }),
  setConnected: (connected) => set({ connected }),
  setTimeline: (timeline) => set({
    activities: timeline.activities ?? [],
    tasks: timeline.tasks ?? [],
    confirmations: timeline.confirmations ?? []
  }),
  toggleMuted: () => set((state) => ({ muted: !state.muted })),
  toggleMonitoring: () => set((state) => ({ monitoringPaused: !state.monitoringPaused })),
  applyEvent: (event) =>
    set((state) => {
      switch (event.type) {
        case "assistant.state":
          return {
            ...state,
            state: String(event.payload.state) as AssistantState,
            goal: String(event.payload.goal ?? state.goal),
            task: String(event.payload.task ?? state.task),
            confidence: Number(event.payload.confidence ?? state.confidence)
          };
        case "transcript.segment":
          return {
            ...state,
            transcript: [String(event.payload.text), ...state.transcript].slice(0, 25)
          };
        case "activity.logged":
          return {
            ...state,
            activities: [event.payload as TimelineRecord, ...state.activities].slice(0, 30)
          };
        case "plan.updated":
          return {
            ...state,
            tasks: [event.payload as TimelineRecord, ...state.tasks].slice(0, 20)
          };
        case "memory.updated":
          return {
            ...state,
            memories: [String(event.payload.summary), ...((event.payload.items as string[]) ?? []), ...state.memories].slice(0, 20)
          };
        case "monitoring.alert":
          return {
            ...state,
            alerts: [event.payload as TimelineRecord, ...state.alerts].slice(0, 20),
            activities: [event.payload as TimelineRecord, ...state.activities].slice(0, 30)
          };
        case "confirmation.requested":
        case "confirmation.resolved":
          return {
            ...state,
            confirmations: [event.payload as TimelineRecord, ...state.confirmations].slice(0, 20)
          };
        case "system.status":
          return {
            ...state,
            system: event.payload
          };
        default:
          return state;
      }
    })
}), {
  name: "jarvis-dashboard-state",
  partialize: (state) => ({
    muted: state.muted,
    monitoringPaused: state.monitoringPaused,
    activeTab: state.activeTab,
    transcript: state.transcript,
    activities: state.activities,
    tasks: state.tasks,
    memories: state.memories,
    alerts: state.alerts,
    confirmations: state.confirmations,
    system: state.system
  })
}));
