import { useState } from "react";
import { useJarvisStore } from "../store";

export function ControlBar() {
  const muted = useJarvisStore((state) => state.muted);
  const monitoringPaused = useJarvisStore((state) => state.monitoringPaused);
  const toggleMuted = useJarvisStore((state) => state.toggleMuted);
  const toggleMonitoring = useJarvisStore((state) => state.toggleMonitoring);
  const [input, setInput] = useState("");

  async function syncMute(nextMuted: boolean) {
    await fetch("http://127.0.0.1:8000/controls/mute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muted: nextMuted })
    });
  }

  async function syncMonitoring(nextPaused: boolean) {
    await fetch("http://127.0.0.1:8000/controls/monitoring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: nextPaused })
    });
  }

  async function submitUtterance() {
    if (!input.trim()) return;
    await fetch("http://127.0.0.1:8000/utterances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.trim(), source: "desktop" })
    });
    setInput("");
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#102131] p-4">
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-full bg-accent px-4 py-2 font-medium text-ink"
          onClick={() => {
            const next = !muted;
            toggleMuted();
            void syncMute(next);
          }}
        >
          {muted ? "Unmute Mic" : "Mute Mic"}
        </button>
        <button
          className="rounded-full bg-signal px-4 py-2 font-medium text-ink"
          onClick={() => {
            const next = !monitoringPaused;
            toggleMonitoring();
            void syncMonitoring(next);
          }}
        >
          {monitoringPaused ? "Resume Monitoring" : "Pause Monitoring"}
        </button>
        <button className="rounded-full bg-white/10 px-4 py-2 text-white" onClick={() => window.jarvisDesktop.toggleHud()}>
          Toggle HUD
        </button>
      </div>

      <div className="mt-4 flex gap-3">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submitUtterance();
          }}
          className="flex-1 rounded-full border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
          placeholder="Simulate a spoken command, for example: Open VS Code."
        />
        <button className="rounded-full bg-accent px-5 py-3 font-semibold text-ink" onClick={() => void submitUtterance()}>
          Send
        </button>
      </div>
    </div>
  );
}
