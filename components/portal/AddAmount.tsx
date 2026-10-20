"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, FINANCE_CURRENCIES } from "@/lib/portal/finance-categories";

/**
 * "+ Add amount": one button for any money in or out. Choose Income or
 * Expense, then the amount, date, who it came from (or went to), the
 * category, and a photo of the receipt.
 */

const INCOME = INCOME_CATEGORIES;
const EXPENSE = EXPENSE_CATEGORIES;
const CURRENCIES = FINANCE_CURRENCIES;

export function AddAmount({
  students,
  accounts = [],
}: {
  students: { id: string; name: string }[];
  /** The money accounts; the one chosen sets the currency. */
  accounts?: { id: string; name: string; currency: string; defaultIn: boolean }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"income" | "expense">("income");
  const firstAccount = accounts.find((a) => a.defaultIn) ?? accounts[0];
  const [accountId, setAccountId] = useState(firstAccount?.id ?? "");
  const [currency, setCurrency] = useState(firstAccount?.currency ?? "EUR");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"paid" | "due">("paid");
  const [vatMode, setVatMode] = useState<"none" | "reverse_charge">("none");
  const vatNum = parseFloat(amount.replace(/,/g, ""));
  const vatText = Number.isFinite(vatNum) ? `${(vatNum * 0.21).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : "21% of the amount";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    f.set("action", "add_entry");
    f.set("kind", kind);
    // An unticked box sends nothing: say "no" out loud.
    if (kind === "expense" && !f.get("partnerCost")) f.set("partnerCost", "0");
    // The student list is a convenience: picking one fills "from" when it is empty.
    const sid = String(f.get("studentId") ?? "");
    if (sid && !String(f.get("party") ?? "").trim()) f.set("party", students.find((s) => s.id === sid)?.name ?? "");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance", { method: "POST", body: f });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-moss-400 px-4 text-[0.84rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300"
      >
        + Add transaction
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="add-amount-title">
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-[rgb(4_8_20/0.72)] backdrop-blur-[3px]" />
            <form
              onSubmit={submit}
              className="relative max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-[18px] border border-line bg-[var(--panel-solid,#1B2645)] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 id="add-amount-title" className="text-[1.15rem] font-semibold text-fg-strong">
                  Add transaction
                </h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="icon-btn">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Money in or out">
                {(
                  [
                    ["income", "Income", "Money that came in"],
                    ["expense", "Expense", "Money that went out"],
                  ] as const
                ).map(([k, label, hint]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={cn(
                      "rounded-[12px] border p-3 text-left transition-colors",
                      kind === k
                        ? k === "income"
                          ? "border-[#4C8DF6] bg-[#4C8DF6]/10"
                          : "border-[#E8913A] bg-[#E8913A]/10"
                        : "border-line hover:border-[var(--line-strong)]"
                    )}
                  >
                    <span className="block text-[0.95rem] font-semibold text-fg">{label}</span>
                    <span className="block text-[0.78rem] text-faint">{hint}</span>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {accounts.length > 0 && (
                  <label className="block sm:col-span-2">
                    <span className="field-label">{kind === "income" ? "Received into" : "Paid from"}</span>
                    <select
                      name="accountId"
                      value={accountId}
                      onChange={(e) => {
                        setAccountId(e.target.value);
                        const a = accounts.find((x) => x.id === e.target.value);
                        if (a) setCurrency(a.currency);
                      }}
                      className="field"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="field-label">Amount</span>
                  <input name="amount" required inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className="field" placeholder="0.00" />
                </label>
                <label className="block">
                  <span className="field-label">Currency</span>
                  <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="field">
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Date</span>
                  <input name="date" type="date" required defaultValue={today} className="field" />
                </label>
                <label className="block">
                  <span className="field-label">Category</span>
                  <select name="category" key={kind} defaultValue={kind === "income" ? INCOME[0] : EXPENSE[0]} className="field">
                    {(kind === "income" ? INCOME : EXPENSE).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="field-label">{kind === "income" ? "Received from" : "Paid to"}</span>
                  <input name="party" maxLength={160} className="field" placeholder={kind === "income" ? "e.g. Ali Khan, or a university" : "e.g. Landlord, Facebook, a consultant"} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="field-label">Student (optional)</span>
                  <select name="studentId" defaultValue="" className="field">
                    <option value="">— Not about a student —</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="field-label">What for</span>
                  <input name="description" required maxLength={300} className="field" placeholder={kind === "income" ? "e.g. Second instalment, cash" : "e.g. October office rent"} />
                </label>
                {kind === "expense" && (
                  <label className="block">
                    <span className="field-label">Status</span>
                    <select name="status" value={status} onChange={(e) => setStatus(e.target.value as "paid" | "due")} className="field">
                      <option value="paid">Paid</option>
                      <option value="due">In process (not paid yet)</option>
                    </select>
                  </label>
                )}
                {kind === "expense" && status === "due" && (
                  <label className="block">
                    <span className="field-label">Liability</span>
                    <select name="liabilityTerm" defaultValue="short" className="field">
                      <option value="short">Short-term (due within a year)</option>
                      <option value="long">Long-term (due after a year)</option>
                    </select>
                  </label>
                )}
                {kind === "expense" && (
                  <label className="block sm:col-span-2">
                    <span className="field-label">VAT</span>
                    <select name="vatMode" value={vatMode} onChange={(e) => setVatMode(e.target.value as "none" | "reverse_charge")} className="field">
                      <option value="none">No VAT to declare</option>
                      <option value="reverse_charge">Reverse charge 21%: supplier outside Lithuania</option>
                    </select>
                    {vatMode === "reverse_charge" && (
                      <span className="mt-1 block text-[0.76rem] text-faint">
                        SnZ declares 21% VAT on this ({vatText}) to VMI and deducts the same 21%: the amount paid does not change.
                      </span>
                    )}
                  </label>
                )}
                {kind === "expense" && (
                  <label className="flex items-start gap-2.5 text-[0.88rem] text-fg sm:col-span-2">
                    <input name="partnerCost" type="checkbox" value="1" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                    <span>
                      The partners share this cost
                      <span className="block text-[0.76rem] text-faint">Untick for costs SnZ Ventures carries alone, like office rent, internet or phone.</span>
                    </span>
                  </label>
                )}
                <label className={kind === "expense" ? "block" : "block sm:col-span-2"}>
                  <span className="field-label">Proof: receipt photo or PDF</span>
                  <input name="receipt" type="file" accept=".pdf,image/*,application/pdf" className="field py-2 text-[0.85rem]" />
                </label>
              </div>

              {error && (
                <p role="alert" className="mt-4 text-[0.85rem] text-danger">
                  {error}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-[0.9rem] text-muted hover:text-fg">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center rounded-full bg-moss-400 px-6 text-[0.9rem] font-semibold text-[#070B1A] disabled:opacity-50">
                  {busy ? "Saving…" : kind === "income" ? "Add income" : "Add expense"}
                </button>
              </div>
            </form>
          </div>,
          document.querySelector(".portal-shell") ?? document.body
        )}
    </>
  );
}
