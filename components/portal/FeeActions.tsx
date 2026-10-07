"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

/**
 * The fee decision as two icons on a row: ✓ verify (the student's application
 * opens at once) and ↩ return (asks for the reason, which the student is
 * emailed). Only on declarations still waiting; decided ones show no buttons.
 */
export function FeeActions({ id, student }: { id: string; student: string }) {
  const router = useRouter();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "verify" | "reject">(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "verify" | "reject") {
    setError(null);
    if (action === "verify" && !window.confirm(`Verify ${student}'s fee? Their application form opens straight away.`)) return;
    if (action === "reject" && note.trim().length < 5) {
      setError("Tell the student what was wrong.");
      return;
    }
    setBusy(action);
    try {
      const res = await fetch("/api/admin/fee", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, note: note.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't go through.");
      setReturning(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => decide("verify")}
        disabled={busy !== null}
        aria-label={`Verify ${student}'s fee`}
        data-tip="Verify fee"
        className="tip icon-btn !border-moss-400/60 !text-ok hover:!bg-moss-400/15 disabled:opacity-50"
      >
        {busy === "verify" ? (
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
          setReturning(true);
          setError(null);
        }}
        disabled={busy !== null}
        aria-label={`Return ${student}'s fee for correction`}
        data-tip="Return to student"
        className="tip icon-btn hover:!border-red-400/60 hover:!text-danger disabled:opacity-50"
      >
        <ReturnIcon />
      </button>

      {returning &&
        createPortal(
          <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby={`ret-${id}`}>
            <button type="button" aria-label="Close" onClick={() => setReturning(false)} className="absolute inset-0 bg-[rgb(4_8_20/0.72)] backdrop-blur-[3px]" />
            <div className="relative w-full max-w-md rounded-[18px] border border-line bg-[var(--panel-solid,#1B2645)] p-6 text-left shadow-2xl">
              <h2 id={`ret-${id}`} className="text-[1.1rem] font-semibold text-fg-strong">
                Return {student}&apos;s fee
              </h2>
              <p className="mt-1 text-[0.85rem] leading-relaxed text-muted">
                The status becomes <strong className="text-danger">Returned</strong> and the student is emailed this note, so they can send it again.
              </p>
              <textarea
                autoFocus
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. The slip shows EUR 100 but you declared EUR 150. Please send the correct one."
                className="field mt-4"
              />
              {error && (
                <p role="alert" className="mt-2 text-[0.85rem] text-danger">
                  {error}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setReturning(false)} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.88rem] text-muted hover:text-fg">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => decide("reject")}
                  disabled={busy !== null || note.trim().length < 5}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#D9473F] px-4 text-[0.88rem] font-semibold text-white disabled:opacity-50"
                >
                  <ReturnIcon />
                  {busy === "reject" ? "Returning…" : "Return to student"}
                </button>
              </div>
            </div>
          </div>,
          document.querySelector(".portal-shell") ?? document.body
        )}
      {error && !returning && (
        <span role="alert" className="block text-[0.75rem] text-danger">
          {error}
        </span>
      )}
    </>
  );
}

export function ReturnIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3.5L2.5 7 6 10.5" />
      <path d="M2.5 7H10a3.5 3.5 0 0 1 0 7H7.5" />
    </svg>
  );
}
