import { useJarvisStore } from "../store";
import { JarvisHologram } from "./JarvisHologram";

export function HudView() {
  const state = useJarvisStore((store) => store.state);
  const goal = useJarvisStore((store) => store.goal);
  const task = useJarvisStore((store) => store.task);
  const confidence = useJarvisStore((store) => store.confidence);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060a10] p-4 text-white">
      <div className="w-full max-w-md rounded-[2.5rem] border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-black/80 to-black/90 p-6 shadow-[0_0_50px_rgba(255,170,0,0.25)] backdrop-blur-2xl">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.4em] font-mono text-amber-400">JARVIS HUD</div>
          <div className="rounded-full bg-amber-500/20 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-amber-300">
            {state}
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <JarvisHologram state={state} size={300} showControls={false} />
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-amber-400/80 font-mono">Goal</div>
            <div className="mt-0.5 text-sm font-medium">{goal}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-amber-400/80 font-mono">Task</div>
            <div className="mt-0.5 text-sm font-medium text-amber-100/90">{task}</div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
            <span className="text-xs text-amber-400/80 font-mono">Confidence</span>
            <span className="text-sm font-bold text-cyan-400">{Math.round(confidence * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}


