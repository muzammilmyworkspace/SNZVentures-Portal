import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { materializeRecurring, linesBetween, listRecurring, allRates, inEur, EXPENSE_CATEGORIES } from "@/lib/db/repos/finance";
import { Panel, EmptyState } from "@/components/portal/Pieces";
import { FinanceHeader, MiniStat } from "@/components/portal/FinanceParts";
import { RecurringForm, RecurringRowActions, RecurringEdit, ModalButton } from "@/components/portal/FinanceForms";
import { eur, money, monthName, thisMonth, lastDay, sumEur } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Fixed expenses", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * FIXED EXPENSES — rent, salaries, subscriptions, marketing budgets: added
 * once with their bill, then written into every month by themselves.
 */
export default async function FixedCostsPage() {
  await requireSuperAdmin();
  const now = thisMonth();
  await materializeRecurring();
  const [recurring, rates, monthLines] = await Promise.all([listRecurring(), allRates(), linesBetween(`${now}-01`, lastDay(now))]);
  const running = recurring.filter((r) => r.active);
  const monthly = running.reduce((n, r) => n + (inEur({ amountCents: r.amountCents, currency: r.currency, date: `${now}-01` }, rates) ?? 0), 0);
  const sharedMonthly = running
    .filter((r) => r.partnerCost)
    .reduce((n, r) => n + (inEur({ amountCents: r.amountCents, currency: r.currency, date: `${now}-01` }, rates) ?? 0), 0);
  const fixedThisMonth = monthLines.filter((l) => l.source === "recurring");
  const due = sumEur(fixedThisMonth.filter((l) => l.status === "due"), rates);
  const paid = sumEur(fixedThisMonth.filter((l) => l.status === "paid"), rates);

  return (
    <>
      <FinanceHeader
        title="Fixed expenses"
        lead="Everything you pay every month. Add it once with its bill; it goes into Expenses each month by itself. Say whether the partners share it: office rent, internet and phone are SnZ Ventures' own."
        path="/portal/admin/finance/fixed"
        ym={now}
        monthly={false}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Total every month" value={eur(monthly)} hint="All running fixed expenses" />
        <MiniStat
          label="Partners share"
          value={eur(sharedMonthly)}
          hint={`SnZ only: ${eur(monthly - sharedMonthly)} a month · ${running.length} running`}
        />
        <MiniStat label={`Paid · ${monthName(now)}`} value={eur(paid.cents)} tone="in" />
        <MiniStat label={`Still due · ${monthName(now)}`} value={eur(due.cents)} tone={due.cents ? "warn" : undefined} />
      </div>

      <Panel
        title="Fixed expenses"
        padded={recurring.length === 0}
        action={
          <ModalButton label="+ Add expense" title="Add a fixed expense">
            <RecurringForm categories={EXPENSE_CATEGORIES} thisMonth={now} />
          </ModalButton>
        }
      >
        {recurring.length === 0 ? (
          <EmptyState icon="search" title="None yet" body="Add rent, salaries, subscriptions (like Claude Max) and anything else you pay every month." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Name", "Category", "Every month", "Day", "Paid", "Partners", "Bill", ""].map((h, i) => (
                    <th key={`${h}${i}`} className="label px-4 py-3 text-faint">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recurring.map((r) => (
                  <tr key={r.id} className={`border-b border-line last:border-0 ${r.active ? "" : "opacity-55"}`}>
                    <td className="px-4 py-3 text-[0.9rem] font-medium text-fg">
                      {r.name}
                      {!r.active && <span className="pill pill-neutral ml-2">Stopped</span>}
                      <span className="block text-[0.74rem] font-normal text-faint">Since {monthName(r.startsOn.slice(0, 7))}</span>
                    </td>
                    <td className="px-4 py-3 text-[0.85rem] text-muted">{r.category}</td>
                    <td className="px-4 py-3 text-[0.9rem] font-semibold tabular-nums text-fg">{money(r.amountCents, r.currency)}</td>
                    <td className="px-4 py-3 text-[0.85rem] text-muted">{r.dayOfMonth}</td>
                    <td className="px-4 py-3 text-[0.85rem] text-muted">{r.autoPaid ? "Automatically" : "You mark it"}</td>
                    <td className="px-4 py-3">
                      {r.partnerCost ? <span className="pill pill-info">Shared</span> : <span className="pill pill-neutral">SnZ only</span>}
                    </td>
                    <td className="px-4 py-3 text-[0.85rem]">
                      {r.hasBill ? (
                        <a href={`/api/admin/finance/receipt/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
                          View
                        </a>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-start gap-1.5">
                        <RecurringEdit
                          r={{ id: r.id, name: r.name, category: r.category, amount: (r.amountCents / 100).toFixed(2), currency: r.currency, dayOfMonth: r.dayOfMonth, autoPaid: r.autoPaid, partnerCost: r.partnerCost }}
                          categories={EXPENSE_CATEGORIES}
                        />
                        <RecurringRowActions id={r.id} name={r.name} active={r.active} autoPaid={r.autoPaid} amount={(r.amountCents / 100).toFixed(2)} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
