"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The foot of the review window: a comment for the student, then the two
 * decisions. Sending back needs the comment, because the student cannot fix
 * what they are not told; proceeding may carry one as a note.
 */
export function ReviewActions({
  intakeId,
  studentName,
  closeHref,
  canProceed,
  canReturn,
}: {
  intakeId: string;
  studentName: string;
  closeHref: string;
  canProceed: boolean;
  canReturn: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"proceed" | "return" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = studentName.trim().split(/\s+/)[0] ?? "the student";

  async function decide(action: "proceed" | "return") {
    if (action === "return" && note.trim().length < 5) {
      setError(`Write what ${first} should change before sending it back.`);
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/intake/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeId, action, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't work.");
      router.push(closeHref);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setBusy(null);
    }
  }

  if (!canProceed && !canReturn) return null;

  return (
    <div>
      <label htmlFor="review-note" className="label text-[0.72rem] text-faint">
        Comments for {first}
      </label>
      <textarea
        id="review-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="e.g. Please upload a clearer scan of your passport, and add your IELTS score."
        className="field mt-1.5 w-full resize-y text-[0.9rem]"
      />
      <p className="mt-1 text-[0.75rem] text-faint">
        Required to send it back. {first} sees this in the portal and by email.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[0.85rem] text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {canReturn && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide("return")}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--danger-line)] px-5 text-[0.92rem] font-semibold text-danger transition-colors hover:bg-[var(--danger-soft)] disabled:opacity-50"
            )}
          >
            {busy === "return" ? "Sending…" : "Send back for changes"}
          </button>
        )}
        {canProceed && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide("proceed")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-6 text-[0.92rem] font-semibold text-[#070B1A] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy === "proceed" ? "Moving…" : "Proceed: ready to apply"}
            <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-4 w-4">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
