import Link from "next/link";
import type { ReactNode } from "react";
import { PortalHeading, EmptyState } from "@/components/portal/Pieces";
import { EntryRowActions, EntryEdit, DeleteTransfer } from "@/components/portal/FinanceForms";
import type { JournalEntry } from "@/lib/portal/finance-journal";
import { inEur, rateFor, type FinanceLine, type Rates } from "@/lib/db/repos/finance";
import { eur, money, monthName, shortMonth, shortDate, shiftMonth, thisMonth, SOURCE_LABEL } from "@/lib/portal/finance-view";

/**
 * The pieces every Finance page shares: the heading with the month and the
 * Finance sub-menu and the Add amount button, the twelve-month chart, the
 * breakdown bars, and the table of transactions.
 */

export const INCOME_COLOR = "#4C8DF6";
export const EXPENSE_COLOR = "#E8913A";


export function FinanceHeader({
  title,
  lead,
  path,
  ym,
  monthly = true,
  extra,
}: {
  title: string;
  lead: string;
  /** This page's path, for the month links. */
  path: string;
  ym: string;
  /** Whether this page is about one month (shows the month switcher). */
  monthly?: boolean;
  /** Kept for callers that pass it; the list itself carries its Add button now. */
  students?: { id: string; name: string }[];
  extra?: ReactNode;
}) {
  const at = (m: string) => (m === thisMonth() ? path : `${path}?m=${m}`);
  return (
    <>
      <PortalHeading
        eyebrow="Finance"
        title={title}
        lead={lead}
        action={extra ? <span className="flex flex-wrap items-center gap-2 print:hidden">{extra}</span> : undefined}
      />
      {monthly && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link href={at(shiftMonth(ym, -1))} aria-label="Previous month" className="icon-btn print:hidden">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M10 3.5L5.5 8l4.5 4.5" />
            </svg>
          </Link>
          <h2 className="min-w-[11rem] text-center text-[1.1rem] font-semibold text-fg-strong">{monthName(ym)}</h2>
          <Link href={at(shiftMonth(ym, 1))} aria-label="Next month" className="icon-btn print:hidden">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M6 3.5L10.5 8 6 12.5" />
            </svg>
          </Link>
          {ym !== thisMonth() && (
            <Link href={path} className="text-[0.85rem] text-muted underline underline-offset-4 hover:text-fg print:hidden">
              This month
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/** A small card for the top of a Finance page. */
export function MiniStat({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "in" | "out" | "warn";
  href?: string;
}) {
  const color = tone === "in" ? "text-ok" : tone === "out" ? "text-fg-strong" : tone === "warn" ? "text-warn" : "text-fg-strong";
  const body = (
    <>
      <span className="label block text-[0.66rem] text-faint">{label}</span>
      <span className={`mt-1 block text-[1.35rem] font-bold tabular-nums tracking-[-0.02em] ${color}`}>{value}</span>
      {hint && <span className="mt-0.5 block text-[0.74rem] leading-snug text-muted">{hint}</span>}
    </>
  );
  const cls = "block rounded-[14px] border border-line bg-[image:var(--panel-bg)] px-4 py-3 shadow-[var(--panel-shadow)]";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-[var(--accent)]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function MissingRates({ missing }: { missing: string[] }) {
  if (!missing.length) return null;
  return (
    <p className="note-warn mb-5 p-3 text-[0.85rem]">
      Amounts in {missing.join(", ")} are left out of the euro totals: no exchange rate is set.{" "}
      <Link href="/portal/admin/finance/reports#rates" className="font-semibold underline underline-offset-4">
        Set the rate
      </Link>
    </p>
  );
}

export function Bars({
  rows,
  color,
  empty,
}: {
  rows: { label: string; cents: number; count?: number }[];
  color: string;
  empty: string;
}) {
  if (!rows.length) return <p className="text-[0.9rem] text-muted">{empty}</p>;
  const max = rows[0].cents || 1;
  const total = rows.reduce((n, r) => n + r.cents, 0) || 1;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[0.88rem]">
            <span className="min-w-0 truncate text-fg">
              {r.label}
              {r.count != null && <span className="ml-1.5 text-faint">· {r.count}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              {eur(r.cents)} <span className="text-faint">· {Math.round((r.cents / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-[color-mix(in_srgb,var(--fg)_7%,transparent)]">
            <div className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (r.cents / max) * 100)}%`, background: color }} title={`${r.label}: ${eur(r.cents)}`} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MonthsChart({ series, current }: { series: { ym: string; income: number; expense: number; profit: number }[]; current: string }) {
  const W = 760;
  const H = 170;
  const left = 56;
  const bottom = 28;
  const top = 12;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]));
  // The smallest round step (1, 2, 2.5 or 5 x 10^n) whose four gridlines cover the tallest bar.
  const pow = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const nice = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((v) => v * 4 >= max) ?? max;
  const ceil = nice * 4;
  const y = (v: number) => top + plotH - (v / ceil) * plotH;
  const band = (W - left - 8) / series.length;
  const barW = Math.min(18, (band - 10) / 2);
  const short = (c: number) => {
    const e = c / 100;
    return e >= 1000 ? `€${(e / 1000).toFixed(e >= 10000 ? 0 : 1)}k` : `€${Math.round(e)}`;
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-5 text-[0.82rem] text-muted">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: INCOME_COLOR }} /> Income
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: EXPENSE_COLOR }} /> Expenses
        </span>
        <span className="text-faint">Hover a bar for the amount.</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="max-h-[200px] w-full" role="img" aria-label="Income and expenses for the last 12 months">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={left} x2={W - 4} y1={y(nice * i)} y2={y(nice * i)} stroke="currentColor" className="text-[var(--line)]" strokeWidth={1} />
            <text x={left - 8} y={y(nice * i) + 4} textAnchor="end" fontSize="11" className="fill-[var(--fg-faint)]">
              {short(nice * i)}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const x0 = left + i * band + band / 2;
          const on = s.ym === current;
          return (
            <g key={s.ym}>
              {on && <rect x={left + i * band + 2} y={top} width={band - 4} height={plotH} rx={6} className="fill-[color-mix(in_srgb,var(--fg)_5%,transparent)]" />}
              <rect x={x0 - barW - 1} y={y(s.income)} width={barW} height={Math.max(0, y(0) - y(s.income))} rx={3} fill={INCOME_COLOR}>
                <title>{`${shortMonth(s.ym)} income: ${eur(s.income)}`}</title>
              </rect>
              <rect x={x0 + 1} y={y(s.expense)} width={barW} height={Math.max(0, y(0) - y(s.expense))} rx={3} fill={EXPENSE_COLOR}>
                <title>{`${shortMonth(s.ym)} expenses: ${eur(s.expense)} · ${s.profit >= 0 ? "profit" : "loss"} ${eur(s.profit)}`}</title>
              </rect>
              <text x={x0} y={H - 8} textAnchor="middle" fontSize="11" className={on ? "fill-[var(--fg)] font-semibold" : "fill-[var(--fg-faint)]"}>
                {shortMonth(s.ym)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function LinesTable({
  lines,
  rates,
  compact = false,
  accounts = [],
}: {
  lines: FinanceLine[];
  rates: Rates;
  compact?: boolean;
  accounts?: { id: string; name: string; currency: string; defaultIn: boolean }[];
}) {
  if (lines.length === 0) {
    return (
      <div className="p-5">
        <EmptyState icon="search" title="Nothing here" body="Transactions for this month appear here." />
      </div>
    );
  }
  const TONE: Record<FinanceLine["source"], string> = {
    fee: "pill-info",
    invoice: "pill-info",
    recurring: "pill-work",
    manual: "pill-neutral",
    payout: "pill-work",
    commission: "pill-info",
  };
  return (
    <div className="rail overflow-x-auto">
      <table className="w-full min-w-[1000px] text-left">
        <thead>
          <tr className="border-b border-line">
            {["Date", "From / to", "What", "Category", "Source", "Amount", "In EUR", compact ? "" : "Status", ""].map((h, i) => (
              <th key={`${h}${i}`} className={`label px-4 py-3 text-faint ${h === "Amount" || h === "In EUR" ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const e = inEur(l, rates);
            return (
              <tr key={`${l.source}-${l.id}`} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-[0.82rem] text-faint">{shortDate(l.date)}</td>
                <td className="px-4 py-3 text-[0.9rem] font-medium text-fg">
                  {l.party ?? "—"}
                  {l.accountName && <span className="block text-[0.72rem] font-normal text-faint">{l.kind === "income" ? "into" : "from"} {l.accountName}</span>}
                </td>
                <td className="min-w-[13rem] px-4 py-3 text-[0.86rem] text-muted">{l.description}</td>
                <td className="px-4 py-3 text-[0.84rem] text-muted">
                  {l.category}
                  {l.vatMode === "reverse_charge" && (
                    <span className="mt-0.5 block text-[0.72rem] text-faint" title="Supplier outside Lithuania: AdmitsFair declares and deducts 21% VAT">
                      Reverse charge · VAT {money(l.vatCents, l.currency)}
                    </span>
                  )}
                  {l.kind === "expense" && !l.partnerCost && (
                    <span className="mt-0.5 block text-[0.72rem] text-faint" title="AdmitsFair carries this alone: it does not lower the partners' profit">
                      AdmitsFair only
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`pill ${TONE[l.source]}`}>{SOURCE_LABEL[l.source]}</span>
                </td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${l.kind === "income" ? "text-ok" : "text-fg"}`}>
                  {l.kind === "income" ? "+" : "−"}
                  {money(l.amountCents, l.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">
                  {e == null ? "no rate" : eur(e)}
                  {e != null && l.currency !== "EUR" && (
                    <span className="block text-[0.7rem] text-faint">at {rateFor(rates, l.currency, l.date)?.toLocaleString("en-GB", { maximumFractionDigits: 2 })} per €</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {compact ? null : l.status === "due" ? <span className="pill pill-warn">In process</span> : <span className="pill pill-ok">Paid</span>}
                </td>
                <td className="px-4 py-3 text-right print:hidden">
                  {l.source === "manual" || l.source === "recurring" ? (
                    <span className="inline-flex items-start gap-1.5">
                    {l.source === "manual" && (
                      <EntryEdit
                        e={{
                          id: l.id,
                          kind: l.kind,
                          category: l.category,
                          description: l.description,
                          party: l.party,
                          amount: (l.amountCents / 100).toFixed(2),
                          currency: l.currency,
                          date: l.date,
                          status: l.status,
                          partnerCost: l.partnerCost,
                          accountId: l.accountId,
                          vatMode: l.vatMode,
                          liabilityTerm: l.liabilityTerm,
                        }}
                        accounts={accounts}
                      />
                    )}
                    <EntryRowActions
                      id={l.id}
                      status={l.status}
                      canToggle={l.kind === "expense"}
                      deletable={l.source === "manual"}
                      receiptHref={l.receiptHref}
                    />
                    </span>
                  ) : l.receiptHref ? (
                    <a href={l.receiptHref} target="_blank" rel="noopener noreferrer" data-tip="Receipt" aria-label="Open the receipt" className="tip tip-end icon-btn">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3 M5.5 8h5 M5.5 10.5h5" />
                      </svg>
                    </a>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------ the journal (Dr / Cr) */

type AccountOpt = { id: string; name: string; currency: string; defaultIn: boolean };

/** Edit, paid / in process, receipt and delete for a line, as far as its source allows. */
export function LineActions({ l, accounts }: { l: FinanceLine; accounts: AccountOpt[] }) {
  if (l.source === "manual" || l.source === "recurring") {
    return (
      <span className="inline-flex items-start gap-1.5">
        {l.source === "manual" && (
          <EntryEdit
            e={{
              id: l.id,
              kind: l.kind,
              category: l.category,
              description: l.description,
              party: l.party,
              amount: (l.amountCents / 100).toFixed(2),
              currency: l.currency,
              date: l.date,
              status: l.status,
              partnerCost: l.partnerCost,
              accountId: l.accountId,
              vatMode: l.vatMode,
              liabilityTerm: l.liabilityTerm,
            }}
            accounts={accounts}
          />
        )}
        <EntryRowActions id={l.id} status={l.status} canToggle={l.kind === "expense"} deletable={l.source === "manual"} receiptHref={l.receiptHref} />
      </span>
    );
  }
  return l.receiptHref ? (
    <a href={l.receiptHref} target="_blank" rel="noopener noreferrer" data-tip="Receipt" aria-label="Open the receipt" className="tip tip-end icon-btn">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3 M5.5 8h5 M5.5 10.5h5" />
      </svg>
    </a>
  ) : null;
}

/**
 * THE JOURNAL: each entry with the account debited and the account credited
 * (and the VAT legs of a reverse-charge purchase), amounts in the currency
 * they moved in, the euro value beside them, and debit and credit totals
 * that must agree.
 */
export function JournalTable({ entries, rates, accounts }: { entries: JournalEntry[]; rates: Rates; accounts: AccountOpt[] }) {
  if (!entries.length) {
    return (
      <div className="p-6">
        <EmptyState icon="search" title="No entries" body="Nothing was recorded in this period." />
      </div>
    );
  }
  let dr = 0;
  let cr = 0;
  for (const e of entries)
    for (const g of e.legs) {
      const v = inEur({ amountCents: g.cents, currency: g.currency, date: e.date }, rates) ?? 0;
      if (g.side === "Dr") dr += v;
      else cr += v;
    }
  return (
    <div className="rail overflow-x-auto">
      <table className="w-full min-w-[980px] text-left">
        <thead>
          <tr className="border-b border-line">
            {["Date / ref", "Particulars", "Account", "Debit", "Credit", "In EUR", "Status", ""].map((h, i) => (
              <th key={`${h}${i}`} className={`label px-3 py-3 text-faint ${["Debit", "Credit", "In EUR"].includes(h) ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const n = e.legs.length;
            const main = e.legs[0];
            const eurVal = inEur({ amountCents: main.cents, currency: main.currency, date: e.date }, rates);
            const l = e.line;
            return e.legs.map((g, i) => (
              <tr key={`${e.key}-${i}`} className={i === n - 1 ? "border-b border-line" : ""}>
                {i === 0 && (
                  <>
                    <td rowSpan={n} className="whitespace-nowrap px-3 py-2.5 align-top">
                      <span className="block text-[0.82rem] text-faint">{shortDate(e.date)}</span>
                      <span className="block font-mono text-[0.7rem] text-muted">{e.ref}</span>
                    </td>
                    <td rowSpan={n} className="min-w-[12rem] max-w-[16rem] px-3 py-2.5 align-top">
                      <span className="block text-[0.88rem] font-medium text-fg">{e.particulars}</span>
                      {e.party && <span className="block text-[0.76rem] text-faint">{l?.kind === "income" ? "From" : "To"} {e.party}</span>}
                      {l && l.kind === "expense" && !l.partnerCost && <span className="block text-[0.72rem] text-faint">AdmitsFair only</span>}
                    </td>
                  </>
                )}
                <td className={`whitespace-nowrap py-1.5 text-[0.84rem] ${g.side === "Cr" ? "pl-9 pr-3 text-muted" : "px-3 text-fg"}`}>
                  <span className="mr-1.5 font-mono text-[0.72rem] text-faint">{g.side}</span>
                  {g.account}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-[0.86rem] text-fg">{g.side === "Dr" ? money(g.cents, g.currency) : ""}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-[0.86rem] text-fg">{g.side === "Cr" ? money(g.cents, g.currency) : ""}</td>
                {i === 0 && (
                  <>
                    <td rowSpan={n} className="whitespace-nowrap px-3 py-2.5 text-right align-top tabular-nums text-[0.84rem] text-muted">
                      {eurVal == null ? "no rate" : eur(eurVal)}
                    </td>
                    <td rowSpan={n} className="px-3 py-2.5 align-top">
                      {e.transfer ? (
                        <span className="pill pill-info">Transfer</span>
                      ) : l?.status === "due" ? (
                        <span className="pill pill-warn">In process</span>
                      ) : (
                        <span className="pill pill-ok">{l?.kind === "income" ? "Received" : "Paid"}</span>
                      )}
                    </td>
                    <td rowSpan={n} className="px-3 py-2.5 text-right align-top print:hidden">
                      {e.transfer ? <DeleteTransfer id={e.transfer.id} /> : l ? <LineActions l={l} accounts={accounts} /> : null}
                    </td>
                  </>
                )}
              </tr>
            ));
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-semibold">
            <td colSpan={3} className="px-3 py-3 text-[0.86rem] text-fg">
              Totals (in EUR) {Math.abs(dr - cr) < 2 ? <span className="ml-2 text-[0.76rem] font-normal text-ok">debits = credits</span> : null}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-fg">{eur(dr)}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-fg">{eur(cr)}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * ONE ACCOUNT'S CASH BOOK: the balance brought forward, every movement in
 * (debit) and out (credit) with the account on the other side, the running
 * balance, and the balance carried forward.
 */
export function CashBook({
  name,
  currency,
  opening,
  rows,
}: {
  name: string;
  currency: string;
  opening: number;
  rows: { key: string; date: string; ref: string; particulars: string; contra: string; dr: number; cr: number }[];
}) {
  let bal = opening;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  const totalDr = sorted.reduce((n, r) => n + r.dr, 0);
  const totalCr = sorted.reduce((n, r) => n + r.cr, 0);
  return (
    <div className="rail overflow-x-auto">
      <table className="w-full min-w-[900px] text-left">
        <thead>
          <tr className="border-b border-line">
            {["Date", "Ref", "Particulars", "Contra account", `Debit (in) ${currency}`, `Credit (out) ${currency}`, "Balance"].map((h) => (
              <th key={h} className={`label px-3 py-3 text-faint ${h.startsWith("Debit") || h.startsWith("Credit") || h === "Balance" ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
            <td colSpan={6} className="px-3 py-2.5 text-[0.86rem] font-medium text-fg">
              Balance brought forward · {name}
            </td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-fg">{money(opening, currency)}</td>
          </tr>
          {sorted.map((r) => {
            bal += r.dr - r.cr;
            return (
              <tr key={r.key} className="border-b border-line">
                <td className="whitespace-nowrap px-3 py-2.5 text-[0.82rem] text-faint">{shortDate(r.date)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[0.76rem] text-muted">{r.ref}</td>
                <td className="px-3 py-2.5 text-[0.88rem] text-fg">{r.particulars}</td>
                <td className="px-3 py-2.5 text-[0.84rem] text-muted">{r.contra}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ok">{r.dr ? money(r.dr, currency) : ""}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-fg">{r.cr ? money(r.cr, currency) : ""}</td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${bal < 0 ? "text-danger" : "text-fg"}`}>{money(bal, currency)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-semibold">
            <td colSpan={4} className="px-3 py-3 text-[0.86rem] text-fg">
              Balance carried forward
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-ok">{money(totalDr, currency)}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-fg">{money(totalCr, currency)}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-fg">{money(opening + totalDr - totalCr, currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
