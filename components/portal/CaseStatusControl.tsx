"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/portal/Pieces";

/**
 * Move a case on, and say why.
 *
 * The note is optional but prominent, because the status alone rarely tells a
 * client what to do — "documents required" is only useful with the sentence
 * naming which document. Whatever is typed here becomes both the case's next
 * action and the entry in its history, so the client reads the same words in
 * both places.
 */

const STATUSES: { value: string; label: string }[] = [
  { value: "new", label: "New" },
  { value: "assessment", label: "Assessment" },
  { value: "under_review", label: "Under review" },
  { value: "documents_required", label: "Information required" },
  { value: "in_progress", label: "In progress" },
  { value: "awaiting_client", label: "Waiting for user" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

export function CaseStatusControl({
  caseId,
  current,
  title,
}: {
  caseId: string;
  current: string;
  title: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(current);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function apply() {
    if (busy || status === current) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, status, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't update this case.");
        return;
      }
      setSaved(true);
      setNote("");
      // The history and the client's own view are server-rendered, so the page
      // has to re-read rather than patch a copy in memory.
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[0.95rem] font-medium text-fg">{title}</span>
          <span className="mt-0.5 block text-[0.8rem] text-faint">Current status</span>
        </span>
        <StatusPill status={current} label={current.replace(/_/g, " ")} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-end">
        <div>
          <label htmlFor={`st-${caseId}`} className="field-label">
            Move to
          </label>
          <select
            id={`st-${caseId}`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="field"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`nt-${caseId}`} className="field-label">
            Note to the client
          </label>
          <input
            id={`nt-${caseId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. We need your passport scan before this can continue."
            maxLength={500}
            className="field"
          />
        </div>

        <button
          type="button"
          onClick={apply}
          disabled={busy || status === current}
          className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : "Update"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[0.85rem] text-[#B42318] [html[data-theme=dark]_&]:text-red-300">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-2 text-[0.85rem] text-accent-ink">
          Updated. The client has been notified.
        </p>
      )}
    </div>
  );
}
