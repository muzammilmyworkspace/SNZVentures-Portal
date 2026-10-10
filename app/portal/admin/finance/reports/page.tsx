import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import {
  materializeRecurring,
  materializePayouts,
  linesBetween,
  allRates,
  rateFor,
  monthRate,
  latestDayRate,
  listRecurring,
  listPayouts,
  listStakeholders,
  listDistributions,
  inEur,
} from "@/lib/db/repos/finance";
import { Panel } from "@/components/portal/Pieces";
import { FinanceHeader, MissingRates, Bars, MiniStat, INCOME_COLOR, EXPENSE_COLOR } from "@/components/portal/FinanceParts";
import { RateForm, PrintButton } from "@/components/portal/FinanceForms";
import { DateRangePicker } from "@/components/portal/DateRangePicker";
import { eur, money, lastDay, monthName, totals, breakdown, partnerTotals, shareOf, thisMonth, SOURCE_LABEL } from "@/lib/portal/finance-view";
import { resolveRange, monthsIn, rangeQuery, rangeText } from "@/lib/portal/finance-range";

export const metadata: Metadata = { title: "Finance reports", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * THE REPORT, for any dates: a ready range (today, last 7 days, last month,
 * this year…) or two dates of your own, chosen like in an ads manager. What
 * was earned, spent and left; what is still to pay; every breakdown; month by
 * month; downloads for the accountant; exchange rates.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; m?: string }> }) {
  await requireSuperAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const r = resolveRange(await searchParams, today);
  const months = monthsIn(r.from, r.to);
  const ym = thisMonth();
  await materializeRecurring();
  await materializePayouts();
  // Whole months are read, so a month's profit share is right even when the range starts mid-month.
  const [monthLines, rates, recurring, payouts, holders, dists] = await Promise.all([
    linesBetween(`${months[0]}-01`, lastDay(months[months.length - 1])),
    allRates(),
    listRecurring(),
    listPayouts(),
    listStakeholders(),
    listDistributions(months[0], months[months.length - 1]),
  ]);
  const lines = monthLines.filter((l) => l.date >= r.from && l.date <= r.to);
  const income = lines.filter((l) => l.kind === "income");
  const expense = lines.filter((l) => l.kind === "expense");
  const t = totals(lines, rates);
  const pt = partnerTotals(lines, rates);
  const q = rangeQuery(r);

  // WHO TO PAY: bills still due in these dates, everyone owed a referral, and the
  // stakeholders' shares of each month these dates touch that are not paid yet.
  const dueBills = expense.filter((l) => l.status === "due");
  const owedByPerson = breakdown(
    payouts.filter((p) => p.status === "owed").map((p) => ({ ...p, date: p.createdOn })),
    (p) => `${p.consultantName}${p.referrerKind === "referral" ? " (referral)" : ""}`,
    rates
  );
  const stakeholderDues = months.flatMap((m) => {
    const base = partnerTotals(monthLines.filter((l) => l.date.startsWith(m)), rates).base;
    return holders
      .filter((h) => h.active && !h.isCompany && !dists.some((d) => d.stakeholderId === h.id && d.month === m))
      .map((h) => ({ key: `${h.id}-${m}`, name: h.name, month: m, pct: h.sharePct, cents: shareOf(base, h.sharePct) }))
      .filter((x) => x.cents > 0);
  });
  const payTotal =
    dueBills.reduce((n, l) => n + (inEur(l, rates) ?? 0), 0) +
    owedByPerson.reduce((n, x) => n + x.cents, 0) +
    stakeholderDues.reduce((n, x) => n + x.cents, 0);
  const currencies = [...new Set([...lines.map((l) => l.currency), ...recurring.map((x) => x.currency), "PKR"])].filter((c) => c !== "EUR").sort();

  return (
    <>
      <FinanceHeader
        title="Reports"
        lead="Any dates you need: pick a ready range or two dates of your own. What you earned, spent and kept, broken down every way, and downloads for your accountant."
        path="/portal/admin/finance/reports"
        ym={ym}
        monthly={false}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <DateRangePicker path="/portal/admin/finance/reports" preset={r.preset} from={r.from} to={r.to} today={today} />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <a href={`/api/admin/finance/pack?${q}`} className="inline-flex min-h-10 items-center rounded-full border border-moss-400/60 px-4 text-[0.85rem] font-semibold text-accent hover:bg-moss-400/10">
            For the accountant (Excel + receipts)
          </a>
          <a href={`/api/admin/finance/export?${q}`} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.85rem] font-medium text-fg hover:border-[var(--accent)] hover:text-accent">
            Excel
          </a>
          <PrintButton />
        </span>
      </div>
      <p className="mb-4 hidden text-[0.95rem] font-semibold text-fg print:block">{rangeText(r.from, r.to)}</p>
      <MissingRates missing={t.missing} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat tone="in" label="Earned" value={eur(t.income)} hint={`${income.length} amounts in`} />
        <MiniStat label="Spent" value={eur(t.expense)} hint={`${expense.length} amounts out`} />
        <MiniStat label={t.profit >= 0 ? "Profit" : "Loss"} value={eur(t.profit)} tone={t.profit < 0 ? "warn" : undefined} hint={t.income ? `${Math.round((t.profit / t.income) * 100)}% of what was earned` : undefined} />
        <MiniStat label="Profit the partners share" value={eur(pt.base)} hint={`SnZ carries ${eur(pt.ownCost)} alone`} />
      </div>

      <Panel title={`Payments to make · ${eur(payTotal)}`} className="mb-6">
        {payTotal === 0 ? (
          <p className="text-[0.9rem] text-muted">Nothing left to pay for {rangeText(r.from, r.to)}.</p>
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
              <h3 className="label mb-2 text-faint">Consultants &amp; referrals</h3>
              {owedByPerson.length === 0 ? (
                <p className="text-[0.86rem] text-muted">Nobody owed.</p>
              ) : (
                <ul className="space-y-1.5 text-[0.88rem]">
                  {owedByPerson.map((x) => (
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
                <p className="text-[0.86rem] text-muted">{pt.base > 0 ? "All paid." : "No profit to share."}</p>
              ) : (
                <ul className="space-y-1.5 text-[0.88rem]">
                  {stakeholderDues.map((x) => (
                    <li key={x.key} className="flex justify-between gap-3">
                      <span className="truncate text-fg">
                        {x.name} <span className="text-faint">· {x.pct}%{months.length > 1 ? ` · ${monthName(x.month)}` : ""}</span>
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
          <Bars rows={breakdown(income, (l) => l.category, rates)} color={INCOME_COLOR} empty="No income in these dates." />
        </Panel>
        <Panel title="Expenses by category">
          <Bars rows={breakdown(expense, (l) => l.category, rates)} color={EXPENSE_COLOR} empty="No expenses in these dates." />
        </Panel>
        <Panel title="Income by source">
          <Bars rows={breakdown(income, (l) => SOURCE_LABEL[l.source], rates)} color={INCOME_COLOR} empty="No income in these dates." />
        </Panel>
        <Panel title="Who paid you">
          <Bars rows={breakdown(income, (l) => l.party ?? "Not recorded", rates).slice(0, 10)} color={INCOME_COLOR} empty="No income in these dates." />
        </Panel>
        <Panel title="Paid to consultants & referrals">
          <Bars rows={breakdown(expense.filter((l) => l.category === "Commission"), (l) => l.party ?? "Referral", rates)} color={EXPENSE_COLOR} empty="Nobody paid in these dates." />
        </Panel>
        <Panel title="University commissions received">
          <Bars rows={breakdown(income.filter((l) => l.category === "University commission"), (l) => l.party ?? "University", rates)} color={INCOME_COLOR} empty="None received in these dates." />
        </Panel>
        <Panel title="Costs: shared with partners or SnZ only">
          <Bars
            rows={breakdown(expense, (l) => (l.partnerCost ? "Shared with the partners" : "SnZ Ventures only"), rates)}
            color={EXPENSE_COLOR}
            empty="No expenses in these dates."
          />
        </Panel>
      </div>

      {months.length > 1 && (
        <Panel title="Month by month" className="mt-6" padded={false}>
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[0.86rem]">
              <thead>
                <tr className="border-b border-line">
                  {["Month", "Earned", "Spent", "Profit", "Partners share"].map((h) => (
                    <th key={h} className={`label px-4 py-3 text-faint ${h !== "Month" ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const ml = lines.filter((l) => l.date.startsWith(m));
                  const x = totals(ml, rates);
                  return (
                    <tr key={m} className="border-b border-line">
                      <td className="px-4 py-2 text-fg">{monthName(m)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">{eur(x.income)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">{eur(x.expense)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${x.profit < 0 ? "text-danger" : "text-ok"}`}>{eur(x.profit)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">{eur(partnerTotals(ml, rates).base)}</td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className="px-4 py-3 text-fg">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-fg">{eur(t.income)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-fg">{eur(t.expense)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${t.profit < 0 ? "text-danger" : "text-ok"}`}>{eur(t.profit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-fg">{eur(pt.base)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <div id="rates" className="mt-6 scroll-mt-24 print:hidden">
        <Panel title="Exchange rates">
          <p className="mb-5 text-[0.88rem] text-muted">
            Totals are in euros. Rupee, dollar and pound rates come in by themselves every day from a free market-rate service, and
            each amount is turned into euros at the rate of the day it was paid. Fix a rate only if you want one rate for the whole
            of {monthName(ym)}; you can go back to automatic.
          </p>
          <ul className="space-y-3">
            {currencies.map((c) => {
              const row = monthRate(rates, c, ym);
              const todays = latestDayRate(rates, c);
              const used = rateFor(rates, c, today);
              const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
              return (
                <li key={c} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-4">
                  <RateForm key={`${c}-${ym}-${row?.perEur}-${row?.source}`} month={ym} currency={c} current={row?.source === "manual" ? row.perEur : used} manual={row?.source === "manual"} />
                  <span className="text-[0.8rem] text-faint">
                    {row?.source === "manual"
                      ? `Fixed by you for ${monthName(ym)} · ${when(row.updatedAt)}`
                      : todays
                        ? `Automatic · today 1 € = ${todays.perEur.toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${c} · updated ${when(todays.updatedAt)}`
                        : used
                          ? `Using ${used}`
                          : "No rate yet"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}
