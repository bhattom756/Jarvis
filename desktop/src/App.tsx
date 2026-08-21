import { ControlBar } from "./components/ControlBar";
import { EmailComposer } from "./components/EmailComposer";
import { ConfirmationQueue } from "./components/ConfirmationQueue";
import { HudView } from "./components/HudView";
import { StatCard } from "./components/StatCard";
import { TabPanel } from "./components/TabPanel";
import { JarvisHologram } from "./components/JarvisHologram";
import { useBackendSocket } from "./hooks/useBackendSocket";
import { useJarvisStore } from "./store";

export function App() {
  useBackendSocket();

  const connected = useJarvisStore((state) => state.connected);
  const currentState = useJarvisStore((state) => state.state);
  const goal = useJarvisStore((state) => state.goal);
  const task = useJarvisStore((state) => state.task);
  const confidence = useJarvisStore((state) => state.confidence);
  const system = useJarvisStore((state) => state.system);

  if (window.location.hash === "#hud") {
    return <HudView />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,170,0,0.12),_transparent_35%),linear-gradient(180deg,_#060a10,_#0d1622)] p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.5em] text-amber-400">AI Operating System</div>
            <h1 className="mt-2 text-5xl font-extrabold tracking-tight text-white drop-shadow-[0_0_20px_rgba(255,170,0,0.3)]">
              JARVIS
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-amber-100/70">
              Interactive Holographic Neural Core • Continuous Audio & Visual Intelligence Engine
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider ${connected ? "bg-amber-400 text-slate-950 shadow-[0_0_15px_rgba(255,170,0,0.5)]" : "bg-rose-500/20 text-rose-300 border border-rose-500/40"}`}>
              {connected ? "● Backend Connected" : "○ Offline / Standby"}
            </div>
          </div>
        </div>

        {/* Central Holographic Core Visualizer Section */}
        <div className="mt-6 rounded-3xl border border-amber-500/20 bg-gradient-to-b from-amber-500/10 via-black/40 to-black/60 p-6 shadow-[0_0_50px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-8">
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <div className="text-xs uppercase tracking-wider text-amber-400/80 font-mono">Current Goal</div>
                <div className="mt-1 text-lg font-medium text-white">{goal}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <div className="text-xs uppercase tracking-wider text-amber-400/80 font-mono">Active Task</div>
                <div className="mt-1 text-base text-amber-100/90">{task}</div>
              </div>
            </div>

            {/* Main Holographic Animated Core */}
            <div className="flex justify-center my-2">
              <JarvisHologram state={currentState} size={420} showControls={true} />
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <div className="text-xs uppercase tracking-wider text-amber-400/80 font-mono">System Mode</div>
                <div className="mt-1 text-2xl font-bold text-amber-400">{currentState}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <div className="text-xs uppercase tracking-wider text-amber-400/80 font-mono">Confidence Level</div>
                <div className="mt-1 text-2xl font-bold text-cyan-400">{Math.round(confidence * 100)}%</div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${Math.round(confidence * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="State" value={currentState} accent="text-amber-400" />
          <StatCard label="Goal" value={goal} />
          <StatCard label="Task" value={task} />
          <StatCard label="Confidence" value={`${Math.round(confidence * 100)}%`} accent="text-cyan-400" />
        </div>

        <div className="mt-6">
          <ControlBar />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <TabPanel />
          <div className="space-y-4">
            <StatCard label="Microphone" value={String(system.microphone ?? "unknown")} />
            <StatCard label="Browser" value={String(system.browser ?? "unknown")} />
            <StatCard label="Monitoring" value={String(system.monitoring ?? "unknown")} />
            <StatCard label="Memory DB" value={String(system.memory_db ?? "unknown")} />
            <StatCard label="Vector Memory" value={String(system.vector_memory ?? "unknown")} />
            <StatCard label="LLM Provider" value={String(system.llm_provider ?? "unknown")} />
            <StatCard label="TTS Provider" value={String(system.tts_provider ?? "unknown")} />
            <EmailComposer />
            <ConfirmationQueue />
          </div>
        </div>
      </div>
    </div>
  );
}
