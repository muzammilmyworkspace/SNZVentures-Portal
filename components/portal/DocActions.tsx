"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The review controls for one document, in the documents panel.
 *
 *   ✓        approve it
 *   comment  ask the student for a new copy: the comment goes to them in the
 *            portal and by email, and the file is marked "needs update"
 *
 * Both go through PATCH /api/portal/documents, the same route the old
 * Documents page used, so the rules (a reason is required to send something
 * back; a consultant only reaches their own students) live in one place.
 */
export function DocActions({ id, name, status }: { id: string; name: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "send">(null);
  const [error, setError] = useState<string | null>(null);
  const approved = status === "approved";

  async function review(next: "approved" | "needs_update") {
    if (next === "needs_update" && note.trim().length < 5) {
      setError("Say what is wrong so they can fix it.");
      return;
    }
    setBusy(next === "approved" ? "approve" : "send");
    setError(null);
    try {
      const res = await fetch("/api/portal/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id, status: next, note: next === "approved" ? undefined : note.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => review("approved")}
        disabled={approved || busy !== null}
        aria-label={approved ? `${name} is approved` : `Approve ${name}`}
        data-tip={approved ? "Approved" : "Approve"}
        className="tip icon-btn hover:!border-[var(--accent)] hover:!text-accent disabled:cursor-default"
      >
        {busy === "approve" ? (
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
          setOpen((o) => !o);
          setError(null);
        }}
        aria-expanded={open}
        aria-label={`Ask for a new copy of ${name}`}
        data-tip="Ask for a new copy"
        className={`tip tip-end icon-btn ${open ? "!border-[var(--danger-line)] !text-danger" : ""}`}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 w-full basis-full rounded-[10px] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-3">
          <label htmlFor={`note-${id}`} className="label text-[0.68rem] text-faint">
            What is wrong with this file?
          </label>
          <textarea
            id={`note-${id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. The scan is blurred and the expiry date cannot be read. Please upload a clear colour copy."
            className="field mt-1 w-full resize-y text-[0.85rem]"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[0.75rem] text-faint">The student gets this in the portal and by email.</span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] text-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => review("needs_update")}
                disabled={busy !== null}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--danger)] px-4 text-[0.82rem] font-semibold text-[#160606] disabled:opacity-50"
              >
                {busy === "send" ? "Sending…" : "Send to student"}
              </button>
            </span>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 w-full basis-full text-right text-[0.78rem] text-danger">
          {error}
        </p>
      )}
    </>
  );
}

/** "Approve all" at the top of the panel: every uploaded file still waiting. */
export function ApproveAll({ userId, waiting }: { userId: string; waiting: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (waiting === 0) return null;
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/admin/documents/approve-all", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId }),
            });
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "That didn't save.");
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--accent)] px-4 text-[0.85rem] font-semibold text-accent transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] disabled:opacity-50"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
          <path d="M1.5 8.5l3 3 7-7M7.5 11.5l7-7" />
        </svg>
        {busy ? "Approving…" : `Approve all (${waiting})`}
      </button>
      {error && <span className="mt-1 text-[0.75rem] text-danger">{error}</span>}
    </span>
  );
}
