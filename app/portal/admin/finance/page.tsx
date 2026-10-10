import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import {
  materializeRecurring,
  materializePayouts,
  linesBetween,
  allRates,
  inEur,
  pendingFees,
  listPayouts,
  listCommissions,
  listStakeholders,
  listDistributions,
} from "@/lib/db/repos/finance";
import { PortalHeading, Panel, EmptyState } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { FinanceHeader, MissingRates, MonthsChart, Bars, MiniStat, INCOME_COLOR, EXPENSE_COLOR } from "@/components/portal/FinanceParts";
import { eur, money, pickMonth, shiftMonth, lastDay, shortMonth, shortDate, totals, breakdown, sumEur, partnerTotals, shareOf } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Finance", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * FINANCE DASHBOARD — super admin only. First the initial consultancy fees
 * verified this month, then the month in small cards, the last twelve months
 * and where the money came from and went. Money is added on Transactions.
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
  const first = shiftMonth(ym, -11);
  const [lines, rates, pending, payouts, commissions, holders, dists] = await Promise.all([
    linesBetween(`${first}-01`, lastDay(ym)),
    allRates(),
    pendingFees(),
    listPayouts(),
    listCommissions(),
    listStakeholders(),
    listDistributions(ym, ym),
  ]);

  const month = lines.filter((l) => l.date.startsWith(ym));
  const fees = month.filter((l) => l.source === "fee");
  const feesEur = sumEur(fees, rates);
  const t = totals(month, rates);
  const series = Array.from({ length: 12 }, (_, i) => shiftMonth(first, i)).map((m) => ({
    ym: m,
    ...totals(lines.filter((l) => l.date.startsWith(m)), rates),
  }));
  const owed = sumEur(payouts.filter((p) => p.status === "owed").map((p) => ({ ...p, date: p.createdOn })), rates);
  const expected = sumEur(commissions.filter((c) => c.status === "expected").map((c) => ({ ...c, date: c.expectedOn ?? `${ym}-01` })), rates);
  const pendingEur = sumEur(pending.map((p) => ({ ...p, date: p.sentOn })), rates);
  const stakeDue = holders
    .filter((h) => h.active && !h.isCompany && !dists.some((d) => d.stakeholderId === h.id))
    .reduce((n, h) => n + shareOf(partnerTotals(month, rates).base, h.sharePct), 0);

  return (
    <>
      <FinanceHeader
        title="Finance"
        lead="Your month at a glance. Fees verified in the portal come in by themselves; add any other money on Transactions."
        path="/portal/admin/finance"
        ym={ym}
      />
      <MissingRates missing={[...new Set([...t.missing, ...feesEur.missing])]} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MiniStat label={`Consultancy fees · ${shortMonth(ym)}`} value={eur(feesEur.cents)} hint={`${fees.length} verified`} tone="in" />
        <MiniStat label="Earned" value={eur(t.income)} hint="All money in" tone="in" href="/portal/admin/finance/transactions?kind=income" />
        <MiniStat label="Spent" value={eur(t.expense)} hint="All money out" href="/portal/admin/finance/transactions?kind=expense" />
        <MiniStat label={t.profit >= 0 ? "Profit" : "Loss"} value={eur(t.profit)} tone={t.profit < 0 ? "warn" : undefined} href="/portal/admin/finance/reports" />
        <MiniStat label="Still to pay" value={eur(t.due + owed.cents + stakeDue)} hint="Bills, consultants, stakeholders" tone="warn" href="/portal/admin/finance/reports" />
        <MiniStat label="Still to receive" value={eur(expected.cents + pendingEur.cents)} hint={`${pending.length} fees to verify · universities`} href="/portal/admin/finance/universities" />
      </div>

      <Panel
        title={`Initial consultancy fees · ${shortMonth(ym)} · ${eur(feesEur.cents)}`}
        className="mb-5"
        padded={fees.length === 0}
        action={
          <Link href="/portal/admin/fees" className="label text-faint hover:text-accent">
            Fee verification
          </Link>
        }
      >
        {fees.length === 0 ? (
          <EmptyState icon="search" title="None verified this month" body="Fees appear here as soon as you verify a student's receipt." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[0.82rem] text-faint">{shortDate(f.date)}</td>
                    <td className="px-4 py-2.5 text-[0.9rem] font-medium text-fg">{f.party}</td>
                    <td className="px-4 py-2.5 text-[0.84rem] text-muted">{f.description}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-ok">+{money(f.amountCents, f.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-[0.82rem] text-faint">{f.currency === "EUR" ? "" : eur(inEur(f, rates) ?? 0)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {f.receiptHref && (
                        <a href={f.receiptHref} target="_blank" rel="noopener noreferrer" className="text-[0.8rem] text-muted underline underline-offset-4 hover:text-accent">
                          Receipt
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Last 12 months">
          <MonthsChart series={series} current={ym} />
        </Panel>
        <div className="grid gap-5">
          <Panel title={`Came from · ${shortMonth(ym)}`}>
            <Bars rows={breakdown(month.filter((l) => l.kind === "income"), (l) => l.category, rates).slice(0, 4)} color={INCOME_COLOR} empty="No income yet." />
          </Panel>
          <Panel title={`Went to · ${shortMonth(ym)}`}>
            <Bars rows={breakdown(month.filter((l) => l.kind === "expense"), (l) => l.category, rates).slice(0, 4)} color={EXPENSE_COLOR} empty="No expenses yet." />
          </Panel>
        </div>
      </div>
    </>
  );
}
