import "server-only";
import {
  linesBetween,
  allRates,
  inEur,
  accountBalances,
  listPayouts,
  listCommissions,
  listStakeholders,
  listDistributions,
  pendingFees,
  type FinanceLine,
  type Rates,
  type MoneyAccount,
} from "@/lib/db/repos/finance";
import { sumEur, partnerTotals, shareOf, shiftMonth } from "@/lib/portal/finance-view";

/**
 * THE FINANCIAL POSITION TODAY — what AdmitsFair has, what it owes, what is left.
 * One calculation for the dashboard and the balance page, so the two can
 * never show different figures.
 *
 * ASSETS: cash and bank (each money account), receivables (university
 * commissions expected, fees sent and awaiting verification).
 * LIABILITIES (in process): short-term (subscriptions and bills recorded
 * and unpaid, referral commissions owed, partners' profit shares not yet
 * paid) and long-term (expenses marked long-term).
 * EQUITY: assets less liabilities.
 */
export type Position = {
  today: string;
  rates: Rates;
  /** Every line ever, for callers that need more than the position. */
  all: FinanceLine[];
  accounts: { account: MoneyAccount; cents: number; eur: number | null }[];
  cash: number;
  receivable: { commissions: number; feesToVerify: number; feesCount: number; total: number };
  liabilities: { subscriptions: number; bills: number; referrals: number; partners: number; vat: number; short: number; long: number; total: number };
  /** This month's reverse-charge VAT: input VAT (asset) = output VAT (liability). */
  vatRc: { cents: number; count: number };
  equity: number;
  assets: number;
  missing: string[];
};

export async function financialPosition(): Promise<Position> {
  const today = new Date().toISOString().slice(0, 10);
  const now = today.slice(0, 7);
  const [balances, rates, all, payouts, commissions, holders, dists, pending] = await Promise.all([
    accountBalances(today),
    allRates(),
    linesBetween("2000-01-01", "2100-12-31"),
    listPayouts(),
    listCommissions(),
    listStakeholders(),
    listDistributions(shiftMonth(now, -11), now),
    pendingFees(),
  ]);
  const at = (cents: number, currency: string) => inEur({ amountCents: cents, currency, date: today }, rates);

  const accounts = balances.map((b) => ({ ...b, eur: at(b.cents, b.account.currency) }));
  const cash = accounts.filter((a) => a.account.active).reduce((n, a) => n + (a.eur ?? 0), 0);
  const comm = sumEur(commissions.filter((c) => c.status === "expected").map((c) => ({ ...c, date: today })), rates);
  const fees = sumEur(pending.map((p) => ({ ...p, date: p.sentOn })), rates);

  const due = all.filter((l) => l.kind === "expense" && l.status === "due");
  const subs = sumEur(due.filter((l) => l.source === "recurring" && l.liabilityTerm === "short"), rates);
  const bills = sumEur(due.filter((l) => l.source !== "recurring" && l.liabilityTerm === "short"), rates);
  const long = sumEur(due.filter((l) => l.liabilityTerm === "long"), rates);
  const refs = sumEur(payouts.filter((p) => p.status === "owed").map((p) => ({ ...p, date: p.createdOn })), rates);
  const partners = Array.from({ length: 12 }, (_, i) => shiftMonth(now, -i)).reduce((n, m) => {
    const base = partnerTotals(all.filter((l) => l.date.startsWith(m)), rates).base;
    return (
      n +
      holders
        .filter((h) => h.active && !h.isCompany && !dists.some((d) => d.stakeholderId === h.id && d.month === m))
        .reduce((k, h) => k + shareOf(base, h.sharePct), 0)
    );
  }, 0);

  // Reverse charge this month: the same 21% sits on both sides until the return is filed.
  const rc = all.filter((l) => l.vatMode === "reverse_charge" && l.date.startsWith(now));
  const vat = sumEur(rc.map((l) => ({ amountCents: l.vatCents, currency: l.currency, date: l.date })), rates).cents;

  const short = subs.cents + bills.cents + refs.cents + partners + vat;
  const receivableTotal = comm.cents + fees.cents;
  const assets = cash + receivableTotal + vat;
  const total = short + long.cents;
  return {
    today,
    rates,
    all,
    accounts,
    cash,
    receivable: { commissions: comm.cents, feesToVerify: fees.cents, feesCount: pending.length, total: receivableTotal },
    liabilities: { subscriptions: subs.cents, bills: bills.cents, referrals: refs.cents, partners, vat, short, long: long.cents, total },
    vatRc: { cents: vat, count: rc.length },
    equity: assets - total,
    assets,
    missing: [...new Set([...comm.missing, ...fees.missing, ...subs.missing, ...bills.missing, ...long.missing, ...refs.missing, ...accounts.filter((a) => a.eur == null).map((a) => a.account.currency)])],
  };
}
