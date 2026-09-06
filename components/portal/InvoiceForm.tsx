"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CURRENCIES,
  formatMoney,
  parseAmount,
  parseVatPercent,
  vatOn,
  type CurrencyCode,
} from "@/lib/invoices/model";

/**
 * RAISING AN INVOICE.
 *
 * The running total is worked out from the same functions the server will use
 * to store it — imported, not reimplemented. A form that adds up differently
 * from the document it produces is worse than one that shows no total at all,
 * because the wrong figure is the one somebody checks against.
 *
 * The number is NOT shown here. It is claimed by the database at save, so
 * displaying "SNZ-2026-004" on a form two people might have open would promise
 * one of them a number they will not get.
 */

type Line = { desc: string; amount: string };

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export function InvoiceForm() {
  const router = useRouter();

  const [billToName, setBillToName] = useState("");
  const [billToEmail, setBillToEmail] = useState("");
  const [billToAddress, setBillToAddress] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("EUR");
  const [vatPercent, setVatPercent] = useState("0");
  const [issuedOn, setIssuedOn] = useState(today);
  const [dueOn, setDueOn] = useState(() => inDays(14));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ desc: "Consultancy fee", amount: "" }]);

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => sum + (parseAmount(l.amount) ?? 0), 0);
    const bp = parseVatPercent(vatPercent) ?? 0;
    const vat = vatOn(subtotal, bp);
    return { subtotal, vat, total: subtotal + vat, bp };
  }, [lines, vatPercent]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billToName, billToEmail, billToAddress,
          currency, vatPercent, issuedOn, dueOn, notes, lines,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrors(data.errors ?? [data.error ?? "The invoice could not be saved."]);
      } else {
        router.push(`/portal/admin/invoices/${data.invoice.id}`);
        return;
      }
    } catch {
      setErrors(["Could not reach the server. Nothing was saved — try again."]);
    }
    setBusy(false);
  }

  const field = "min-h-11 w-full rounded-[var(--radius-sm)] border border-line bg-raised px-3 text-[0.88rem] text-fg placeholder:text-faint";

  return (
    <div className="space-y-5">
      <Panelish title="Who it goes to">
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Name on the invoice *">
            <input
              className={field}
              value={billToName}
              onChange={(e) => setBillToName(e.target.value)}
              placeholder="Haider Khwaja"
              maxLength={160}
              autoFocus
            />
          </Field>
          <Field label="Email (optional)">
            <input
              className={field}
              value={billToEmail}
              onChange={(e) => setBillToEmail(e.target.value)}
              placeholder="name@example.com"
              inputMode="email"
            />
          </Field>
        </div>
        <Field label="Address (optional)">
          <textarea
            className={`${field} min-h-20 py-2.5`}
            value={billToAddress}
            onChange={(e) => setBillToAddress(e.target.value)}
            placeholder="Street, city, country"
          />
        </Field>
        <p className="text-[0.8rem] leading-relaxed text-faint">
          Anybody can be invoiced — they do not need a portal account. Most first conversations
          happen on WhatsApp long before anybody signs in.
        </p>
      </Panelish>

      <Panelish title="What for">
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                className={`${field} min-w-[220px] flex-1`}
                value={line.desc}
                onChange={(e) => setLine(i, { desc: e.target.value })}
                placeholder="Consultancy fee — first instalment"
                maxLength={200}
              />
              <input
                className={`${field} w-40 tabular-nums`}
                value={line.amount}
                onChange={(e) => setLine(i, { amount: e.target.value })}
                placeholder="500.00"
                inputMode="decimal"
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  onClick={() => setLines((p) => p.filter((_, n) => n !== i))}
                  className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-3 text-muted transition-colors hover:text-danger"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLines((p) => [...p, { desc: "", amount: "" }])}
          className="label mt-3 inline-flex min-h-9 items-center rounded-[var(--radius-sm)] border border-line px-3 text-muted transition-colors hover:text-fg"
        >
          + Add another line
        </button>
      </Panelish>

      <Panelish title="Money and dates">
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Currency">
            <select
              className={field}
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            >
              {Object.entries(CURRENCIES).map(([code, c]) => (
                <option key={code} value={code}>
                  {code} — {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="VAT / tax %">
            <input
              className={`${field} tabular-nums`}
              value={vatPercent}
              onChange={(e) => setVatPercent(e.target.value)}
              placeholder="0"
              inputMode="decimal"
            />
          </Field>
          <Field label="Invoice date">
            <input type="date" className={field} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          </Field>
          <Field label="Due date">
            <input type="date" className={field} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes on the invoice (optional)">
          <textarea
            className={`${field} min-h-20 py-2.5`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Instalment terms, a reference, anything the payer should see."
          />
        </Field>

        <div className="rounded-[var(--radius-sm)] border border-line bg-raised p-3.5 text-[0.86rem] text-muted">
          Subtotal <strong className="font-semibold tabular-nums text-fg">{formatMoney(totals.subtotal, currency)}</strong>
          {totals.bp > 0 && (
            <>
              {" · "}VAT {totals.bp / 100}%{" "}
              <strong className="font-semibold tabular-nums text-fg">{formatMoney(totals.vat, currency)}</strong>
            </>
          )}
          {" · "}Total{" "}
          <strong className="font-semibold tabular-nums text-fg-strong">{formatMoney(totals.total, currency)}</strong>
        </div>
      </Panelish>

      {errors.length > 0 && (
        <ul className="space-y-1.5 rounded-[var(--radius-sm)] border border-red-500/40 bg-red-500/10 p-4 text-[0.85rem] leading-relaxed text-fg">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save and open it"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/portal/admin/invoices")}
          className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-5 text-muted transition-colors hover:text-fg"
        >
          Cancel
        </button>
      </div>

      <p className="text-[0.8rem] leading-relaxed text-faint">
        It is saved as a <strong className="font-semibold text-fg">draft</strong>, and the number is
        issued at that moment. A draft can still be corrected; once you mark it sent or paid it is
        fixed, and a mistake is handled by voiding it and raising another — which is what keeps the
        copy in somebody&rsquo;s inbox and the copy here from quietly disagreeing.
      </p>
    </div>
  );
}

/* Local shells so this file matches the portal without importing a server
   component into a client bundle. */
function Panelish({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-gradient-to-b from-[color-mix(in_srgb,var(--fg)_5%,transparent)] to-[color-mix(in_srgb,var(--fg)_2%,transparent)] p-5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--fg)_9%,transparent)]">
      <h2 className="mb-4 text-[0.82rem] font-bold text-fg-strong">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="label mb-1.5 block text-faint">{label}</span>
      {children}
    </label>
  );
}
