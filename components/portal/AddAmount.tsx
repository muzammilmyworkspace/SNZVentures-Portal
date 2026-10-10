"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * "+ Add amount": one button for any money in or out. Choose Income or
 * Expense, then the amount, date, who it came from (or went to), the
 * category, and a photo of the receipt.
 */

const INCOME = ["Student fees", "University commission", "Invoices", "Consultancy", "Other income"];
const EXPENSE = [
  "Rent",
  "Salaries",
  "Software & subscriptions",
  "Marketing & ads",
  "Utilities & internet",
  "Travel",
  "Office & supplies",
  "Bank & payment fees",
  "Taxes",
  "Commission",
  "Other",
];
const CURRENCIES = ["EUR", "PKR", "USD", "GBP"];

export function AddAmount({ students }: { students: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    f.set("action", "add_entry");
    f.set("kind", kind);
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
                <label className="block">
                  <span className="field-label">Amount</span>
                  <input name="amount" required inputMode="decimal" autoFocus className="field" placeholder="0.00" />
                </label>
                <label className="block">
                  <span className="field-label">Currency</span>
                  <select name="currency" defaultValue="EUR" className="field">
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
                    <select name="status" defaultValue="paid" className="field">
                      <option value="paid">Paid</option>
                      <option value="due">Due (not paid yet)</option>
                    </select>
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
