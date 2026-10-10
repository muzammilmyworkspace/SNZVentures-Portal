import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import {
  materializeRecurring,
  materializePayouts,
  linesBetween,
  allRates,
  listStakeholders,
  listDistributions,
} from "@/lib/db/repos/finance";
import { Panel, EmptyState } from "@/components/portal/Pieces";
import { FinanceHeader, MissingRates, MiniStat } from "@/components/portal/FinanceParts";
import { StakeholderForm, StakeholderRowActions, DistributeButton } from "@/components/portal/FinanceForms";
import { eur, pickMonth, shiftMonth, lastDay, monthName, shortDate, totals } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Stakeholders", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * STAKEHOLDERS — who shares the monthly profit, what each one's part is this
 * month, and whether it has been paid. SnZ Ventures' own share stays in the
 * business. A profit share is not an expense.
 */
export default async function StakeholdersPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireSuperAdmin();
  const ym = pickMonth((await searchParams).m);
  await materializeRecurring();
  await materializePayouts();
  const first = shiftMonth(ym, -11);
  const [lines, rates, holders, dists] = await Promise.all([
    linesBetween(`${first}-01`, lastDay(ym)),
    allRates(),
    listStakeholders(),
    listDistributions(first, ym),
  ]);
  const active = holders.filter((h) => h.active);
  const totalPct = active.reduce((n, h) => n + h.sharePct, 0);
  const month = totals(lines.filter((l) => l.date.startsWith(ym)), rates);
  const share = (profit: number, pct: number) => Math.max(0, Math.round((profit * pct) / 100));
  const paidFor = (id: string, m: string) => dists.find((d) => d.stakeholderId === id && d.month === m) ?? null;
  const partners = active.filter((h) => !h.isCompany);
  const toPay = partners.filter((h) => !paidFor(h.id, ym)).reduce((n, h) => n + share(month.profit, h.sharePct), 0);
  const paid = partners.reduce((n, h) => n + (paidFor(h.id, ym)?.amountCents ?? 0), 0);
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(ym, -i));

  return (
    <>
      <FinanceHeader
        title="Stakeholders"
        lead="Who shares the profit. Each month everyone's part is worked out from that month's profit; mark it paid when you pay them."
        path="/portal/admin/finance/stakeholders"
        ym={ym}
      />
      <MissingRates missing={month.missing} />
      {active.length > 0 && Math.abs(totalPct - 100) > 0.001 && (
        <p className="note-warn mb-5 p-3 text-[0.85rem]">The shares add up to {totalPct}%, not 100%.</p>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label={`Profit · ${monthName(ym)}`} value={eur(month.profit)} tone={month.profit < 0 ? "warn" : undefined} hint={month.profit <= 0 ? "Nothing to share" : undefined} />
        <MiniStat label="To pay stakeholders" value={eur(toPay)} tone={toPay ? "warn" : undefined} hint="Not counting SnZ Ventures' own share" />
        <MiniStat label="Paid this month" value={eur(paid)} tone="in" />
        <MiniStat label="Stakeholders" value={active.length} hint={`${totalPct}% of the profit shared`} />
      </div>

      <Panel title={`Shares · ${monthName(ym)}`} className="mb-5" padded={holders.length === 0} action={<StakeholderForm label="+ Add stakeholder" />}>
        {holders.length === 0 ? (
          <EmptyState icon="search" title="No stakeholders yet" body="Add SnZ Ventures (e.g. 50%) and each partner with their share (e.g. 25% each)." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Stakeholder", "Share", "Their part", "Status", ""].map((h, i) => (
                    <th key={`${h}${i}`} className="label px-4 py-3 text-faint">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holders.map((h) => {
                  const p = paidFor(h.id, ym);
                  return (
                    <tr key={h.id} className={`border-b border-line last:border-0 ${h.active ? "" : "opacity-55"}`}>
                      <td className="px-4 py-3">
                        <span className="block text-[0.92rem] font-medium text-fg">
                          {h.name}
                          {!h.active && <span className="pill pill-neutral ml-2">Off</span>}
                        </span>
                        {h.notes && <span className="block text-[0.76rem] text-faint">{h.notes}</span>}
                      </td>
                      <td className="px-4 py-3 text-[0.9rem] text-muted">{h.sharePct}%</td>
                      <td className="px-4 py-3 text-[0.98rem] font-semibold tabular-nums text-fg">{h.active ? eur(p ? p.amountCents : share(month.profit, h.sharePct)) : "—"}</td>
                      <td className="px-4 py-3">
                        {!h.active ? null : h.isCompany ? (
                          <span className="pill pill-info">Stays in the business</span>
                        ) : p ? (
                          <span className="pill pill-ok">Paid {shortDate(p.paidOn)}</span>
                        ) : month.profit > 0 ? (
                          <span className="pill pill-warn">To pay</span>
                        ) : (
                          <span className="pill pill-neutral">Nothing this month</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-start gap-1.5">
                          {h.active && !h.isCompany && (p || month.profit > 0) && (
                            <DistributeButton stakeholderId={h.id} month={ym} paid={Boolean(p)} label={`${h.name}'s share`} />
                          )}
                          <StakeholderForm label="Edit" initial={h} />
                          <StakeholderRowActions id={h.id} name={h.name} active={h.active} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {active.length > 0 && (
        <Panel title="Last 12 months" padded={false}>
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[0.86rem]">
              <thead>
                <tr className="border-b border-line">
                  <th className="label px-4 py-3 text-faint">Month</th>
                  <th className="label px-4 py-3 text-right text-faint">Profit</th>
                  {active.map((h) => (
                    <th key={h.id} className="label px-4 py-3 text-right text-faint">
                      {h.name} ({h.sharePct}%)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const x = totals(lines.filter((l) => l.date.startsWith(m)), rates);
                  return (
                    <tr key={m} className={`border-b border-line last:border-0 ${m === ym ? "font-semibold" : ""}`}>
                      <td className="px-4 py-2 text-fg">{monthName(m)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${x.profit < 0 ? "text-danger" : "text-fg"}`}>{eur(x.profit)}</td>
                      {active.map((h) => {
                        const p = paidFor(h.id, m);
                        return (
                          <td key={h.id} className="px-4 py-2 text-right tabular-nums text-muted">
                            {eur(p ? p.amountCents : share(x.profit, h.sharePct))}
                            <span className={`ml-1.5 text-[0.72rem] ${p ? "text-ok" : "text-faint"}`}>
                              {h.isCompany ? "kept" : p ? "paid" : x.profit > 0 ? "to pay" : ""}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
