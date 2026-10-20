import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { materializeRecurring, materializePayouts } from "@/lib/db/repos/finance";
import { PortalHeading, Panel } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { FinanceHeader, MissingRates, MonthsChart, MiniStat } from "@/components/portal/FinanceParts";
import { financialPosition } from "@/lib/portal/finance-position";
import { eur, money, pickMonth, shiftMonth, monthName, shortMonth, totals, breakdown, sumEur, partnerTotals } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Finance", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * THE FINANCE DASHBOARD — everything on one screen.
 *
 * The month's PROFIT AND LOSS (revenue, expenses, net profit), today's
 * FINANCIAL POSITION (cash and bank, receivables, liabilities in process,
 * equity), then the detail of each: the P&L by category, every bank and cash
 * account, what is owed and what is to be received, twelve months of
 * results, and what needs attention.
 */
export default async function FinanceDashboard({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireSuperAdmin();
  const ym = pickMonth((await searchParams).m);
  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Finance" title="Finance" />
        <NotConfigured what="Finance" />
      </>
    );
  }

  await materializeRecurring();
  await materializePayouts();
  const pos = await financialPosition();
  const { rates, all } = pos;
  const month = all.filter((l) => l.date.startsWith(ym));
  const t = totals(month, rates);
  const pt = partnerTotals(month, rates);
  const revenue = breakdown(month.filter((l) => l.kind === "income"), (l) => l.category, rates);
  const expenses = breakdown(month.filter((l) => l.kind === "expense"), (l) => l.category, rates);
  const first = shiftMonth(ym, -11);
  const series = Array.from({ length: 12 }, (_, i) => shiftMonth(first, i)).map((m) => ({ ym: m, ...totals(all.filter((l) => l.date.startsWith(m)), rates) }));
  const rc = month.filter((l) => l.vatMode === "reverse_charge");
  const rcVat = sumEur(rc.map((l) => ({ amountCents: l.vatCents, currency: l.currency, date: l.date })), rates);
  const inProcess = month.filter((l) => l.kind === "expense" && l.status === "due");
  const L = pos.liabilities;
  const margin = t.income ? Math.round((t.profit / t.income) * 100) : null;

  const row = (label: string, cents: number, o: { strong?: boolean; tone?: "in" | "out"; sub?: string; href?: string; key?: string } = {}) => (
    <tr key={o.key} className={`border-b border-line last:border-0 ${o.strong ? "font-semibold" : ""}`}>
      <td className={`px-4 py-2 text-[0.86rem] ${o.strong ? "text-fg-strong" : "text-fg"}`}>
        {o.href ? (
          <Link href={o.href} className="underline-offset-4 hover:text-accent hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
        {o.sub && <span className="block text-[0.72rem] font-normal text-faint">{o.sub}</span>}
      </td>
      <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${o.tone === "in" ? "text-ok" : o.strong ? "text-fg-strong" : "text-muted"}`}>{eur(cents)}</td>
    </tr>
  );
  const head = (label: string) => (
    <tr className="border-b border-line">
      <td colSpan={2} className="label px-4 pb-1.5 pt-3 text-[0.68rem] text-faint">
        {label}
      </td>
    </tr>
  );

  const attention = [
    pos.receivable.feesCount > 0 && { label: `${pos.receivable.feesCount} fee receipts to verify`, value: eur(pos.receivable.feesToVerify), href: "/portal/admin/fees" },
    inProcess.length > 0 && { label: `${inProcess.length} bills in process this month`, value: eur(sumEur(inProcess, rates).cents), href: "/portal/admin/finance/transactions?show=process" },
    L.referrals > 0 && { label: "Referral commissions to pay", value: eur(L.referrals), href: "/portal/admin/finance/consultants?show=owed" },
    L.partners > 0 && { label: "Partner profit shares to pay", value: eur(L.partners), href: "/portal/admin/finance/stakeholders" },
    rc.length > 0 && { label: `Reverse-charge VAT to declare (${rc.length})`, value: eur(rcVat.cents), href: "/portal/admin/finance/reports#vat" },
    pos.receivable.commissions > 0 && { label: "University commissions to be received", value: eur(pos.receivable.commissions), href: "/portal/admin/finance/universities?show=expected" },
  ].filter(Boolean) as { label: string; value: string; href: string }[];

  return (
    <>
      <FinanceHeader title="Finance" lead="The month's profit and loss and today's financial position, on one screen." path="/portal/admin/finance" ym={ym} />
      <MissingRates missing={[...new Set([...t.missing, ...pos.missing])]} />

      <h2 className="label mb-2 text-[0.7rem] text-faint">Profit and loss · {monthName(ym)}</h2>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Revenue" value={eur(t.income)} hint={`${month.filter((l) => l.kind === "income").length} entries`} tone="in" href="/portal/admin/finance/transactions?show=in" />
        <MiniStat label="Expenses" value={eur(t.expense)} hint={`${month.filter((l) => l.kind === "expense").length} entries · ${eur(t.due)} in process`} href="/portal/admin/finance/transactions?show=out" />
        <MiniStat
          label={t.profit >= 0 ? "Net profit" : "Net loss"}
          value={eur(t.profit)}
          hint={margin == null ? "No revenue yet" : `${margin}% margin · partners share ${eur(pt.base)}`}
          tone={t.profit < 0 ? "warn" : "in"}
          href="/portal/admin/finance/reports"
        />
      </div>

      <h2 className="label mb-2 text-[0.7rem] text-faint">Financial position · today</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Cash and bank" value={eur(pos.cash)} hint={`${pos.accounts.filter((a) => a.account.active).length} accounts`} href="/portal/admin/finance/transactions" />
        <MiniStat label="To be received" value={eur(pos.receivable.total)} hint="Receivables: commissions, fees to verify" href="/portal/admin/finance/balance" />
        <MiniStat label="Liabilities (in process)" value={eur(L.total)} hint={`Short-term ${eur(L.short)} · long-term ${eur(L.long)}`} tone={L.total ? "warn" : undefined} href="/portal/admin/finance/balance" />
        <MiniStat label="Equity" value={eur(pos.equity)} hint="Assets − liabilities" tone={pos.equity < 0 ? "warn" : undefined} href="/portal/admin/finance/balance" />
      </div>

      <div className="mb-6 grid items-start gap-5 xl:grid-cols-3">
        <Panel title={`Profit and loss · ${shortMonth(ym)}`} padded={false}>
          <table className="w-full text-left">
            <tbody>
              {head("Revenue")}
              {revenue.length === 0 ? row("No revenue yet", 0) : revenue.map((r) => row(r.label, r.cents, { key: `r-${r.label}` }))}
              {row("Total revenue", t.income, { strong: true, tone: "in" })}
              {head("Expenses")}
              {expenses.length === 0 ? row("No expenses yet", 0) : expenses.map((r) => row(r.label, r.cents, { key: `e-${r.label}` }))}
              {row("Total expenses", t.expense, { strong: true })}
              {row(t.profit >= 0 ? "Net profit" : "Net loss", t.profit, { strong: true, tone: t.profit >= 0 ? "in" : undefined })}
              {row("Profit the partners share", pt.base, { sub: `After shared costs; SnZ carries ${eur(pt.ownCost)} alone`, href: "/portal/admin/finance/stakeholders" })}
            </tbody>
          </table>
        </Panel>

        <Panel title={`Cash and bank · ${eur(pos.cash)}`} padded={false}>
          <table className="w-full text-left">
            <tbody>
              {pos.accounts
                .filter((a) => a.account.active)
                .map((a) => (
                  <tr key={a.account.id} className="border-b border-line">
                    <td className="px-4 py-2.5">
                      <Link href={`/portal/admin/finance/transactions?acc=${a.account.id}`} className="text-[0.88rem] font-medium text-fg underline-offset-4 hover:text-accent hover:underline">
                        {a.account.name}
                      </Link>
                      <span className="block text-[0.72rem] text-faint">
                        {a.account.kind === "cash" ? "Cash" : "Bank"} · {money(a.cents, a.account.currency)}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums ${a.cents < 0 ? "text-danger" : "text-fg"}`}>{a.eur == null ? "no rate" : eur(a.eur)}</td>
                  </tr>
                ))}
              {row("Total cash and bank", pos.cash, { strong: true })}
            </tbody>
          </table>
        </Panel>

        <Panel title={`Liabilities (in process) · ${eur(L.total)}`} padded={false}>
          <table className="w-full text-left">
            <tbody>
              {head("Short-term")}
              {row("Subscriptions and fixed costs", L.subscriptions, { href: "/portal/admin/finance/fixed" })}
              {row("Other bills", L.bills, { href: "/portal/admin/finance/transactions?show=process" })}
              {row("Referral commissions", L.referrals, { href: "/portal/admin/finance/consultants?show=owed" })}
              {row("Partner profit shares", L.partners, { href: "/portal/admin/finance/stakeholders" })}
              {L.vat > 0 && row("Output VAT 21% (reverse charge)", L.vat, { sub: "Deducted again as input VAT", href: "/portal/admin/finance/reports#vat" })}
              {head("Long-term")}
              {row("Long-term liabilities", L.long)}
              {row("Total liabilities", L.total, { strong: true })}
              {head("To be received")}
              {row("University commissions", pos.receivable.commissions, { href: "/portal/admin/finance/universities?show=expected" })}
              {row("Fees awaiting verification", pos.receivable.feesToVerify, { sub: `${pos.receivable.feesCount} receipts`, href: "/portal/admin/fees" })}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Last 12 months · revenue and expenses">
          <MonthsChart series={series} current={ym} />
        </Panel>
        <Panel title="Needs attention" padded={attention.length === 0}>
          {attention.length === 0 ? (
            <p className="text-[0.9rem] text-muted">Nothing waiting.</p>
          ) : (
            <ul>
              {attention.map((a) => (
                <li key={a.label} className="border-b border-line last:border-0">
                  <Link href={a.href} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]">
                    <span className="text-[0.88rem] text-fg">{a.label}</span>
                    <span className="whitespace-nowrap font-semibold tabular-nums text-warn">{a.value}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
