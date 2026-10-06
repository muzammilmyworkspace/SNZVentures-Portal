"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * THE STATUS OF ONE APPLICATION, AS A CONTROL.
 *
 * Pick a stage and a Save button appears at the end of the row; saving moves
 * the application, and with it the row, to that stage's section. Nothing is
 * sent until Save, so a wrong pick costs nothing.
 *
 * "Changes requested" also asks for the comment the student will receive,
 * because the student cannot fix what they are not told.
 */
const OPTIONS = [
  { value: "submitted", label: "Under review", tone: "work" },
  { value: "returned", label: "Changes requested", tone: "bad" },
  { value: "accepted", label: "Ready to apply", tone: "good" },
  { value: "applied", label: "Applied", tone: "info" },
  { value: "completed", label: "Completed", tone: "good" },
] as const;

const TONE_CLASS: Record<string, string | undefined> = {
  good: "good",
  bad: "bad",
  work: undefined,
  info: undefined,
};

export function StageSelect({ intakeId, status, studentName }: { intakeId: string; status: string; studentName: string }) {
  const router = useRouter();
  const initial = status === "under_review" ? "submitted" : status;
  const [value, setValue] = useState(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // The row's status can change elsewhere (the review window); follow it.
  useEffect(() => {
    setValue(initial);
    setNote("");
    setBusy(false);
  }, [initial]);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== initial;
  const tone = OPTIONS.find((o) => o.value === value)?.tone ?? "work";

  async function save() {
    if (value === "returned" && note.trim().length < 5) {
      setError("Write what to change.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/intake/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeId, action: "move", to: value, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-[13rem] flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <select
          aria-label={`Status of ${studentName}'s application`}
          value={value}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          data-tone={TONE_CLASS[tone]}
          className="chip-select"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {dirty && (
          <>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              aria-label={`Save: move to ${OPTIONS.find((o) => o.value === value)?.label}`}
              data-tip="Save"
              className="tip icon-btn !border-[var(--accent)] !bg-[var(--accent)] !text-[#070B1A] hover:!opacity-90"
            >
              {busy ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setValue(initial);
                setNote("");
                setError(null);
              }}
              disabled={busy}
              aria-label="Cancel"
              data-tip="Cancel"
              className="tip icon-btn"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>
      {dirty && value === "returned" && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What should they change?"
          aria-label="Comment for the student"
          maxLength={2000}
          className="field h-8 py-1 text-[0.8rem]"
        />
      )}
      {error && (
        <span role="alert" className="text-[0.75rem] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
