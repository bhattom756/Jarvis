import type { ReactNode } from "react";

export function StatCard(props: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-panel/80 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
      <div className="text-xs uppercase tracking-[0.24em] text-white/55">{props.label}</div>
      <div className={`mt-3 text-lg font-semibold ${props.accent ?? "text-white"}`}>{props.value}</div>
    </div>
  );
}

