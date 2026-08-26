import { useState } from "react";
import { jarvisApi, jarvisBackendUrls } from "../lib/jarvis-api";

export function EmailComposer() {
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState("");
  const [status, setStatus] = useState("");
  const [unread, setUnread] = useState<Array<{ id: string; from: string; subject: string; date: string; body: string }>>([]);

  async function submit() {
    const recipientList = recipients.split(/[;,\n]/).map((value) => value.trim()).filter(Boolean);
    const attachmentList = attachments.split("\n").map((value) => value.trim()).filter(Boolean);
    if (!recipientList.length || !subject.trim() || !body.trim()) {
      setStatus("Recipient, subject, and message are required.");
      return;
    }
    try {
      const result = await jarvisApi.sendEmail({
        recipients: recipientList,
        subject,
        body,
        attachments: attachmentList,
      });
      setStatus(result.summary ?? "Email request queued.");
    } catch {
      setStatus("Backend unavailable. The email was not sent.");
    }
  }

  async function refreshUnread() {
    try {
      const response = await fetch(`${jarvisBackendUrls.httpUrl}/emails/unread`);
      const result = await response.json() as { messages?: typeof unread; error?: string };
      setUnread(result.messages ?? []);
      setStatus(result.error ?? `Loaded ${result.messages?.length ?? 0} unread messages.`);
    } catch {
      setStatus("Backend unavailable. Unread messages could not be loaded.");
    }
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-panel/85 p-5">
      <div className="text-xs uppercase tracking-[0.3em] text-white/55">Email Draft</div>
      <button className="mt-3 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white" onClick={() => void refreshUnread()}>
        Refresh Unread Email
      </button>
      <div className="mt-4 grid gap-3">
        <input value={recipients} onChange={(event) => setRecipients(event.target.value)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Recipients, separated by commas" />
        <input value={subject} onChange={(event) => setSubject(event.target.value)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Subject" />
        <textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-24 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Message" />
        <textarea value={attachments} onChange={(event) => setAttachments(event.target.value)} className="min-h-16 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white" placeholder="Optional attachment paths, one per line" />
        <button className="rounded-full bg-signal px-4 py-2 text-sm font-medium text-ink" onClick={() => void submit()}>
          Queue Email for Approval
        </button>
        {status && <div className="text-xs text-white/60">{status}</div>}
        {unread.map((message) => (
          <div key={message.id} className="rounded-xl bg-black/20 p-3 text-xs text-white/75">
            <div className="font-medium text-white">{message.subject}</div>
            <div className="mt-1 text-white/55">{message.from} · {message.date}</div>
            <div className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap">{message.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
