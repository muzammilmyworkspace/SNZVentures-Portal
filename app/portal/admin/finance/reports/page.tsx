import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import {
  materializeRecurring,
  materializePayouts,
  linesBetween,
  allRates,
  rateFor,
  listRecurring,
  studentsForPicker,
  listPayouts,
  listStakeholders,
  listDistributions,
  inEur,
} from "@/lib/db/repos/finance";
import { Panel } from "@/components/portal/Pieces";
import { FinanceHeader, MissingRates, Bars, MiniStat, INCOME_COLOR, EXPENSE_COLOR } from "@/components/portal/FinanceParts";
import { RateForm } from "@/components/portal/FinanceForms";
import { eur, money, pickMonth, lastDay, monthName, totals, breakdown, SOURCE_LABEL } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Finance reports", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * THE MONTH'S REPORT — what was earned, what was spent, what was left, and
 * every breakdown: by category, by source, by who paid, by consultant, by
 * university; then the year month by month; downloads; exchange rates.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireSuperAdmin();
  const ym = pickMonth((await searchParams).m);
  const year = ym.slice(0, 4);
  await materializeRecurring();
  await materializePayouts();
  const [yearLines, rates, recurring, students, payouts, holders, dists] = await Promise.all([
    linesBetween(`${year}-01-01`, lastDay(`${year}-12`)),
    allRates(),
    listRecurring(),
    studentsForPicker(),
    listPayouts(),
    listStakeholders(),
    listDistributions(ym, ym),
  ]);
  const month = yearLines.filter((l) => l.date.startsWith(ym));
  const income = month.filter((l) => l.kind === "income");
  const expense = month.filter((l) => l.kind === "expense");
  const t = totals(month, rates);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const yt = totals(yearLines, rates);
  // WHO TO PAY, at the end of this month: bills still due, consultants owed, stakeholders' shares.
  const dueBills = expense.filter((l) => l.status === "due");
  const owedByConsultant = breakdown(
    payouts.filter((p) => p.status === "owed").map((p) => ({ ...p, date: p.createdOn })),
    (p) => p.consultantName,
    rates
  );
  const stakeholderDues = holders
    .filter((h) => h.active && !h.isCompany && !dists.some((d) => d.stakeholderId === h.id))
    .map((h) => ({ name: h.name, pct: h.sharePct, cents: Math.max(0, Math.round((t.profit * h.sharePct) / 100)) }))
    .filter((x) => x.cents > 0);
  const payTotal =
    dueBills.reduce((n, l) => n + (inEur(l, rates) ?? 0), 0) +
    owedByConsultant.reduce((n, x) => n + x.cents, 0) +
    stakeholderDues.reduce((n, x) => n + x.cents, 0);
  const currencies = [...new Set([...yearLines.map((l) => l.currency), ...recurring.map((r) => r.currency), "PKR"])].filter((c) => c !== "EUR").sort();

  return (
    <>
      <FinanceHeader
        title="Reports"
        lead="The month in full: what you earned, what you spent and what was left, broken down every way. Download it for your accountant."
        path="/portal/admin/finance/reports"
        ym={ym}
        students={students}
        extra={
          <>
            <a href={`/api/admin/finance/pack?m=${ym}`} className="inline-flex min-h-11 items-center rounded-full border border-moss-400/60 px-4 text-[0.88rem] font-semibold text-accent hover:bg-moss-400/10">
              For the accountant (Excel + receipts)
            </a>
            <a href={`/api/admin/finance/export?m=${ym}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-[0.88rem] font-medium text-fg hover:border-[var(--accent)] hover:text-accent">
              Excel: {monthName(ym)}
            </a>
            <a href={`/api/admin/finance/export?year=${year}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-[0.88rem] font-medium text-fg hover:border-[var(--accent)] hover:text-accent">
              Excel: {year}
            </a>
          </>
        }
      />
      <MissingRates missing={t.missing} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <MiniStat tone="in" label="Earned" value={eur(t.income)} hint={`${income.length} amounts in`} />
        <MiniStat label="Spent" value={eur(t.expense)} hint={`${expense.length} amounts out`} />
        <MiniStat label={t.profit >= 0 ? "Profit" : "Loss"} value={eur(t.profit)} hint={t.income ? `${Math.round((t.profit / t.income) * 100)}% of what was earned` : undefined} />
      </div>

      <Panel title={`Payments to make · ${eur(payTotal)}`} className="mb-6">
        {payTotal === 0 ? (
          <p className="text-[0.9rem] text-muted">Nothing left to pay for {monthName(ym)}.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <h3 className="label mb-2 text-faint">Bills still due</h3>
              {dueBills.length === 0 ? (
                <p className="text-[0.86rem] text-muted">None.</p>
              ) : (
                <ul className="space-y-1.5 text-[0.88rem]">
                  {dueBills.map((l) => (
                    <li key={l.id} className="flex justify-between gap-3">
                      <span className="truncate text-fg">{l.description}</span>
                      <span className="shrink-0 tabular-nums text-muted">{money(l.amountCents, l.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="label mb-2 text-faint">Consultants</h3>
              {owedByConsultant.length === 0 ? (
                <p className="text-[0.86rem] text-muted">Nobody owed.</p>
              ) : (
                <ul className="space-y-1.5 text-[0.88rem]">
                  {owedByConsultant.map((x) => (
                    <li key={x.label} className="flex justify-between gap-3">
                      <span className="truncate text-fg">{x.label}</span>
                      <span className="shrink-0 tabular-nums text-muted">{eur(x.cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="label mb-2 text-faint">Stakeholders (share of the profit)</h3>
              {stakeholderDues.length === 0 ? (
                <p className="text-[0.86rem] text-muted">{t.profit > 0 ? "All paid." : "No profit to share."}</p>
              ) : (
                <ul className="space-y-1.5 text-[0.88rem]">
                  {stakeholderDues.map((x) => (
                    <li key={x.name} className="flex justify-between gap-3">
                      <span className="truncate text-fg">
                        {x.name} <span className="text-faint">· {x.pct}%</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">{eur(x.cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Income by category">
          <Bars rows={breakdown(income, (l) => l.category, rates)} color={INCOME_COLOR} empty="No income this month." />
        </Panel>
        <Panel title="Expenses by category">
          <Bars rows={breakdown(expense, (l) => l.category, rates)} color={EXPENSE_COLOR} empty="No expenses this month." />
        </Panel>
        <Panel title="Income by source">
          <Bars rows={breakdown(income, (l) => SOURCE_LABEL[l.source], rates)} color={INCOME_COLOR} empty="No income this month." />
        </Panel>
        <Panel title="Who paid you">
          <Bars rows={breakdown(income, (l) => l.party ?? "Not recorded", rates).slice(0, 10)} color={INCOME_COLOR} empty="No income this month." />
        </Panel>
        <Panel title="Paid to consultants">
          <Bars rows={breakdown(expense.filter((l) => l.category === "Commission"), (l) => l.party ?? "Consultant", rates)} color={EXPENSE_COLOR} empty="No consultants paid this month." />
        </Panel>
        <Panel title="University commissions received">
          <Bars rows={breakdown(income.filter((l) => l.category === "University commission"), (l) => l.party ?? "University", rates)} color={INCOME_COLOR} empty="None received this month." />
        </Panel>
      </div>

      <Panel title={`${year} month by month`} className="mt-6" padded={false}>
        <div className="rail overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[0.86rem]">
            <thead>
              <tr className="border-b border-line">
                {["Month", "Earned", "Spent", "Profit"].map((h) => (
                  <th key={h} className={`label px-4 py-3 text-faint ${h !== "Month" ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const x = totals(yearLines.filter((l) => l.date.startsWith(m)), rates);
                return (
                  <tr key={m} className={`border-b border-line ${m === ym ? "font-semibold" : ""}`}>
                    <td className="px-4 py-2 text-fg">{monthName(m)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">{eur(x.income)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">{eur(x.expense)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${x.profit < 0 ? "text-danger" : "text-ok"}`}>{eur(x.profit)}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="px-4 py-3 text-fg">{year} total</td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">{eur(yt.income)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">{eur(yt.expense)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${yt.profit < 0 ? "text-danger" : "text-ok"}`}>{eur(yt.profit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div id="rates" className="mt-6 scroll-mt-24 print:hidden">
        <Panel title={`Exchange rates · ${monthName(ym)}`}>
          <p className="mb-5 text-[0.88rem] text-muted">
            Totals are in euros. For each other currency, say how many make one euro this month. A month without its own rate
            uses the latest one set before it.
          </p>
          <ul className="space-y-3">
            {currencies.map((c) => {
              const own = rates.find((r) => r.currency === c && r.month === `${ym}-01`)?.perEur ?? null;
              const used = rateFor(rates, c, `${ym}-01`);
              return (
                <li key={c} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-4">
                  <RateForm key={`${c}-${ym}-${own}`} month={ym} currency={c} current={own} />
                  <span className="text-[0.8rem] text-faint">{own ? "Set for this month" : used ? `Using ${used} (latest earlier rate)` : "No rate yet"}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}
