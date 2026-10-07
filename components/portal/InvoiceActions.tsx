"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { InvoiceStatus } from "@/lib/invoices/model";

/**
 * MOVING AN INVOICE ALONG, AND GETTING IT OUT AS A PDF.
 *
 * Status is the only thing that can change once an invoice has been issued —
 * the database enforces the rest — so this is the whole of what the document
 * page can do to it.
 *
 * Voiding asks first and cannot be undone. That is not caution for its own
 * sake: the number stays in the sequence for good, and a cancelled invoice
 * that could be reopened would put a number back in circulation after the
 * payer had been told to ignore it.
 */
export function InvoiceActions({
  id,
  status,
  number,
}: {
  id: string;
  status: InvoiceStatus;
  number: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(next: InvoiceStatus) {
    if (next === "void" && !confirm(`Void ${number}? This cannot be undone — the number stays used, and you would raise a new invoice instead.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setError(data.error ?? "That did not work.");
      else router.refresh();
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  const btn =
    "inline-flex min-h-11 items-center rounded-full px-4 font-[family-name:var(--font-display)] text-[0.95rem] font-semibold transition-colors disabled:opacity-50";

  return (
    <>
      {status !== "void" && (
        <select
          aria-label="Invoice status"
          value={status}
          disabled={busy}
          onChange={(e) => move(e.target.value as InvoiceStatus)}
          className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-raised px-3 text-[0.86rem] text-fg disabled:opacity-50"
        >
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="void">Void…</option>
        </select>
      )}

      <button
        type="button"
        onClick={() => window.print()}
        className={`${btn} bg-moss-400 text-navy-950 hover:bg-moss-300`}
      >
        Download PDF
      </button>

      {error && (
        <span className="w-full text-[0.82rem] text-danger" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

const iconPath = {
  eye: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  download: "M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9",
  void: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM3.8 3.8l8.4 8.4",
};

function RowIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/**
 * The icons on each row of the invoice list: view, download (opens the
 * document and its print dialog, where "Save as PDF" is), and delete for a
 * draft or void for an issued invoice. An issued invoice is never deleted:
 * its number stays in the sequence.
 */
export function InvoiceRowActions({ id, number, status }: { id: string; number: string; status: InvoiceStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete draft ${number}? It has not been sent to anyone. This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setError(data.error ?? "That did not work.");
      else router.refresh();
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  async function voidIt() {
    if (!confirm(`Void ${number}? Issued invoices are not deleted: the number stays in sequence, marked void. This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "void" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setError(data.error ?? "That did not work.");
      else router.refresh();
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-2">
        <a href={`/portal/admin/invoices/${id}`} aria-label={`Open invoice ${number}`} data-tip="View invoice" className="tip icon-btn">
          <RowIcon d={iconPath.eye} />
        </a>
        <a href={`/portal/admin/invoices/${id}?print=1`} aria-label={`Download invoice ${number}`} data-tip="Download PDF" className="tip icon-btn">
          <RowIcon d={iconPath.download} />
        </a>
        {status === "draft" ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label={`Delete draft ${number}`}
            data-tip="Delete draft"
            className="tip tip-end icon-btn hover:!border-red-400/60 hover:!text-danger disabled:opacity-40"
          >
            <RowIcon d={iconPath.trash} />
          </button>
        ) : status !== "void" ? (
          <button
            type="button"
            onClick={voidIt}
            disabled={busy}
            aria-label={`Void ${number}`}
            data-tip="Void (issued invoices are kept)"
            className="tip tip-end icon-btn hover:!border-red-400/60 hover:!text-danger disabled:opacity-40"
          >
            <RowIcon d={iconPath.void} />
          </button>
        ) : (
          <span aria-hidden className="inline-block h-9 w-9" />
        )}
      </span>
      {error && (
        <span role="alert" className="max-w-[16rem] text-right text-[0.75rem] text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

/** Opens the print dialog once the invoice has rendered ("Save as PDF" is there). */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return null;
}
