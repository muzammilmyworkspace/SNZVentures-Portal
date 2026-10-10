import Link from "next/link";
import type { ReactNode } from "react";
import { PortalHeading, EmptyState } from "@/components/portal/Pieces";
import { EntryRowActions, EntryEdit, PrintButton } from "@/components/portal/FinanceForms";
import { inEur, type FinanceLine, type Rates } from "@/lib/db/repos/finance";
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
          <span className="ml-auto print:hidden">
            <PrintButton />
          </span>
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

export function LinesTable({ lines, rates, compact = false }: { lines: FinanceLine[]; rates: Rates; compact?: boolean }) {
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
                <td className="px-4 py-3 text-[0.9rem] font-medium text-fg">{l.party ?? "—"}</td>
                <td className="min-w-[13rem] px-4 py-3 text-[0.86rem] text-muted">{l.description}</td>
                <td className="px-4 py-3 text-[0.84rem] text-muted">{l.category}</td>
                <td className="px-4 py-3">
                  <span className={`pill ${TONE[l.source]}`}>{SOURCE_LABEL[l.source]}</span>
                </td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${l.kind === "income" ? "text-ok" : "text-fg"}`}>
                  {l.kind === "income" ? "+" : "−"}
                  {money(l.amountCents, l.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">{e == null ? "no rate" : eur(e)}</td>
                <td className="px-4 py-3">
                  {compact ? null : l.status === "due" ? <span className="pill pill-warn">Due</span> : <span className="pill pill-ok">Paid</span>}
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
                        }}
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
