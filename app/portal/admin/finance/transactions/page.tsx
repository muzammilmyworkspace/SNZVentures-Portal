import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { materializeRecurring, materializePayouts, linesBetween, allRates, studentsForPicker } from "@/lib/db/repos/finance";
import { Panel } from "@/components/portal/Pieces";
import { FinanceHeader, MissingRates, LinesTable, MiniStat } from "@/components/portal/FinanceParts";
import { AddAmount } from "@/components/portal/AddAmount";
import { eur, money, pickMonth, lastDay, monthName, totals, thisMonth } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Transactions", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * TRANSACTIONS — every amount in and out of a month. Verified fees, paid
 * invoices, fixed costs, referrals paid and commissions received arrive by
 * themselves; anything else is added here, with its proof.
 */
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ m?: string; kind?: string; q?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const ym = pickMonth(sp.m);
  const kind = sp.kind === "income" || sp.kind === "expense" ? sp.kind : "all";
  await materializeRecurring();
  await materializePayouts();
  const [all, rates, students] = await Promise.all([linesBetween(`${ym}-01`, lastDay(ym)), allRates(), studentsForPicker()]);
  const q = (sp.q ?? "").trim().toLowerCase();
  const lines = all.filter(
    (l) => (kind === "all" || l.kind === kind) && (!q || [l.party, l.description, l.category].some((v) => v?.toLowerCase().includes(q)))
  );
  const t = totals(all, rates);
  // In each currency as it was paid, before any conversion.
  const byCurrency = (cur: string, k: "income" | "expense") =>
    all.filter((l) => l.currency === cur && l.kind === k).reduce((n, l) => n + l.amountCents, 0);
  const link = (k: string) => {
    const p = new URLSearchParams();
    if (ym !== thisMonth()) p.set("m", ym);
    if (k !== "all") p.set("kind", k);
    const s = p.toString();
    return s ? `/portal/admin/finance/transactions?${s}` : "/portal/admin/finance/transactions";
  };

  return (
    <>
      <FinanceHeader
        title="Transactions"
        lead="All money in and out. Add anything the portal does not know about with its proof; fees, invoices, fixed costs and referrals come in by themselves."
        path="/portal/admin/finance/transactions"
        ym={ym}
      />
      <MissingRates missing={t.missing} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <MiniStat label="Earning (EUR)" value={eur(t.income)} hint="Everything in, in euros" tone="in" />
        <MiniStat label="Expense (EUR)" value={eur(t.expense)} hint="Everything out, in euros" />
        <MiniStat label={t.profit >= 0 ? "Profit" : "Loss"} value={eur(t.profit)} tone={t.profit < 0 ? "warn" : undefined} />
        <MiniStat label="In euros" value={`+${money(byCurrency("EUR", "income"), "EUR")}`} hint={`Out −${money(byCurrency("EUR", "expense"), "EUR")}`} />
        <MiniStat label="In rupees" value={`+${money(byCurrency("PKR", "income"), "PKR")}`} hint={`Out −${money(byCurrency("PKR", "expense"), "PKR")}`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Show" className="flex flex-wrap gap-2">
          {[
            ["all", `All · ${all.length}`],
            ["income", "Earnings"],
            ["expense", "Expenses"],
          ].map(([k, label]) => (
            <Link
              key={k}
              href={link(k)}
              className={
                kind === k
                  ? "inline-flex min-h-9 items-center rounded-full border border-moss-400/60 px-3.5 text-[0.82rem] font-medium text-accent"
                  : "inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] text-muted hover:text-fg"
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <form action="/portal/admin/finance/transactions" className="flex items-center gap-2 print:hidden">
          {ym !== thisMonth() && <input type="hidden" name="m" value={ym} />}
          {kind !== "all" && <input type="hidden" name="kind" value={kind} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name or what for" aria-label="Search" className="h-9 w-60 rounded-full border border-line bg-[var(--panel-solid)] px-4 text-[0.85rem] text-fg" />
        </form>
      </div>

      <Panel title={`${monthName(ym)} · ${lines.length} transactions`} padded={false} action={<AddAmount students={students} />}>
        <LinesTable lines={lines} rates={rates} />
      </Panel>
    </>
  );
}
