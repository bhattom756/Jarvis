import { useJarvisStore } from "../store";
import { JarvisHologram } from "./JarvisHologram";

export function HudView() {
  const state = useJarvisStore((store) => store.state);
  const goal = useJarvisStore((store) => store.goal);
  const task = useJarvisStore((store) => store.task);

  return (
    <div className="hud-root">
      <div className="hud-panel drag-region">
        <div className="no-drag flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.34em] text-cyan-100/60">JARVIS</div>
          <div className="flex items-center gap-2">
            <div className="hud-state">{state}</div>
            <button
              onClick={() => window.jarvisDesktop?.closeWindow()}
              className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-500/80 hover:text-white"
              title="Close HUD"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <JarvisHologram state={state} size={130} interactive={false} />
          <div className="min-w-0 space-y-3">
            <div>
              <div className="hud-label">Intent</div>
              <div className="truncate text-sm text-slate-100">{goal}</div>
            </div>
            <div>
              <div className="hud-label">Status</div>
              <div className="line-clamp-2 text-xs leading-5 text-slate-300">{task}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
