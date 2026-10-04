"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
