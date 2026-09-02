"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusPill } from "./Pieces";
import { cn } from "@/lib/utils";

type Doc = {
  id: string;
  name: string;
  category: string;
  status: string;
  /** Needed for the whole-file download; the row already knows the name. */
  ownerId: string;
  ownerName?: string;
  sizeBytes: number | null;
  updatedAt: string;
};

/**
 * Staff document review.
 *
 * The download link points at /api/portal/documents/[id], which authorises the
 * request and mints a ~2-minute signed URL. The underlying storage key is
 * never sent to the browser.
 */
export function DocumentReview({ documents }: { documents: Doc[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(documentId: string, status: string) {
    setBusy(documentId);
    setError(null);
    try {
      const res = await fetch("/api/portal/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, status }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? "That action failed.");
      else startTransition(() => router.refresh());
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const size = (b: number | null) =>
    b === null ? "—" : b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;

  return (
    <>
      {error && (
        <p role="alert" className="border-b border-line bg-red-500/10 px-5 py-3 text-[0.85rem] text-danger">
          {error}
        </p>
      )}
      <div className="rail overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <caption className="sr-only">Documents awaiting review</caption>
          <thead>
            <tr className="border-b border-line">
              {["Document", "Client", "Size", "Status", "Actions"].map((h) => (
                <th key={h} scope="col" className="label px-5 py-3 text-faint">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className={cn("border-b border-line last:border-0", busy === d.id && "opacity-50")}>
                <td className="px-5 py-3">
                  <a
                    href={`/api/portal/documents/${d.id}`}
                    className="text-[0.9rem] text-fg underline underline-offset-4 hover:text-accent"
                  >
                    {d.name}
                  </a>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.75rem] text-faint">
                    {d.category}
                    <span aria-hidden>·</span>
                    {/*
                      OPENING AND SAVING ARE DIFFERENT JOBS. The name opens the
                      document in the browser's viewer, which is what you want
                      when checking one. This asks the store to send it as an
                      attachment instead — staff were opening each one and
                      saving it by hand, eleven times for one client.
                    */}
                    <a
                      href={`/api/portal/documents/${d.id}?download=1`}
                      className="text-accent underline underline-offset-4"
                    >
                      Download
                    </a>
                  </span>
                </td>
                <td className="px-5 py-3 text-[0.85rem] text-muted">
                  {d.ownerName ?? "—"}
                  {/*
                    The real complaint was not that one download was hard — it
                    was doing it eleven times. This takes everything on that
                    client's file in a single archive, named after them.
                  */}
                  <a
                    href={`/api/admin/documents/zip?userId=${d.ownerId}`}
                    className="mt-0.5 block text-[0.75rem] text-accent underline underline-offset-4"
                  >
                    All their files (.zip)
                  </a>
                </td>
                <td className="px-5 py-3 text-[0.85rem] text-faint">{size(d.sizeBytes)}</td>
                <td className="px-5 py-3">
                  <StatusPill status={d.status} label={d.status.replace(/_/g, " ")} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { s: "approved", label: "Approve", cls: "border-moss-400/40 text-accent hover:border-moss-400" },
                      { s: "needs_update", label: "Request update", cls: "border-line text-muted hover:border-amber-400/50 hover:text-warn" },
                      { s: "rejected", label: "Reject", cls: "border-line text-muted hover:border-red-400/50 hover:text-danger" },
                    ].map((b) => (
                      <button
                        key={b.s}
                        type="button"
                        disabled={pending}
                        onClick={() => review(d.id, b.s)}
                        className={cn(
                          "label rounded-[var(--radius-sm)] border px-3 py-1.5 transition-colors",
                          b.cls
                        )}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
