import { useJarvisStore } from "../store";
import type { TimelineRecord } from "../types";

async function resolveConfirmation(id: string, approved: boolean) {
  await fetch(`http://127.0.0.1:8000/confirmations/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved })
  });
}

export function ConfirmationQueue() {
  const confirmations = useJarvisStore((state) => state.confirmations);
  const pending = confirmations.filter((item) => item.status === "pending") as TimelineRecord[];

  return (
    <div className="rounded-[2rem] border border-white/10 bg-panel/85 p-5">
      <div className="text-xs uppercase tracking-[0.3em] text-white/55">Pending Confirmations</div>
      <div className="mt-4 space-y-3">
        {pending.length === 0 && <div className="rounded-2xl bg-black/20 p-4 text-sm text-white/55">No pending approvals.</div>}
        {pending.map((item) => (
          <div key={item.id} className="rounded-2xl bg-black/20 p-4">
            <div className="font-medium">{String(item.summary ?? "Approval request")}</div>
            <div className="mt-1 text-sm text-white/55">{String(item.risk_level ?? "unknown risk")}</div>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-ink"
                onClick={() => void resolveConfirmation(String(item.id), true)}
              >
                Approve
              </button>
              <button
                className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white"
                onClick={() => void resolveConfirmation(String(item.id), false)}
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

