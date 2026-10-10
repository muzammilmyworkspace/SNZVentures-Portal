"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, FINANCE_CURRENCIES } from "@/lib/portal/finance-categories";

/**
 * The forms and row buttons of the Finance section (super admin). All post
 * to /api/admin/finance as multipart with an `action`.
 */

const PRIMARY =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-moss-400 px-5 text-[0.9rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50";
const CURRENCIES = FINANCE_CURRENCIES;

async function post(fields: Record<string, string | File | null | undefined>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) form.set(k, v);
  const res = await fetch("/api/admin/finance", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return { ok: Boolean(res.ok && data.ok), error: data.error ?? (res.ok ? undefined : "That didn't save.") };
}

/* ------------------------------------------- a button that opens a form */

const CloseModal = createContext<(() => void) | null>(null);
/** Inside a ModalButton: closes it (a no-op elsewhere). */
const useCloseModal = () => useContext(CloseModal) ?? (() => {});

/**
 * The "+ Add …" button at the top right of a list: opens its form in a
 * window, which closes by itself when the form saves.
 */
export function ModalButton({
  label,
  title,
  children,
  variant = "primary",
  wide = false,
}: {
  label: string;
  title: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "inline-flex min-h-9 items-center gap-1.5 rounded-full bg-moss-400 px-4 text-[0.84rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300"
            : "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-4 text-[0.84rem] font-medium text-fg transition-colors hover:border-[var(--accent)] hover:text-accent"
        }
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-[rgb(4_8_20/0.72)] backdrop-blur-[3px]" />
            <div className={`relative max-h-[calc(100dvh-2rem)] w-full ${wide ? "max-w-3xl" : "max-w-xl"} overflow-y-auto rounded-[18px] border border-line bg-[var(--panel-solid,#1B2645)] p-6 text-left shadow-2xl`}>
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="text-[1.15rem] font-semibold text-fg-strong">{title}</h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="icon-btn">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
              <CloseModal.Provider value={() => setOpen(false)}>{children}</CloseModal.Provider>
            </div>
          </div>,
          document.querySelector(".portal-shell") ?? document.body
        )}
    </>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/* ------------------------------------------------------------ entry */

export function AddEntryForm({
  kind,
  categories,
  defaultDate,
  storageOn,
}: {
  kind: "income" | "expense";
  categories: readonly string[];
  defaultDate: string;
  storageOn: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setDone(false);
    const r = await post({
      action: "add_entry",
      kind,
      category: String(f.get("category") ?? ""),
      description: String(f.get("description") ?? ""),
      amount: String(f.get("amount") ?? ""),
      currency: String(f.get("currency") ?? "EUR"),
      date: String(f.get("date") ?? ""),
      status: String(f.get("status") ?? "paid"),
      receipt: (f.get("receipt") as File | null) ?? null,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't save.");
    formRef.current?.reset();
    setDone(true);
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <label className="block lg:col-span-2">
        <span className="field-label">What for</span>
        <input name="description" required maxLength={300} className="field" placeholder={kind === "income" ? "e.g. Cash from walk-in client" : "e.g. Facebook ads, October"} />
      </label>
      <label className="block">
        <span className="field-label">Category</span>
        <select name="category" className="field" defaultValue={categories[0]}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">Amount</span>
        <input name="amount" required inputMode="decimal" className="field" placeholder="0.00" />
      </label>
      <label className="block">
        <span className="field-label">Currency</span>
        <select name="currency" className="field" defaultValue="EUR">
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">Date</span>
        <input name="date" type="date" required defaultValue={defaultDate} className="field" />
      </label>
      {kind === "expense" && (
        <>
          <label className="block">
            <span className="field-label">Status</span>
            <select name="status" className="field" defaultValue="paid">
              <option value="paid">Paid</option>
              <option value="due">Due (not paid yet)</option>
            </select>
          </label>
          <label className="block lg:col-span-3">
            <span className="field-label">Receipt (optional)</span>
            <input
              name="receipt"
              type="file"
              disabled={!storageOn}
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
              className="field py-2 text-[0.85rem]"
            />
            {!storageOn && <span className="mt-1 block text-[0.75rem] text-faint">File storage is not set up here.</span>}
          </label>
        </>
      )}
      <div className="flex items-end gap-3 lg:col-span-2">
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Saving…" : kind === "income" ? "Add income" : "Add expense"}
        </button>
        {done && <span className="pb-2.5 text-[0.85rem] text-ok">Added.</span>}
      </div>
      {error && (
        <p role="alert" className="text-[0.85rem] text-danger sm:col-span-2 lg:col-span-6">
          {error}
        </p>
      )}
    </form>
  );
}

export function EntryRowActions({
  id,
  status,
  deletable,
  receiptHref,
  canToggle,
}: {
  id: string;
  status: "paid" | "due";
  deletable: boolean;
  receiptHref: string | null;
  canToggle: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(fields: Record<string, string>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const r = await post(fields);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        {canToggle && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act({ action: "entry_status", id, status: status === "paid" ? "due" : "paid" })}
            data-tip={status === "paid" ? "Mark as due" : "Mark as paid"}
            aria-label={status === "paid" ? "Mark as due" : "Mark as paid"}
            className={cn("tip icon-btn", status === "due" && "!border-moss-400/60 !text-ok")}
          >
            <Icon d={status === "paid" ? "M8 4.5V8l2.5 1.5 M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z" : "M3 8.5l3 3 7-7"} />
          </button>
        )}
        {receiptHref && (
          <a href={receiptHref} target="_blank" rel="noopener noreferrer" data-tip="Receipt" aria-label="Open the receipt" className="tip icon-btn">
            <Icon d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3 M5.5 8h5 M5.5 10.5h5" />
          </a>
        )}
        {deletable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act({ action: "delete_entry", id }, "Delete this entry?")}
            data-tip="Delete"
            aria-label="Delete"
            className="tip tip-end icon-btn hover:!border-red-400/60 hover:!text-danger"
          >
            <Icon d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
          </button>
        )}
      </span>
      {error && <span className="text-[0.72rem] text-danger">{error}</span>}
    </span>
  );
}

/* ------------------------------------------------------- fixed costs */

export function RecurringForm({ categories, thisMonth }: { categories: readonly string[]; thisMonth: string }) {
  const router = useRouter();
  const close = useCloseModal();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await post({
      action: "add_recurring",
      name: String(f.get("name") ?? ""),
      category: String(f.get("category") ?? ""),
      amount: String(f.get("amount") ?? ""),
      currency: String(f.get("currency") ?? "EUR"),
      day: String(f.get("day") ?? "1"),
      starts: String(f.get("starts") ?? thisMonth),
      autoPaid: f.get("autoPaid") ? "1" : "0",
      partnerCost: f.get("partnerCost") ? "1" : "0",
      bill: (f.get("bill") as File | null) ?? null,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't save.");
    formRef.current?.reset();
    router.refresh();
    close();
  }

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="field-label">Name</span>
        <input name="name" required maxLength={160} className="field" placeholder="e.g. Office rent" />
      </label>
      <label className="block">
        <span className="field-label">Category</span>
        <select name="category" className="field" defaultValue={categories[0]}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">Monthly amount</span>
        <input name="amount" required inputMode="decimal" className="field" placeholder="0.00" />
      </label>
      <label className="block">
        <span className="field-label">Currency</span>
        <select name="currency" className="field" defaultValue="EUR">
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">Day of the month</span>
        <input name="day" type="number" min={1} max={28} defaultValue={1} className="field" />
      </label>
      <label className="block">
        <span className="field-label">Starts</span>
        <input name="starts" type="month" defaultValue={thisMonth} className="field" />
      </label>
      <label className="block sm:col-span-2">
        <span className="field-label">Bill / receipt (optional)</span>
        <input name="bill" type="file" accept=".pdf,image/*,application/pdf" className="field py-2 text-[0.85rem]" />
      </label>
      <label className="flex items-center gap-2.5 text-[0.88rem] text-fg sm:col-span-2">
        <input name="autoPaid" type="checkbox" className="h-4 w-4 accent-[var(--accent)]" />
        Mark paid automatically on its day (e.g. a direct debit)
      </label>
      <label className="flex items-start gap-2.5 text-[0.88rem] text-fg sm:col-span-2">
        <input name="partnerCost" type="checkbox" defaultChecked={true} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span>
          The partners share this cost
          <span className="block text-[0.76rem] text-faint">
            Untick for costs SnZ Ventures carries alone, like office rent, internet or phone: they then do not lower the partners&apos; profit.
          </span>
        </span>
      </label>
      <div className="flex items-end sm:col-span-2">
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Saving…" : "Add fixed cost"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[0.85rem] text-danger sm:col-span-2">
          {error}
        </p>
      )}
    </form>
  );
}

export function RecurringRowActions({
  id,
  name,
  active,
  autoPaid,
  amount,
}: {
  id: string;
  name: string;
  active: boolean;
  autoPaid: boolean;
  amount: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(fields: Record<string, string>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const r = await post({ id, ...fields });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => act({ action: "update_recurring", autoPaid: autoPaid ? "0" : "1" })}
          data-tip={autoPaid ? "Stop auto-paying" : "Mark paid automatically"}
          aria-label="Toggle auto-paid"
          className={cn("tip icon-btn", autoPaid && "!border-moss-400/60 !text-ok")}
        >
          <Icon d="M3 8.5l3 3 7-7" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act({ action: "update_recurring", active: active ? "0" : "1" }, active ? `Stop ${name}? It is not added to future months.` : undefined)}
          data-tip={active ? "Stop" : "Start again (from this month)"}
          aria-label={active ? "Stop" : "Start again"}
          className="tip icon-btn"
        >
          <Icon d={active ? "M5.5 4v8M10.5 4v8" : "M5 3.5l7 4.5-7 4.5z"} />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act({ action: "delete_recurring" }, `Delete ${name}? Months already added stay in the books.`)}
          data-tip="Delete"
          aria-label="Delete"
          className="tip tip-end icon-btn hover:!border-red-400/60 hover:!text-danger"
        >
          <Icon d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
        </button>
      </span>
      {error && <span className="text-[0.72rem] text-danger">{error}</span>}
    </span>
  );
}

/* ------------------------------------------------------------ rates */

export function RateForm({
  month,
  currency,
  current,
  manual = false,
}: {
  month: string;
  currency: string;
  current: number | null;
  /** Typed in by the super admin: offer to go back to the automatic rate. */
  manual?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(current ? String(current) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await post({ action: "set_rate", month, currency, perEur: v });
    setBusy(false);
    setMsg(r.ok ? "Saved." : r.error ?? "That didn't save.");
    if (r.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <span className="text-[0.9rem] text-fg">1 EUR =</span>
      <input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" className="h-10 w-32 rounded-[10px] border border-line bg-[var(--panel-solid)] px-3 text-[0.9rem] text-fg" placeholder="e.g. 300" aria-label={`${currency} per euro`} />
      <span className="text-[0.9rem] text-fg">{currency}</span>
      <button type="submit" disabled={busy || !v} className={PRIMARY}>
        {busy ? "Saving…" : "Fix this rate"}
      </button>
      {manual && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await post({ action: "rate_auto", month, currency });
            setBusy(false);
            setMsg(r.ok ? "Back to automatic." : r.error ?? "That didn't work.");
            if (r.ok) router.refresh();
          }}
          className="text-[0.82rem] text-muted underline underline-offset-4 hover:text-fg"
        >
          Use automatic
        </button>
      )}
      {msg && <span className="text-[0.8rem] text-muted">{msg}</span>}
    </form>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-4 text-[0.85rem] font-medium text-fg hover:border-[var(--accent)] hover:text-accent print:hidden">
      Print / PDF
    </button>
  );
}

/* ------------------------------------------------- consultant shares */

/**
 * ADD A REFERRAL. First who referred the student: a consultant on the portal
 * (their students are listed by themselves) or anyone else (their name and
 * the student's name typed in). Then the date, what it is for, and the share
 * rule: a percentage of an amount, or a fixed amount. What is owed is worked
 * out as you type.
 */
export function ReferralForm({
  consultants,
  studentsOf,
}: {
  consultants: { id: string; name: string; terms: { kind: "percent" | "fixed"; value: number; currency: string } | null }[];
  studentsOf: Record<string, { id: string; name: string; feeCents: number | null; feeCurrency: string | null }[]>;
}) {
  const router = useRouter();
  const close = useCloseModal();
  const [who, setWho] = useState<"consultant" | "referral">("consultant");
  const [consultantId, setConsultantId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [ruleKind, setRuleKind] = useState<"percent" | "fixed">("percent");
  const [ruleValue, setRuleValue] = useState("");
  const [base, setBase] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [keepRule, setKeepRule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const students = consultantId ? studentsOf[consultantId] ?? [] : [];

  const num = (v: string) => parseFloat(v.replace(/,/g, ""));
  const owed =
    ruleKind === "percent"
      ? Number.isFinite(num(ruleValue)) && Number.isFinite(num(base))
        ? (num(base) * num(ruleValue)) / 100
        : null
      : Number.isFinite(num(ruleValue))
        ? num(ruleValue)
        : null;

  function chooseConsultant(id: string) {
    setConsultantId(id);
    setStudentId("");
    // Their standing rule, if they have one, fills the rule in.
    const t = consultants.find((c) => c.id === id)?.terms;
    if (t) {
      setRuleKind(t.kind);
      setRuleValue(String(t.value));
      if (t.kind === "fixed") setCurrency(t.currency);
    }
  }

  function chooseStudent(id: string) {
    setStudentId(id);
    // A percentage is usually of the student's fee: fill in their latest verified one.
    const s = students.find((x) => x.id === id);
    if (s?.feeCents) {
      setBase((s.feeCents / 100).toFixed(2));
      if (s.feeCurrency) setCurrency(s.feeCurrency);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await post({
      action: "add_payout",
      referrerKind: who,
      consultantId: who === "consultant" ? consultantId : "",
      referrerName: who === "referral" ? String(f.get("referrerName") ?? "") : "",
      studentId: who === "consultant" && studentId !== "other" ? studentId : "",
      studentName: String(f.get("studentName") ?? ""),
      date: String(f.get("date") ?? today),
      description: String(f.get("description") ?? ""),
      ruleKind,
      ruleValue,
      base: ruleKind === "percent" ? base : "",
      currency,
      keepRule: who === "consultant" && keepRule ? "1" : "0",
    });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't save.");
    router.refresh();
    close();
  }

  const seg = (on: boolean) =>
    cn(
      "rounded-[12px] border p-3 text-left transition-colors",
      on ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-line hover:border-[var(--line-strong)]"
    );

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid grid-cols-2 gap-2 sm:col-span-2" role="radiogroup" aria-label="Who referred the student">
        {(
          [
            ["consultant", "Consultant", "One of your consultants on the portal"],
            ["referral", "Referral", "Anyone else who sent a student"],
          ] as const
        ).map(([k, label, hint]) => (
          <button key={k} type="button" role="radio" aria-checked={who === k} onClick={() => setWho(k)} className={seg(who === k)}>
            <span className="block text-[0.95rem] font-semibold text-fg">{label}</span>
            <span className="block text-[0.78rem] text-faint">{hint}</span>
          </button>
        ))}
      </div>

      {who === "consultant" ? (
        <>
          <label className="block sm:col-span-2">
            <span className="field-label">Consultant</span>
            <select required value={consultantId} onChange={(e) => chooseConsultant(e.target.value)} className="field">
              <option value="" disabled>
                Choose the consultant…
              </option>
              {consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Their student</span>
            <select required value={studentId} onChange={(e) => chooseStudent(e.target.value)} disabled={!consultantId} className="field">
              <option value="" disabled>
                {!consultantId ? "Choose the consultant first" : students.length ? "Choose the student…" : "No students linked to this consultant yet"}
              </option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {consultantId && <option value="other">Someone not on the list (type the name)</option>}
            </select>
          </label>
          {studentId === "other" && (
            <label className="block sm:col-span-2">
              <span className="field-label">Student&apos;s name</span>
              <input name="studentName" required maxLength={160} className="field" placeholder="e.g. Ali Khan" />
            </label>
          )}
        </>
      ) : (
        <>
          <label className="block">
            <span className="field-label">Referrer&apos;s name</span>
            <input name="referrerName" required maxLength={160} className="field" placeholder="Enter the referrer's name" />
          </label>
          <label className="block">
            <span className="field-label">Student they referred</span>
            <input name="studentName" required maxLength={160} className="field" placeholder="Enter the student's name" />
          </label>
        </>
      )}

      <label className="block">
        <span className="field-label">Date</span>
        <input name="date" type="date" required defaultValue={today} className="field" />
      </label>
      <label className="block">
        <span className="field-label">What for</span>
        <input name="description" required maxLength={300} className="field" placeholder="e.g. Referral for the application fee" />
      </label>

      <fieldset className="rounded-[14px] border border-line p-4 sm:col-span-2">
        <legend className="px-1.5 text-[0.82rem] font-semibold text-fg">Share rule</legend>
        <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind of share">
          {(
            [
              ["percent", "Percentage", "A % of an amount, e.g. the fee"],
              ["fixed", "Fixed amount", "The same amount each time"],
            ] as const
          ).map(([k, label, hint]) => (
            <button key={k} type="button" role="radio" aria-checked={ruleKind === k} onClick={() => setRuleKind(k)} className={seg(ruleKind === k)}>
              <span className="block text-[0.9rem] font-semibold text-fg">{label}</span>
              <span className="block text-[0.76rem] text-faint">{hint}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {ruleKind === "percent" ? (
            <>
              <label className="block">
                <span className="field-label">Percentage (%)</span>
                <input value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} required inputMode="decimal" className="field" placeholder="e.g. 20" />
              </label>
              <label className="block">
                <span className="field-label">Of amount</span>
                <input value={base} onChange={(e) => setBase(e.target.value)} required inputMode="decimal" className="field" placeholder="e.g. 2500" />
              </label>
            </>
          ) : (
            <label className="block sm:col-span-2">
              <span className="field-label">Amount</span>
              <input value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} required inputMode="decimal" className="field" placeholder="e.g. 200" />
            </label>
          )}
          <label className="block">
            <span className="field-label">Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="field">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-[0.9rem] text-muted">
          To pay:{" "}
          <span className="font-semibold tabular-nums text-fg">
            {owed != null && owed > 0 ? `${owed.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : "—"}
          </span>
        </p>
        {who === "consultant" && (
          <label className="mt-3 flex items-start gap-2.5 text-[0.85rem] text-fg">
            <input type="checkbox" checked={keepRule} onChange={(e) => setKeepRule(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            <span>
              Use this rule for this consultant&apos;s next students too
              <span className="block text-[0.76rem] text-faint">A referral is then added by itself whenever their student&apos;s fee is verified.</span>
            </span>
          </label>
        )}
      </fieldset>

      <div className="flex items-end sm:col-span-2">
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Saving…" : "Add referral"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[0.85rem] text-danger sm:col-span-2">
          {error}
        </p>
      )}
    </form>
  );
}

/** Stop a consultant's standing share rule. Referrals already added stay. */
export function RemoveRule({ consultantId, name }: { consultantId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={async () => {
          if (!window.confirm(`Stop ${name}'s automatic share? Referrals already added stay.`)) return;
          const r = await post({ action: "set_terms", consultantId, remove: "1" });
          if (!r.ok) setError(r.error ?? "That didn't work.");
          else router.refresh();
        }}
        className="text-[0.78rem] text-muted underline underline-offset-4 hover:text-danger"
      >
        Stop automatic
      </button>
      {error && <span className="text-[0.72rem] text-danger">{error}</span>}
    </span>
  );
}

export function PayoutActions({ id, status }: { id: string; status: "owed" | "paid" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(action: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const r = await post({ action, id, date: new Date().toISOString().slice(0, 10) });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        {status === "owed" ? (
          <button type="button" disabled={busy} onClick={() => act("payout_paid", "Mark this as paid today? It is added to Expenses as a commission.")} className="inline-flex min-h-9 items-center rounded-full bg-moss-400 px-3.5 text-[0.8rem] font-semibold text-[#070B1A] disabled:opacity-50">
            Mark paid
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => act("payout_unpaid", "Mark as not paid? The expense is taken back out.")} className="text-[0.78rem] text-muted underline underline-offset-4 hover:text-fg">
            Undo
          </button>
        )}
        {status === "owed" && (
          <button type="button" disabled={busy} onClick={() => act("delete_payout", "Delete this amount owed?")} data-tip="Delete" aria-label="Delete" className="tip tip-end icon-btn hover:!border-red-400/60 hover:!text-danger">
            <Icon d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
          </button>
        )}
      </span>
      {error && <span className="text-[0.72rem] text-danger">{error}</span>}
    </span>
  );
}

/* --------------------------------------------- university commissions */

/**
 * ADD A STUDENT SENT TO A UNIVERSITY. The university is chosen from those
 * already used, or typed in (it is added by itself); a fixed commission it
 * had before fills the amount in.
 */
export function CommissionForm({
  universities,
  students,
}: {
  universities: { id: string; name: string; kind: "percent" | "fixed"; value: number | null; currency: string }[];
  students: { id: string; name: string }[];
}) {
  const router = useRouter();
  const close = useCloseModal();
  const [uniName, setUniName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const known = universities.find((u) => u.name.toLowerCase() === uniName.trim().toLowerCase()) ?? null;

  function typeUniversity(v: string) {
    setUniName(v);
    const u = universities.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
    if (u?.kind === "fixed" && u.value && !amount) {
      setAmount(String(u.value));
      setCurrency(u.currency);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const sid = String(f.get("studentId") ?? "");
    setBusy(true);
    setError(null);
    const r = await post({
      action: "add_commission",
      universityId: known?.id ?? "",
      universityName: uniName.trim(),
      studentId: sid,
      studentName: String(f.get("studentName") ?? "") || students.find((s) => s.id === sid)?.name || "",
      intake: String(f.get("intake") ?? ""),
      amount,
      currency,
      expectedOn: String(f.get("expectedOn") ?? ""),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't save.");
    router.refresh();
    close();
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="field-label">University</span>
        <input
          value={uniName}
          onChange={(e) => typeUniversity(e.target.value)}
          list="finance-universities"
          required
          maxLength={160}
          autoComplete="off"
          className="field"
          placeholder="Choose one, or type a new university"
        />
        <datalist id="finance-universities">
          {universities.map((u) => (
            <option key={u.id} value={u.name} />
          ))}
        </datalist>
        {uniName.trim().length > 1 && (
          <span className="mt-1 block text-[0.76rem] text-faint">{known ? "Already in your list." : "New: it is added to your list."}</span>
        )}
      </label>
      <label className="block sm:col-span-2">
        <span className="field-label">Student</span>
        <select name="studentId" className="field" defaultValue="">
          <option value="">— Type the name below instead —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="field-label">or name (not on the portal)</span>
        <input name="studentName" maxLength={160} className="field" />
      </label>
      <label className="block">
        <span className="field-label">Commission</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} required inputMode="decimal" className="field" placeholder="500" />
      </label>
      <label className="block">
        <span className="field-label">Currency</span>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="field">
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">Intake</span>
        <input name="intake" maxLength={80} className="field" placeholder="Sep 2026" />
      </label>
      <label className="block">
        <span className="field-label">Expected by</span>
        <input name="expectedOn" type="date" className="field" />
      </label>
      <div className="flex items-end sm:col-span-2">
        <button type="submit" disabled={busy || uniName.trim().length < 2} className={PRIMARY}>
          {busy ? "Saving…" : "Add expected commission"}
        </button>
      </div>
      {error && <p role="alert" className="text-[0.85rem] text-danger sm:col-span-2">{error}</p>}
    </form>
  );
}

export function CommissionActions({ id, status }: { id: string; status: "expected" | "received" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(action: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const r = await post({ action, id, date: new Date().toISOString().slice(0, 10) });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        {status === "expected" ? (
          <button type="button" disabled={busy} onClick={() => act("commission_received", "Mark as received today? It is added to Income.")} className="inline-flex min-h-9 items-center rounded-full bg-moss-400 px-3.5 text-[0.8rem] font-semibold text-[#070B1A] disabled:opacity-50">
            Received
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => act("commission_unreceived", "Mark as not received? The income is taken back out.")} className="text-[0.78rem] text-muted underline underline-offset-4 hover:text-fg">
            Undo
          </button>
        )}
        {status === "expected" && (
          <button type="button" disabled={busy} onClick={() => act("delete_commission", "Delete this expected commission?")} data-tip="Delete" aria-label="Delete" className="tip tip-end icon-btn hover:!border-red-400/60 hover:!text-danger">
            <Icon d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
          </button>
        )}
      </span>
      {error && <span className="text-[0.72rem] text-danger">{error}</span>}
    </span>
  );
}

export function DeleteUniversity({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={async () => {
          if (!window.confirm(`Delete ${name}?`)) return;
          const r = await post({ action: "delete_university", id });
          if (!r.ok) setError(r.error ?? "That didn't delete.");
          else router.refresh();
        }}
        data-tip="Delete"
        aria-label={`Delete ${name}`}
        className="tip tip-end icon-btn hover:!border-red-400/60 hover:!text-danger"
      >
        <Icon d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
      </button>
      {error && <span className="max-w-[14rem] text-right text-[0.72rem] text-danger">{error}</span>}
    </span>
  );
}

/* ------------------------------------------------- a small dialog */

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[rgb(4_8_20/0.72)] backdrop-blur-[3px]" />
      <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-[18px] border border-line bg-[var(--panel-solid,#1B2645)] p-6 text-left shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-[1.15rem] font-semibold text-fg-strong">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="icon-btn">
            <Icon d="M4 4l8 8M12 4l-8 8" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.querySelector(".portal-shell") ?? document.body
  );
}

/* ------------------------------------------- fixed cost: full edit */

export function RecurringEdit({
  r,
  categories,
}: {
  r: { id: string; name: string; category: string; amount: string; currency: string; dayOfMonth: number; autoPaid: boolean; partnerCost: boolean };
  categories: readonly string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await post({
      action: "update_recurring",
      id: r.id,
      name: String(f.get("name") ?? ""),
      category: String(f.get("category") ?? ""),
      amount: String(f.get("amount") ?? ""),
      currency: String(f.get("currency") ?? "EUR"),
      day: String(f.get("day") ?? "1"),
      autoPaid: f.get("autoPaid") ? "1" : "0",
      partnerCost: f.get("partnerCost") ? "1" : "0",
      bill: (f.get("bill") as File | null) ?? null,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "That didn't save.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-tip="Edit" aria-label={`Edit ${r.name}`} className="tip icon-btn">
        <Icon d="M10.5 2.5l3 3L6 13H3v-3z" />
      </button>
      {open && (
        <Dialog title={`Edit ${r.name}`} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="field-label">Name</span>
              <input name="name" defaultValue={r.name} required maxLength={160} className="field" />
            </label>
            <label className="block">
              <span className="field-label">Category</span>
              <select name="category" defaultValue={r.category} className="field">
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Day of the month</span>
              <input name="day" type="number" min={1} max={28} defaultValue={r.dayOfMonth} className="field" />
            </label>
            <label className="block">
              <span className="field-label">Monthly amount</span>
              <input name="amount" defaultValue={r.amount} required inputMode="decimal" className="field" />
            </label>
            <label className="block">
              <span className="field-label">Currency</span>
              <select name="currency" defaultValue={r.currency} className="field">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">Bill / receipt (replace, optional)</span>
              <input name="bill" type="file" accept=".pdf,image/*,application/pdf" className="field py-2 text-[0.85rem]" />
            </label>
            <label className="flex items-center gap-2.5 text-[0.88rem] text-fg sm:col-span-2">
              <input name="autoPaid" type="checkbox" defaultChecked={r.autoPaid} className="h-4 w-4 accent-[var(--accent)]" />
              Mark paid automatically on its day
            </label>
            <label className="flex items-start gap-2.5 text-[0.88rem] text-fg sm:col-span-2">
              <input name="partnerCost" type="checkbox" defaultChecked={r.partnerCost} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <span>
                The partners share this cost
                <span className="block text-[0.76rem] text-faint">
                  Untick for costs SnZ Ventures carries alone, like office rent, internet or phone: they then do not lower the partners&apos; profit.
                </span>
              </span>
            </label>
            <p className="text-[0.78rem] text-faint sm:col-span-2">Changes apply from the next month written; months already in the books keep what they said.</p>
            {error && <p role="alert" className="text-[0.85rem] text-danger sm:col-span-2">{error}</p>}
            <div className="flex justify-end gap-3 sm:col-span-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.88rem] text-muted hover:text-fg">
                Cancel
              </button>
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

/* ------------------------------------------ an entry added by hand */

const INCOME_CATS = INCOME_CATEGORIES;
const EXPENSE_CATS = EXPENSE_CATEGORIES;

export function EntryEdit({
  e,
}: {
  e: {
    id: string;
    kind: "income" | "expense";
    category: string;
    description: string;
    party: string | null;
    amount: string;
    currency: string;
    date: string;
    status: "paid" | "due";
    partnerCost: boolean;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setBusy(true);
    setError(null);
    const res = await post({
      action: "update_entry",
      id: e.id,
      kind: e.kind,
      category: String(f.get("category") ?? ""),
      description: String(f.get("description") ?? ""),
      party: String(f.get("party") ?? ""),
      amount: String(f.get("amount") ?? ""),
      currency: String(f.get("currency") ?? "EUR"),
      date: String(f.get("date") ?? ""),
      status: String(f.get("status") ?? "paid"),
      partnerCost: f.get("partnerCost") ? "1" : "0",
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "That didn't save.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-tip="Edit" aria-label="Edit" className="tip icon-btn">
        <Icon d="M10.5 2.5l3 3L6 13H3v-3z" />
      </button>
      {open && (
        <Dialog title={e.kind === "income" ? "Edit income" : "Edit expense"} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Amount</span>
              <input name="amount" defaultValue={e.amount} required inputMode="decimal" className="field" />
            </label>
            <label className="block">
              <span className="field-label">Currency</span>
              <select name="currency" defaultValue={e.currency} className="field">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Date</span>
              <input name="date" type="date" defaultValue={e.date} required className="field" />
            </label>
            <label className="block">
              <span className="field-label">Category</span>
              <select name="category" defaultValue={e.category} className="field">
                {(e.kind === "income" ? INCOME_CATS : EXPENSE_CATS).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">{e.kind === "income" ? "Received from" : "Paid to"}</span>
              <input name="party" defaultValue={e.party ?? ""} maxLength={160} className="field" />
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">What for</span>
              <input name="description" defaultValue={e.description} required maxLength={300} className="field" />
            </label>
            {e.kind === "expense" && (
              <label className="block">
                <span className="field-label">Status</span>
                <select name="status" defaultValue={e.status} className="field">
                  <option value="paid">Paid</option>
                  <option value="due">Due</option>
                </select>
              </label>
            )}
            {e.kind === "expense" &&
            (<label className="flex items-start gap-2.5 text-[0.88rem] text-fg sm:col-span-2">
              <input name="partnerCost" type="checkbox" defaultChecked={e.partnerCost} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <span>
                The partners share this cost
                <span className="block text-[0.76rem] text-faint">
                  Untick for costs SnZ Ventures carries alone, like office rent, internet or phone: they then do not lower the partners&apos; profit.
                </span>
              </span>
            </label>)}
            {error && <p role="alert" className="text-[0.85rem] text-danger sm:col-span-2">{error}</p>}
            <div className="flex justify-end gap-3 sm:col-span-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.88rem] text-muted hover:text-fg">
                Cancel
              </button>
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

/* ------------------------------------------------------ stakeholders */

export function StakeholderForm({
  initial,
  label,
}: {
  initial?: { id: string; name: string; sharePct: number; isCompany: boolean; notes: string | null };
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await post({
      action: "save_stakeholder",
      id: initial?.id ?? "",
      name: String(f.get("name") ?? ""),
      sharePct: String(f.get("sharePct") ?? ""),
      isCompany: f.get("isCompany") ? "1" : "0",
      notes: String(f.get("notes") ?? ""),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "That didn't save.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {initial ? (
        <button type="button" onClick={() => setOpen(true)} data-tip="Edit" aria-label={`Edit ${initial.name}`} className="tip icon-btn">
          <Icon d="M10.5 2.5l3 3L6 13H3v-3z" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-moss-400 px-4 text-[0.84rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300"
        >
          {label}
        </button>
      )}
      {open && (
        <Dialog title={initial ? `Edit ${initial.name}` : "Add a stakeholder"} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="field-label">Name</span>
              <input name="name" defaultValue={initial?.name ?? ""} required maxLength={120} className="field" placeholder="e.g. Ahmed Raza" />
            </label>
            <label className="block">
              <span className="field-label">Share of the profit (%)</span>
              <input name="sharePct" defaultValue={initial ? String(initial.sharePct) : ""} required inputMode="decimal" className="field" placeholder="25" />
            </label>
            <label className="flex items-center gap-2.5 self-end pb-2.5 text-[0.88rem] text-fg">
              <input name="isCompany" type="checkbox" defaultChecked={initial?.isCompany ?? false} className="h-4 w-4 accent-[var(--accent)]" />
              This is SnZ Ventures itself
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">Notes (optional)</span>
              <input name="notes" defaultValue={initial?.notes ?? ""} maxLength={300} className="field" placeholder="e.g. Bank account, how they are paid" />
            </label>
            {error && <p role="alert" className="text-[0.85rem] text-danger sm:col-span-2">{error}</p>}
            <div className="flex justify-end gap-3 sm:col-span-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.88rem] text-muted hover:text-fg">
                Cancel
              </button>
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function StakeholderRowActions({ id, name, active }: { id: string; name: string; active: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function act(fields: Record<string, string>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    const r = await post({ id, ...fields });
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => act({ action: "stakeholder_active", active: active ? "0" : "1" }, active ? `Switch ${name} off? Their past payments stay.` : undefined)}
          data-tip={active ? "Switch off" : "Switch on"}
          aria-label={active ? "Switch off" : "Switch on"}
          className="tip icon-btn"
        >
          <Icon d={active ? "M5.5 4v8M10.5 4v8" : "M5 3.5l7 4.5-7 4.5z"} />
        </button>
        <button type="button" onClick={() => act({ action: "delete_stakeholder" }, `Delete ${name}?`)} data-tip="Delete" aria-label="Delete" className="tip tip-end icon-btn hover:!border-red-400/60 hover:!text-danger">
          <Icon d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
        </button>
      </span>
      {error && <span className="max-w-[14rem] text-right text-[0.72rem] text-danger">{error}</span>}
    </span>
  );
}

/** Pay a stakeholder their share of a month, or undo it. */
export function DistributeButton({ stakeholderId, month, paid, label }: { stakeholderId: string; month: string; paid: boolean; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act() {
    if (!window.confirm(paid ? "Mark as not paid?" : `Mark ${label} as paid today? The amount is fixed from now on.`)) return;
    setBusy(true);
    setError(null);
    const r = await post({ action: paid ? "undistribute" : "distribute", stakeholderId, month, date: new Date().toISOString().slice(0, 10) });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-end">
      {paid ? (
        <button type="button" onClick={act} disabled={busy} className="text-[0.78rem] text-muted underline underline-offset-4 hover:text-fg">
          Undo
        </button>
      ) : (
        <button type="button" onClick={act} disabled={busy} className="inline-flex min-h-9 items-center rounded-full bg-moss-400 px-3.5 text-[0.8rem] font-semibold text-[#070B1A] disabled:opacity-50">
          {busy ? "…" : "Mark paid"}
        </button>
      )}
      {error && <span className="text-[0.72rem] text-danger">{error}</span>}
    </span>
  );
}
