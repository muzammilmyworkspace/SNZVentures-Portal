"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { StatusPill } from "./Pieces";
import { cn } from "@/lib/utils";

type Doc = {
  id: string;
  name: string;
  category: string;
  status: string;
  /** Needed for the whole-file download and for grouping. */
  ownerId: string;
  ownerName?: string;
  /** What was said the last time this was sent back. */
  reviewNote?: string | null;
  sizeBytes: number | null;
  updatedAt: string;
};

/**
 * STAFF DOCUMENT REVIEW, GROUPED BY THE PERSON IT BELONGS TO.
 * ---------------------------------------------------------------------------
 * This was one flat table of every document from every client, newest first.
 * With one client that reads fine. With twenty it is a wall in which the same
 * name repeats eleven times and nothing tells you whether you have finished
 * with anybody — reviewing a file meant scanning the whole list for their rows
 * and hoping you found them all.
 *
 * A file is a per-person thing, so the screen is too. Each client is one
 * section with their documents inside it, a count of what is still waiting,
 * and the archive link for the lot.
 *
 * OPEN WHEN THERE IS SOMETHING TO DO, closed when there is not. Staff come
 * here to action what is waiting; a client whose documents are all approved is
 * a row to scroll past, not a section to collapse by hand every time.
 *
 * The download link points at /api/portal/documents/[id], which authorises the
 * request and mints a ~2-minute signed URL. The underlying storage key is
 * never sent to the browser.
 */

const AWAITING = "uploaded";

export function DocumentReview({ documents }: { documents: Doc[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
    Which document is being sent back, and why.

    Sending something back is a two-step action deliberately: the reason is the
    whole message the client receives, and a one-click reject would produce
    "needs attention" with nothing to act on. Approve stays one click, because
    approving explains itself.
  */
  const [returning, setReturning] = useState<{ id: string; status: string } | null>(null);
  const [reason, setReason] = useState("");

  /*
    Grouped in insertion order, which is the order the query returned — newest
    upload first. So the client who sent something ten minutes ago is at the
    top, which is who staff are usually here for.
  */
  const groups = useMemo(() => {
    const byOwner = new Map<string, { name: string; docs: Doc[] }>();
    for (const doc of documents) {
      const existing = byOwner.get(doc.ownerId);
      if (existing) existing.docs.push(doc);
      else byOwner.set(doc.ownerId, { name: doc.ownerName ?? "Unnamed client", docs: [doc] });
    }
    return [...byOwner.entries()].map(([ownerId, group]) => ({
      ownerId,
      name: group.name,
      docs: group.docs,
      waiting: group.docs.filter((d) => d.status === AWAITING).length,
    }));
  }, [documents]);

  const [closed, setClosed] = useState<Set<string>>(new Set());
  const isOpen = (g: { ownerId: string; waiting: number }) =>
    closed.has(g.ownerId) ? false : g.waiting > 0;

  const toggle = (ownerId: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      // `closed` holds the exceptions, so toggling works in both directions:
      // it closes a section that is open by default, and opens one that is not.
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });

  async function review(documentId: string, status: string, note?: string) {
    setBusy(documentId);
    setError(null);
    try {
      const res = await fetch("/api/portal/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, status, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That action failed.");
        return;
      }
      setReturning(null);
      setReason("");
      startTransition(() => router.refresh());
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const size = (b: number | null) =>
    b === null ? "—" : b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;

  const ACTIONS = [
    { s: "approved", label: "Approve", cls: "border-moss-400/40 text-accent hover:border-moss-400" },
    { s: "needs_update", label: "Request update", cls: "border-line text-muted hover:border-amber-400/50 hover:text-warn" },
    { s: "rejected", label: "Reject", cls: "border-line text-muted hover:border-red-400/50 hover:text-danger" },
  ];

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem]">
          {error}
        </p>
      )}

      {groups.map((group) => {
        const open = isOpen(group);
        return (
          <section
            key={group.ownerId}
            className={cn(
              "overflow-hidden rounded-[var(--radius-md)] border transition-colors",
              group.waiting > 0 ? "border-moss-400/40" : "border-line"
            )}
          >
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-raised px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => toggle(group.ownerId)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span
                  aria-hidden
                  className={cn(
                    "shrink-0 text-[0.7rem] text-faint transition-transform",
                    open && "rotate-90"
                  )}
                >
                  ▶
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.95rem] font-semibold text-fg">
                    {group.name}
                  </span>
                  <span className="block text-[0.78rem] text-faint">
                    {group.docs.length} document{group.docs.length === 1 ? "" : "s"}
                    {group.waiting > 0 && (
                      <>
                        {" · "}
                        <span className="text-accent">{group.waiting} waiting on you</span>
                      </>
                    )}
                  </span>
                </span>
              </button>

              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <a
                  href={`/api/admin/documents/zip?userId=${group.ownerId}`}
                  className="label text-[0.65rem] text-accent underline underline-offset-4"
                >
                  Download all (.zip)
                </a>
                <Link
                  prefetch={false}
                  href={`/portal/admin/users/${group.ownerId}`}
                  className="label text-[0.65rem] text-muted underline underline-offset-4 transition-colors hover:text-fg"
                >
                  Open file
                </Link>
              </div>
            </header>

            {open && (
              <ul className="divide-y divide-line">
                {group.docs.map((d) => (
                  <li
                    key={d.id}
                    className={cn(
                      "flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5",
                      busy === d.id && "opacity-50"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/api/portal/documents/${d.id}`}
                        className="block truncate text-[0.9rem] text-fg underline underline-offset-4 hover:text-accent"
                      >
                        {d.name}
                      </a>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.75rem] text-faint">
                        {d.category}
                        <span aria-hidden>·</span>
                        {size(d.sizeBytes)}
                        <span aria-hidden>·</span>
                        {/*
                          OPENING AND SAVING ARE DIFFERENT JOBS. The name opens
                          it in the browser's viewer, which is what you want
                          when checking one; this asks the store to send it as
                          an attachment instead.
                        */}
                        <a
                          href={`/api/portal/documents/${d.id}?download=1`}
                          className="text-accent underline underline-offset-4"
                        >
                          Download
                        </a>
                      </span>
                    </div>

                    <StatusPill status={d.status} label={d.status.replace(/_/g, " ")} />

                    <div className="flex flex-wrap gap-2">
                      {ACTIONS.map((b) => (
                        <button
                          key={b.s}
                          type="button"
                          disabled={pending || busy === d.id || d.status === b.s}
                          onClick={() =>
                            b.s === "approved"
                              ? review(d.id, b.s)
                              : (setReturning({ id: d.id, status: b.s }), setReason(""))
                          }
                          className={cn(
                            "label rounded-[var(--radius-sm)] border px-3 py-1.5 transition-colors disabled:opacity-40",
                            b.cls
                          )}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>

                    {/*
                      THE REASON IS THE MESSAGE. It is what the client is sent
                      and what they will act on, so it is written here, against
                      the document it belongs to, rather than typed into a chat
                      thread where it loses the thing it refers to.
                    */}
                    {returning?.id === d.id && (
                      <div className="w-full rounded-[var(--radius-sm)] border border-line bg-raised p-4">
                        <label htmlFor={`note-${d.id}`} className="field-label">
                          {returning.status === "needs_update"
                            ? "What should they send instead?"
                            : "Why is this not accepted?"}
                        </label>
                        <textarea
                          id={`note-${d.id}`}
                          rows={2}
                          autoFocus
                          className="field min-h-16 resize-y"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={
                            returning.status === "needs_update"
                              ? "e.g. The MOFA stamp is cut off at the bottom — please rescan the full page."
                              : "e.g. This is the front of the CNIC only. Both sides are needed, in one PDF."
                          }
                        />
                        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
                          They get this word for word, with a link to replace
                          this document.
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy === d.id || reason.trim().length < 5}
                            onClick={() => review(d.id, returning.status, reason.trim())}
                            className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-4 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-50"
                          >
                            {busy === d.id ? "Sending…" : "Send it back"}
                          </button>
                          <button
                            type="button"
                            disabled={busy === d.id}
                            onClick={() => setReturning(null)}
                            className="label inline-flex min-h-11 items-center px-2 text-faint transition-colors hover:text-fg"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* What was said last time, so nobody repeats it. */}
                    {d.reviewNote && returning?.id !== d.id && (
                      <p className="w-full text-[0.78rem] leading-relaxed text-warn">
                        Sent back: {d.reviewNote}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
