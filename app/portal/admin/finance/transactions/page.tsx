import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import {
  materializeRecurring,
  materializePayouts,
  linesBetween,
  allRates,
  studentsForPicker,
  accountBalances,
  listTransfers,
  inEur,
} from "@/lib/db/repos/finance";
import { Panel } from "@/components/portal/Pieces";
import { FinanceHeader, MissingRates, JournalTable, CashBook } from "@/components/portal/FinanceParts";
import { AddAmount } from "@/components/portal/AddAmount";
import { ModalButton, TransferForm } from "@/components/portal/FinanceForms";
import { journalOf } from "@/lib/portal/finance-journal";
import { eur, money, pickMonth, lastDay, monthName, totals, thisMonth } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Transactions", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * TRANSACTIONS, the way an accountant keeps them.
 *
 * At the top, every bank and cash account with its balance today and what
 * was debited (in) and credited (out) this month. Below, the JOURNAL: each
 * entry with the account debited and the account credited, debit and credit
 * totals that agree. Choose an account to see its CASH BOOK instead: balance
 * brought forward, every movement, running balance, balance carried forward.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; show?: string; q?: string; acc?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const ym = pickMonth(sp.m);
  const from = `${ym}-01`;
  const to = lastDay(ym);
  const show = ["in", "out", "process", "transfers"].includes(sp.show ?? "") ? (sp.show as string) : "all";
  await materializeRecurring();
  await materializePayouts();
  const today = new Date().toISOString().slice(0, 10);
  const [lines, rates, students, balances, transfers] = await Promise.all([
    linesBetween(from, to),
    allRates(),
    studentsForPicker(),
    accountBalances(today),
    listTransfers(from, to),
  ]);
  const accounts = balances
    .filter((b) => b.account.active)
    .map((b) => ({ id: b.account.id, name: b.account.name, currency: b.account.currency, defaultIn: b.account.defaultIn }));
  const t = totals(lines, rates);
  const q = (sp.q ?? "").trim().toLowerCase();

  // What each account took in (Dr) and paid out (Cr) this month, in its own currency.
  const moved = (id: string) => {
    let dr = 0;
    let cr = 0;
    for (const l of lines) {
      if (l.accountId !== id || l.status !== "paid") continue;
      if (l.kind === "income") dr += l.amountCents;
      else cr += l.amountCents;
    }
    for (const tr of transfers) {
      if (tr.toId === id) dr += tr.toCents;
      if (tr.fromId === id) cr += tr.fromCents;
    }
    return { dr, cr };
  };
  const totalCash = balances
    .filter((b) => b.account.active)
    .reduce((n, b) => n + (inEur({ amountCents: b.cents, currency: b.account.currency, date: today }, rates) ?? 0), 0);

  const link = (o: { show?: string; acc?: string | null }) => {
    const p = new URLSearchParams();
    if (ym !== thisMonth()) p.set("m", ym);
    const s2 = o.show ?? show;
    if (s2 !== "all") p.set("show", s2);
    const a = o.acc === null ? null : o.acc ?? sp.acc;
    if (a) p.set("acc", a);
    const s = p.toString();
    return s ? `/portal/admin/finance/transactions?${s}` : "/portal/admin/finance/transactions";
  };

  const chosen = sp.acc ? balances.find((b) => b.account.id === sp.acc) ?? null : null;

  // THE JOURNAL, filtered
  const journal = journalOf(lines, transfers).filter((e) => {
    if (show === "in" && e.line?.kind !== "income") return false;
    if (show === "out" && e.line?.kind !== "expense") return false;
    if (show === "process" && e.line?.status !== "due") return false;
    if (show === "transfers" && !e.transfer) return false;
    if (q && ![e.particulars, e.party, e.ref, ...e.legs.map((g) => g.account)].some((v) => v?.toLowerCase().includes(q))) return false;
    return true;
  });

  // THE CASH BOOK of one account: brought forward = the balance at the end of the day before.
  let cashBook: { opening: number; rows: { key: string; date: string; ref: string; particulars: string; contra: string; dr: number; cr: number }[] } | null = null;
  if (chosen) {
    const before = new Date(Date.parse(`${from}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
    const bf = (await accountBalances(before)).find((b) => b.account.id === chosen.account.id)?.cents ?? chosen.account.openingCents;
    const rows = journalOf(lines, transfers).flatMap((e) =>
      e.legs
        .filter((g) => g.money === chosen.account.id && (!e.line || e.line.status === "paid") && e.date >= chosen.account.openingOn)
        .map((g) => ({
          key: `${e.key}-${g.side}`,
          date: e.date,
          ref: e.ref,
          particulars: e.party ? `${e.particulars} · ${e.party}` : e.particulars,
          contra: e.legs.find((x) => x.side !== g.side)?.account ?? "",
          dr: g.side === "Dr" ? g.cents : 0,
          cr: g.side === "Cr" ? g.cents : 0,
        }))
    );
    cashBook = { opening: from <= chosen.account.openingOn ? chosen.account.openingCents : bf, rows };
  }

  const chip = (on: boolean) =>
    on
      ? "inline-flex min-h-9 items-center rounded-full border border-moss-400/60 px-3.5 text-[0.82rem] font-medium text-accent"
      : "inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] text-muted hover:text-fg";
  const card = (on: boolean) =>
    `block rounded-[14px] border px-4 py-3 shadow-[var(--panel-shadow)] transition-colors ${
      on ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-line bg-[image:var(--panel-bg)] hover:border-[var(--accent)]"
    }`;
  const actions = (
    <span className="flex flex-wrap gap-2">
      <ModalButton label="Transfer" title="Move money between accounts" variant="ghost">
        <TransferForm accounts={accounts} />
      </ModalButton>
      <AddAmount students={students} accounts={accounts} />
    </span>
  );

  return (
    <>
      <FinanceHeader
        title="Transactions"
        lead="Every entry as an accountant records it: the account debited and the account credited. Choose a bank or cash account to see its cash book with the running balance."
        path="/portal/admin/finance/transactions"
        ym={ym}
      />
      <MissingRates missing={t.missing} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Link href={link({ acc: null })} className={card(!chosen)}>
          <span className="label block text-[0.66rem] text-faint">All accounts · journal</span>
          <span className="mt-1 block text-[1.35rem] font-bold tabular-nums tracking-[-0.02em] text-fg-strong">{eur(totalCash)}</span>
          <span className="mt-0.5 block text-[0.74rem] text-muted">Cash and bank today, in EUR</span>
        </Link>
        {balances
          .filter((b) => b.account.active)
          .map((b) => {
            const m = moved(b.account.id);
            return (
              <Link key={b.account.id} href={link({ acc: b.account.id })} className={card(chosen?.account.id === b.account.id)}>
                <span className="label block text-[0.66rem] text-faint">{b.account.name}</span>
                <span className={`mt-1 block text-[1.35rem] font-bold tabular-nums tracking-[-0.02em] ${b.cents < 0 ? "text-danger" : "text-fg-strong"}`}>
                  {money(b.cents, b.account.currency)}
                </span>
                <span className="mt-0.5 block text-[0.74rem] text-muted">
                  {monthName(ym).split(" ")[0]}: Dr <span className="text-ok">{money(m.dr, b.account.currency)}</span> · Cr {money(m.cr, b.account.currency)}
                </span>
              </Link>
            );
          })}
      </div>

      {chosen && cashBook ? (
        <Panel title={`Cash book · ${chosen.account.name} · ${monthName(ym)}`} padded={false} action={actions}>
          <CashBook name={chosen.account.name} currency={chosen.account.currency} opening={cashBook.opening} rows={cashBook.rows} />
        </Panel>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Show" className="flex flex-wrap gap-2">
              {[
                ["all", "All entries"],
                ["in", "Money in"],
                ["out", "Money out"],
                ["process", "In process"],
                ["transfers", "Transfers"],
              ].map(([k, label]) => (
                <Link key={k} href={link({ show: k })} className={chip(show === k)}>
                  {label}
                </Link>
              ))}
            </nav>
            <form action="/portal/admin/finance/transactions" className="flex items-center gap-2 print:hidden">
              {ym !== thisMonth() && <input type="hidden" name="m" value={ym} />}
              {show !== "all" && <input type="hidden" name="show" value={show} />}
              <input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Search name, account or ref"
                aria-label="Search"
                className="h-9 w-64 rounded-full border border-line bg-[var(--panel-solid)] px-4 text-[0.85rem] text-fg"
              />
            </form>
          </div>
          <Panel title={`Journal · ${monthName(ym)} · ${journal.length} entries`} padded={false} action={actions}>
            <JournalTable entries={journal} rates={rates} accounts={accounts} />
          </Panel>
        </>
      )}
    </>
  );
}
