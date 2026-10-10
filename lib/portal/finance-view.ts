import { formatMoney, type CurrencyCode } from "@/lib/invoices/model";
import { inEur, type FinanceLine, type Rates } from "@/lib/db/repos/finance";

/** Helpers the Finance pages share: months, euro totals, money as text. */

export const eur = (cents: number) => formatMoney(cents, "EUR");

export const money = (cents: number, currency: string) =>
  ["EUR", "PKR", "USD", "GBP"].includes(currency) ? formatMoney(cents, currency as CurrencyCode) : `${currency} ${(cents / 100).toFixed(2)}`;

export const thisMonth = () => new Date().toISOString().slice(0, 7);

export const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export const shortMonth = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

export const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

export function lastDay(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** The month a page shows: ?m=YYYY-MM, else this month. */
export const pickMonth = (m?: string) => (m && /^\d{4}-\d{2}$/.test(m) ? m : thisMonth());

/** Sum of amounts in euro cents; currencies without a rate are left out and named. */
export function sumEur(items: { amountCents: number; currency: string; date: string }[], rates: Rates) {
  let cents = 0;
  const missing = new Set<string>();
  for (const i of items) {
    const v = inEur(i, rates);
    if (v == null) missing.add(i.currency);
    else cents += v;
  }
  return { cents, missing: [...missing] };
}

export function totals(lines: FinanceLine[], rates: Rates) {
  const inc = sumEur(lines.filter((l) => l.kind === "income"), rates);
  const exp = sumEur(lines.filter((l) => l.kind === "expense"), rates);
  const due = sumEur(lines.filter((l) => l.kind === "expense" && l.status === "due"), rates);
  return {
    income: inc.cents,
    expense: exp.cents,
    profit: inc.cents - exp.cents,
    due: due.cents,
    missing: [...new Set([...inc.missing, ...exp.missing])],
  };
}

/** Group by a key and total in euros, largest first. */
export function breakdown<T extends { amountCents: number; currency: string; date: string }>(
  items: T[],
  key: (i: T) => string,
  rates: Rates
): { label: string; cents: number; count: number }[] {
  const map = new Map<string, { cents: number; count: number }>();
  for (const i of items) {
    const v = inEur(i, rates);
    if (v == null) continue;
    const k = key(i);
    const cur = map.get(k) ?? { cents: 0, count: 0 };
    map.set(k, { cents: cur.cents + v, count: cur.count + 1 });
  }
  return [...map.entries()].map(([label, x]) => ({ label, ...x })).sort((a, b) => b.cents - a.cents);
}

export const SOURCE_LABEL: Record<FinanceLine["source"], string> = {
  fee: "Verified fee",
  invoice: "Paid invoice",
  recurring: "Fixed cost",
  manual: "Entered",
  payout: "Consultant share",
  commission: "University commission",
};

/**
 * THE PROFIT THE PARTNERS SHARE. Income, less only the expenses marked as
 * partner costs. Costs SnZ Ventures carries alone (office rent, internet,
 * phone: the partners work remotely and use none of it) do not lower it.
 */
export function partnerTotals(lines: FinanceLine[], rates: Rates) {
  const inc = sumEur(lines.filter((l) => l.kind === "income"), rates);
  const shared = sumEur(lines.filter((l) => l.kind === "expense" && l.partnerCost), rates);
  const own = sumEur(lines.filter((l) => l.kind === "expense" && !l.partnerCost), rates);
  return {
    income: inc.cents,
    sharedCost: shared.cents,
    ownCost: own.cents,
    base: inc.cents - shared.cents,
    missing: [...new Set([...inc.missing, ...shared.missing, ...own.missing])],
  };
}

/** A stakeholder's part of a profit: never below zero. */
export const shareOf = (base: number, pct: number) => Math.max(0, Math.round((base * pct) / 100));
