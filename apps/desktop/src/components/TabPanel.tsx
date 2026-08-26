import { useJarvisStore } from "../store";

const tabs = [
  { key: "conversation", label: "Conversation" },
  { key: "memory", label: "Memory" },
  { key: "tasks", label: "Tasks" },
  { key: "activity", label: "Activity" },
  { key: "system", label: "System" }
] as const;

export function TabPanel() {
  const activeTab = useJarvisStore((state) => state.activeTab);
  const setActiveTab = useJarvisStore((state) => state.setActiveTab);
  const transcript = useJarvisStore((state) => state.transcript);
  const memories = useJarvisStore((state) => state.memories);
  const tasks = useJarvisStore((state) => state.tasks);
  const activities = useJarvisStore((state) => state.activities);
  const system = useJarvisStore((state) => state.system);
  const confirmations = useJarvisStore((state) => state.confirmations);
  const alerts = useJarvisStore((state) => state.alerts);

  return (
    <div className="rounded-[2rem] border border-white/10 bg-panel/85 p-5">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`rounded-full px-4 py-2 text-sm ${activeTab === tab.key ? "bg-accent text-ink" : "bg-white/5 text-white/70"}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3 text-sm text-white/80">
        {activeTab === "conversation" &&
          transcript.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-2xl bg-black/20 p-3">
              {item}
            </div>
          ))}

        {activeTab === "memory" &&
          memories.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-2xl bg-black/20 p-3">
              {item}
            </div>
          ))}

        {activeTab === "tasks" &&
          tasks.map((task, index) => (
            <div key={task.id ?? index} className="rounded-2xl bg-black/20 p-3">
              <div className="font-medium">{String(task.goal ?? task.title ?? "Task")}</div>
              <div className="mt-1 text-white/60">{String(task.status ?? "pending")}</div>
            </div>
          ))}

        {activeTab === "activity" &&
          [...confirmations, ...alerts, ...activities].map((item, index) => (
            <div key={item.id ?? index} className="rounded-2xl bg-black/20 p-3">
              <div className="font-medium">{String(item.summary ?? item.source ?? item.category ?? "Activity")}</div>
              <div className="mt-1 text-white/60">{String(item.detail ?? item.severity ?? "")}</div>
            </div>
          ))}

        {activeTab === "system" && (
          <pre className="overflow-x-auto rounded-2xl bg-black/30 p-4 text-xs text-accent">
            {JSON.stringify(system, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

