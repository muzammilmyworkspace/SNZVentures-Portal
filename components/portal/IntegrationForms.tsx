"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ModalButton, useCloseModal } from "@/components/portal/FinanceForms";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, FINANCE_CURRENCIES } from "@/lib/portal/finance-categories";

/**
 * The forms and buttons of Finance → Integrations: connect Wise, Stripe or a
 * bank (CSV), sync, upload a statement, and review each statement line.
 * All post to /api/admin/finance/integrations as multipart with an `action`.
 */

type AccountOpt = { id: string; name: string; currency: string };

const PRIMARY =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-moss-400 px-5 text-[0.9rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50";
const GHOST =
  "inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] font-medium text-fg transition-colors hover:border-[var(--accent)] hover:text-accent disabled:opacity-50";

async function post(fields: Record<string, string | File | null | undefined>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) form.set(k, v);
  const res = await fetch("/api/admin/finance/integrations", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
  return { ok: Boolean(res.ok && data.ok), error: data.error ?? (res.ok ? undefined : "That didn't work."), message: data.message };
}

const HOW: Record<string, { token: string; steps: string[] }> = {
  wise: {
    token: "Wise API token",
    steps: [
      "Sign in to Wise Business on the web.",
      "Settings → Developer tools → API tokens → Add new token.",
      "Choose Read only, give it a name (e.g. AdmitsFair portal), create it and copy it here.",
    ],
  },
  stripe: {
    token: "Stripe restricted key",
    steps: [
      "Stripe Dashboard → Developers → API keys → Create restricted key.",
      "Give Read access to Balance and Balance transactions; leave everything else at None.",
      "Create it and copy the key (rk_live_…) here. A full secret key (sk_…) is refused.",
    ],
  },
  revolut: {
    token: "",
    steps: [
      "Revolut Business → Accounts → choose the account → Statement → Excel/CSV.",
      "Upload the file here after connecting; each upload adds only lines not seen before.",
    ],
  },
  csv: { token: "", steps: ["Download the statement as CSV from the bank, then upload it here after connecting."] },
};

/** Connect a provider to one of the money accounts (or a new one). */
export function ConnectForm({ provider, accounts }: { provider: "wise" | "stripe" | "revolut" | "csv"; accounts: AccountOpt[] }) {
  const router = useRouter();
  const close = useCloseModal();
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.name.toLowerCase().includes(provider === "csv" ? "bank" : provider))?.id ?? accounts[0]?.id ?? "new"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const how = HOW[provider];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await post({
      action: "connect",
      provider,
      accountId: accountId === "new" ? "" : accountId,
      newAccount: String(f.get("newAccount") ?? ""),
      currency: String(f.get("currency") ?? "EUR"),
      label: String(f.get("label") ?? ""),
      token: String(f.get("token") ?? ""),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    router.refresh();
    close();
    if (r.message) window.alert(r.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <ol className="list-decimal space-y-1 rounded-[12px] border border-line p-4 pl-8 text-[0.84rem] text-muted">
        {how.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <label className="block">
        <span className="field-label">Belongs to the account</span>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="field">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
          <option value="new">+ A new account…</option>
        </select>
      </label>
      {accountId === "new" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">New account name</span>
            <input name="newAccount" required maxLength={80} className="field" placeholder={provider === "stripe" ? "Stripe balance" : "e.g. Wise Business USD"} />
          </label>
          <label className="block">
            <span className="field-label">Currency</span>
            <select name="currency" defaultValue="EUR" className="field">
              {FINANCE_CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {how.token && (
        <label className="block">
          <span className="field-label">{how.token}</span>
          <input name="token" required type="password" autoComplete="off" className="field font-mono text-[0.85rem]" placeholder="Paste it here" />
          <span className="mt-1 block text-[0.76rem] text-faint">Tested before it is saved, then stored encrypted. It is never shown again.</span>
        </label>
      )}
      <label className="block">
        <span className="field-label">Name (optional)</span>
        <input name="label" maxLength={80} className="field" placeholder="e.g. Wise Business EUR" />
      </label>
      {error && (
        <p role="alert" className="text-[0.85rem] text-danger">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Connecting…" : how.token ? "Test and connect" : "Add"}
        </button>
      </div>
    </form>
  );
}

/** Sync, upload a statement, change the account, disconnect. */
export function IntegrationActions({
  id,
  label,
  hasSecret,
  currency,
  accountId,
  accounts,
}: {
  id: string;
  label: string;
  hasSecret: boolean;
  currency: string;
  accountId: string | null;
  accounts: AccountOpt[];
}) {
  const router = useRouter();
  const file = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(fields: Record<string, string | File>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    const r = await post({ id, ...fields });
    setBusy(false);
    setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Done." : r.error ?? "That didn't work." });
    if (r.ok) router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <span className="inline-flex flex-wrap justify-end gap-1.5">
        {hasSecret && (
          <button type="button" disabled={busy} onClick={() => act({ action: "sync" })} className={GHOST}>
            {busy ? "Working…" : "Sync now"}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => file.current?.click()} className={GHOST}>
          Upload statement CSV
        </button>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) act({ action: "upload_csv", file: f, currency });
            e.target.value = "";
          }}
        />
        <select
          aria-label="Account"
          value={accountId ?? ""}
          disabled={busy}
          onChange={(e) => act({ action: "link", accountId: e.target.value })}
          className="h-9 rounded-full border border-line bg-[var(--panel-solid)] px-3 text-[0.8rem] text-fg"
        >
          <option value="">No account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => act({ action: "disconnect" }, `Disconnect ${label}? Its token is deleted. Entries already added to the books stay.`)}
          className="inline-flex min-h-9 items-center rounded-full px-3 text-[0.8rem] text-muted underline underline-offset-4 hover:text-danger"
        >
          Disconnect
        </button>
      </span>
      {msg && <span className={`max-w-[26rem] text-right text-[0.76rem] ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
    </span>
  );
}

function AddToBooks({ id, amountCents }: { id: string; amountCents: number }) {
  const router = useRouter();
  const close = useCloseModal();
  const income = amountCents > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await post({
      action: "line_add",
      id,
      category: String(f.get("category") ?? ""),
      partnerCost: f.get("partnerCost") ? "1" : "0",
      vatMode: String(f.get("vatMode") ?? "none"),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    router.refresh();
    close();
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <p className="text-[0.86rem] text-muted">
        {income ? "Money in: Dr the bank account, Cr the revenue category below." : "Money out: Dr the expense category below, Cr the bank account."}
      </p>
      <label className="block">
        <span className="field-label">Category</span>
        <select name="category" className="field" defaultValue={income ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]}>
          {(income ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {!income && (
        <>
          <label className="block">
            <span className="field-label">VAT</span>
            <select name="vatMode" className="field" defaultValue="none">
              <option value="none">No VAT to declare</option>
              <option value="reverse_charge">Reverse charge 21% (supplier outside Lithuania)</option>
            </select>
          </label>
          <label className="flex items-start gap-2.5 text-[0.86rem] text-fg">
            <input name="partnerCost" type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            The partners share this cost
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-[0.85rem] text-danger">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Adding…" : "Add to the books"}
        </button>
      </div>
    </form>
  );
}

function AsTransfer({ id, amountCents, currency, accounts, ownAccountId }: { id: string; amountCents: number; currency: string; accounts: AccountOpt[]; ownAccountId: string | null }) {
  const router = useRouter();
  const close = useCloseModal();
  const others = accounts.filter((a) => a.id !== ownAccountId);
  const [other, setOther] = useState(others[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const o = others.find((a) => a.id === other);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await post({ action: "line_transfer", id, otherAccountId: other, otherAmount: String(f.get("otherAmount") ?? "") });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    router.refresh();
    close();
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <p className="text-[0.86rem] text-muted">A payout or a move between your own accounts: neither revenue nor expense.</p>
      <label className="block">
        <span className="field-label">{amountCents < 0 ? "Went to" : "Came from"}</span>
        <select value={other} onChange={(e) => setOther(e.target.value)} className="field">
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
      </label>
      {o && o.currency !== currency && (
        <label className="block">
          <span className="field-label">Amount in {o.name} ({o.currency})</span>
          <input name="otherAmount" required inputMode="decimal" className="field" placeholder="0.00" />
        </label>
      )}
      {error && (
        <p role="alert" className="text-[0.85rem] text-danger">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={busy || !other} className={PRIMARY}>
          {busy ? "Saving…" : "Record transfer"}
        </button>
      </div>
    </form>
  );
}

/** What to do with one statement line. */
export function BankLineActions({
  line,
  accounts,
}: {
  line: { id: string; status: string; amountCents: number; currency: string; accountId: string | null; lineType: string | null };
  accounts: AccountOpt[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(action: string) {
    setBusy(true);
    await post({ action, id: line.id });
    setBusy(false);
    router.refresh();
  }
  if (line.status !== "new") {
    return line.status === "added" ? null : (
      <button type="button" disabled={busy} onClick={() => act("line_reset")} className="text-[0.78rem] text-muted underline underline-offset-4 hover:text-fg">
        Undo
      </button>
    );
  }
  // A payout, top-up or currency exchange is money moving between own accounts: Transfer comes first.
  const transferLike = ["payout", "topup", "top_up", "exchange", "conversion"].some((w) => (line.lineType ?? "").includes(w));
  return (
    <span className="inline-flex flex-wrap justify-end gap-1.5">
      <ModalButton label="Add to books" title="Add this line to the books" variant={transferLike ? "ghost" : "primary"}>
        <AddToBooks id={line.id} amountCents={line.amountCents} />
      </ModalButton>
      <ModalButton label="Transfer" title="Record as a transfer" variant={transferLike ? "primary" : "ghost"}>
        <AsTransfer id={line.id} amountCents={line.amountCents} currency={line.currency} accounts={accounts} ownAccountId={line.accountId} />
      </ModalButton>
      <button type="button" disabled={busy} onClick={() => act("line_ignore")} className="inline-flex min-h-9 items-center rounded-full px-2.5 text-[0.8rem] text-muted underline underline-offset-4 hover:text-fg">
        Ignore
      </button>
    </span>
  );
}
