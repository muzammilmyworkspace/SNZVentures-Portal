"use client";

import { useState } from "react";
import type { AdminNote } from "@/lib/db/repos/operations";

/**
 * INTERNAL NOTES — staff only.
 *
 * This component is only ever rendered inside a `requireStaff` page, and the
 * API behind it re-checks the role on every method. The warning line is not
 * decoration: staff need to know, at the moment of typing, that this text is
 * kept out of the client's view — otherwise they either self-censor and the
 * notes become useless, or they write something believing it is private when
 * it is not.
 */
export function AdminNotes({
  subjectId,
  initialNotes,
  viewerName,
}: {
  subjectId: string;
  initialNotes: AdminNote[];
  viewerName: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, note: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Note not saved.");
        return;
      }
      setNotes((n) => [{ ...data.note, authorName: viewerName }, ...n]);
      setDraft("");
    } catch {
      setError("Network problem. Your note is still in the box.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const before = notes;
    setNotes((n) => n.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/admin/notes?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) setNotes(before); // put it back rather than lie about the delete
    } catch {
      setNotes(before);
    }
  }

  return (
    <div>
      <label htmlFor="note" className="field-label">
        Add a note
      </label>
      <textarea
        id="note"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={4000}
        placeholder="What was discussed, agreed or flagged."
        className="field min-h-24 resize-y"
      />
      <p className="mt-1.5 text-[0.75rem] text-faint">
        Internal only. Never shown to the client.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[0.8rem] text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={add}
        disabled={busy || !draft.trim()}
        className="label mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-4 text-fg transition-colors hover:border-moss-400/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save note"}
      </button>

      {notes.length > 0 && (
        <ul className="mt-6 space-y-4 border-t border-line pt-5">
          {notes.map((n) => (
            <li key={n.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.8rem] text-faint">
                  {n.authorName ?? "Staff"} ·{" "}
                  <time dateTime={n.createdAt}>
                    {new Date(n.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                </span>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="text-[0.75rem] text-faint transition-colors hover:text-danger"
                >
                  Delete
                </button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[0.9rem] leading-relaxed text-muted">
                {n.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
