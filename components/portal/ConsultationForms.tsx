"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const TOPICS = [
  "Study abroad advice",
  "Help with my application",
  "Visa guidance",
  "Documents",
  "Fees and payments",
  "Something else",
];

const MODES = [
  { value: "video", label: "Video call" },
  { value: "phone", label: "Phone call" },
  { value: "office", label: "At the office" },
] as const;

/**
 * ASK FOR A CONSULTATION — students and consultants. What it is about, how
 * they would like to meet and when suits them; the team replies with a time.
 */
export function ConsultationRequest() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [mode, setMode] = useState<"video" | "phone" | "office">("video");
  const [preferred, setPreferred] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, mode, preferred, notes }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't send.");
      setMsg({ ok: true, text: "Sent. We will reply with a day and time, by email and here." });
      setOpen(false);
      setPreferred("");
      setNotes("");
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "That didn't send." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-[0.95rem] font-semibold text-[#070B1A] transition-opacity hover:opacity-90"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden className="h-4 w-4">
            <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
            <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
          </svg>
          Request a consultation
        </button>
        {msg && <span className={`text-[0.85rem] ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="c-topic" className="field-label">What is it about?</label>
        <select id="c-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="field">
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <fieldset>
        <legend className="field-label">How would you like to meet?</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <label
              key={m.value}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-[0.88rem] text-fg has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
            >
              <input type="radio" name="c-mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="accent-[var(--accent)]" />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="c-pref" className="field-label">When suits you?</label>
        <input
          id="c-pref"
          value={preferred}
          onChange={(e) => setPreferred(e.target.value)}
          maxLength={300}
          placeholder="e.g. Weekdays after 5 pm Pakistan time, or Saturday morning"
          className="field"
        />
      </div>
      <div>
        <label htmlFor="c-notes" className="field-label">Anything we should know first? <span className="text-faint">(optional)</span></label>
        <textarea id="c-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1500} className="field resize-y" />
      </div>
      {msg && !msg.ok && <p role="alert" className="text-[0.85rem] text-danger">{msg.text}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={send} disabled={busy} className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-5 text-[0.92rem] font-semibold text-[#070B1A] disabled:opacity-50">
          {busy ? "Sending…" : "Send request"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-[0.92rem] text-muted hover:text-fg">
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * THE TEAM GIVES IT A TIME — the day and time are read in the browser's own
 * time zone and sent as an exact moment, so whoever schedules does not have
 * to convert. The requester sees it in Lithuania and Pakistan time.
 */
export function ConsultationSchedule({
  id,
  mode: initialMode,
  scheduled,
}: {
  id: string;
  mode: "video" | "phone" | "office" | null;
  scheduled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "schedule" | "cancel">(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [mode, setMode] = useState<"video" | "phone" | "office">(initialMode ?? "video");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/consultations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
      setOpen(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(open === "schedule" ? null : "schedule")}
          className="inline-flex min-h-9 items-center rounded-full bg-[var(--accent)] px-4 text-[0.82rem] font-semibold text-[#070B1A]"
        >
          {scheduled ? "Change time" : "Give a time"}
        </button>
        {scheduled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => call({ action: "complete" })}
            className="inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] text-fg hover:border-[var(--accent)]"
          >
            Mark done
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(open === "cancel" ? null : "cancel")}
          className="inline-flex min-h-9 items-center rounded-full border border-[var(--danger-line)] px-3.5 text-[0.82rem] text-danger hover:bg-[var(--danger-soft)]"
        >
          Cancel
        </button>
      </div>

      {open === "schedule" && (
        <div className="mt-3 grid gap-3 rounded-[12px] border border-line bg-[color-mix(in_srgb,var(--fg)_3%,transparent)] p-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Day</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
          </label>
          <label className="block">
            <span className="field-label">Time (your time zone)</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field" />
          </label>
          <label className="block">
            <span className="field-label">Length</span>
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className="field">
              {["15", "30", "45", "60", "90"].map((d) => (
                <option key={d} value={d}>{d} minutes</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">How</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="field">
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">{mode === "office" ? "Address" : mode === "phone" ? "Number we will call from (optional)" : "Meeting link"}</span>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={mode === "video" ? "https://meet.google.com/…" : ""}
              className="field"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Note for them <span className="text-faint">(optional)</span></span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="field" placeholder="e.g. Please have your transcripts ready." />
          </label>
          {error && <p role="alert" className="text-[0.82rem] text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={busy || !date || !time}
              onClick={() =>
                call({
                  action: "schedule",
                  startsAt: new Date(`${date}T${time}`).toISOString(),
                  duration: Number(duration),
                  mode,
                  link,
                  note,
                })
              }
              className="inline-flex min-h-10 items-center rounded-full bg-[var(--accent)] px-5 text-[0.88rem] font-semibold text-[#070B1A] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Confirm and email them"}
            </button>
          </div>
        </div>
      )}

      {open === "cancel" && (
        <div className="mt-3 rounded-[12px] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4">
          <label className="block">
            <span className="field-label">Why? <span className="text-faint">(sent to them)</span></span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="field" />
          </label>
          {error && <p role="alert" className="mt-2 text-[0.82rem] text-danger">{error}</p>}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => call({ action: "cancel", note })}
              className="inline-flex min-h-10 items-center rounded-full bg-[var(--danger)] px-5 text-[0.88rem] font-semibold text-[#160606] disabled:opacity-50"
            >
              {busy ? "Cancelling…" : "Cancel the consultation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
