"use client";

import { useState, type FormEvent } from "react";
import { money, scheduleFor, type PaymentSettings } from "@/lib/portal/payment-plan";

type Amounts = "initialFee" | "oneTimeOfferLetter" | "installmentOfferLetter" | "installmentVisa";
type BankKey = keyof PaymentSettings["bank"];

const AMOUNTS: { key: Amounts; label: string; hint: string }[] = [
  { key: "initialFee", label: "Initial process fee", hint: "Paid first on both plans" },
  { key: "oneTimeOfferLetter", label: "One-time: at offer letter", hint: "The rest, in one payment" },
  { key: "installmentOfferLetter", label: "Installments: phase 2", hint: "When the offer letter arrives" },
  { key: "installmentVisa", label: "Installments: phase 3", hint: "When the visa application is made" },
];

const BANK: { key: BankKey; label: string; mono?: boolean }[] = [
  { key: "accountTitle", label: "Account title" },
  { key: "bankName", label: "Bank name" },
  { key: "iban", label: "IBAN", mono: true },
  { key: "accountNumber", label: "Account number (optional)", mono: true },
  { key: "swift", label: "SWIFT / BIC (optional)", mono: true },
];

export function PaymentSettingsForm({ initial }: { initial: PaymentSettings }) {
  const [s, setS] = useState<PaymentSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setAmount = (k: Amounts, v: string) => setS((p) => ({ ...p, [k]: Math.max(0, Number(v) || 0) }));
  const setBank = (k: BankKey, v: string) => setS((p) => ({ ...p, bank: { ...p.bank, [k]: v } }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; settings?: PaymentSettings };
      if (!res.ok || !data.ok) setMsg({ ok: false, text: data.error ?? "Could not save." });
      else {
        if (data.settings) setS(data.settings);
        setMsg({ ok: true, text: "Saved. Students see the new details straight away." });
      }
    } catch {
      setMsg({ ok: false, text: "Network problem. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-7">
      <section>
        <h2 className="text-[0.95rem] font-semibold text-fg-strong">Amounts</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="mb-1.5 block text-[0.82rem] font-medium text-muted">Currency</span>
            <input className="field" value={s.currency} maxLength={5} onChange={(e) => setS((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} />
          </label>
          {AMOUNTS.map((a) => (
            <label key={a.key} className="block">
              <span className="mb-1.5 block text-[0.82rem] font-medium text-muted">{a.label}</span>
              <input className="field" type="number" min={0} step="any" value={s[a.key]} onChange={(e) => setAmount(a.key, e.target.value)} />
              <span className="mt-1 block text-[0.75rem] text-faint">{a.hint}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-[0.82rem] text-muted">
          One-time total {money(scheduleFor("one_time", s).reduce((n, p) => n + p.amount, 0), s.currency)} · Installments total{" "}
          {money(scheduleFor("installments", s).reduce((n, p) => n + p.amount, 0), s.currency)}
        </p>
      </section>

      <section>
        <h2 className="text-[0.95rem] font-semibold text-fg-strong">Bank details on the voucher</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {BANK.map((b) => (
            <label key={b.key} className="block">
              <span className="mb-1.5 block text-[0.82rem] font-medium text-muted">{b.label}</span>
              <input className={`field ${b.mono ? "font-mono" : ""}`} value={s.bank[b.key]} onChange={(e) => setBank(b.key, e.target.value)} />
            </label>
          ))}
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[0.82rem] font-medium text-muted">Note for students (optional)</span>
            <input
              className="field"
              value={s.bank.note}
              placeholder="e.g. Transfers from Pakistan: pay the PKR equivalent on the day of transfer."
              onChange={(e) => setBank("note", e.target.value)}
            />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="font-[family-name:var(--font-display)] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-6 text-[0.95rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && (
          <p role="status" className={`text-[0.88rem] ${msg.ok ? "text-ok" : "text-danger"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}
