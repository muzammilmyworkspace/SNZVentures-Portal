import "server-only";
import {
  materializeRecurring,
  materializePayouts,
  linesBetween,
  allRates,
  inEur,
  listPayouts,
  listCommissions,
  listRecurring,
  listStakeholders,
  listDistributions,
} from "@/lib/db/repos/finance";
import { buildXlsx, type Sheet } from "@/lib/xlsx";
import { totals, partnerTotals, shareOf, SOURCE_LABEL, lastDay, monthName } from "@/lib/portal/finance-view";
import { rangeText } from "@/lib/portal/finance-range";

/**
 * THE ACCOUNTANT'S WORKBOOK for any two dates (a month, a year, a custom range): one Excel file
 * with a sheet each for the summary, every transaction, month by month with
 * each stakeholder's share, consultant shares, university commissions and
 * fixed costs.
 */
export async function financeWorkbook(from: string, to: string): Promise<Buffer> {
  await materializeRecurring();
  await materializePayouts();
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const [lines, rates, payouts, commissions, recurring, holders, dists] = await Promise.all([
    linesBetween(from, to),
    allRates(),
    listPayouts(),
    listCommissions(),
    listRecurring(),
    listStakeholders(),
    listDistributions(fromMonth, toMonth),
  ]);
  const eur = (c: number | null) => (c == null ? null : c / 100);
  const months: string[] = [];
  for (let m = fromMonth; m <= toMonth; ) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  }
  const t = totals(lines, rates);
  const pt = partnerTotals(lines, rates);
  const inPeriod = (d: string | null) => !!d && d >= from && d <= to;
  const active = holders.filter((h) => h.active);

  const summary: Sheet = {
    name: "Summary",
    widths: [34, 18],
    money: [1],
    rows: [
      ["SnZ Ventures — finance", from === `${fromMonth}-01` && to === lastDay(toMonth) && fromMonth === toMonth ? monthName(fromMonth) : rangeText(from, to)],
      ["Earned (EUR)", eur(t.income)],
      ["Spent (EUR)", eur(t.expense)],
      [t.profit >= 0 ? "Profit (EUR)" : "Loss (EUR)", eur(t.profit)],
      ["Expenses still due (EUR)", eur(t.due)],
      ["Owed to consultants now (EUR)", eur(payouts.filter((p) => p.status === "owed").reduce((n, p) => n + (inEur({ ...p, date: p.createdOn }, rates) ?? 0), 0))],
      ["Expected from universities now (EUR)", eur(commissions.filter((c) => c.status === "expected").reduce((n, c) => n + (inEur({ ...c, date: c.expectedOn ?? from }, rates) ?? 0), 0))],
      [],
      ["Profit share", "EUR"],
      ["Profit the partners share (EUR)", eur(pt.base)],
      ["Costs SnZ Ventures carries alone (EUR)", eur(pt.ownCost)],
      ...active.map((h) => [`${h.name} (${h.sharePct}%)`, eur(shareOf(pt.base, h.sharePct))] as (string | number | null)[]),
      ...(t.missing.length ? [[], [`Not in the euro totals (no exchange rate set): ${t.missing.join(", ")}`]] : []),
    ],
  };

  const transactions: Sheet = {
    name: "Transactions",
    widths: [12, 10, 22, 26, 40, 14, 9, 14, 8, 20, 9],
    money: [5, 7],
    rows: [
      ["Date", "Type", "Category", "From / to", "What for", "Amount", "Currency", "Amount (EUR)", "Status", "Source", "Receipt"],
      ...[...lines]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((l) => [
          l.date,
          l.kind === "income" ? "Income" : "Expense",
          l.category,
          l.party ?? "",
          l.description,
          l.amountCents / 100,
          l.currency,
          eur(inEur(l, rates)),
          l.status === "due" ? "Due" : "Paid",
          SOURCE_LABEL[l.source],
          l.receiptHref ? "Yes" : "",
        ]),
    ],
  };

  const monthly: Sheet = {
    name: "Month by month",
    widths: [18, 14, 14, 14, ...active.flatMap(() => [18, 14])],
    money: [1, 2, 3, ...active.flatMap((_, i) => [4 + i * 2, 5 + i * 2])],
    rows: [
      ["Month", "Earned (EUR)", "Spent (EUR)", "Profit (EUR)", ...active.flatMap((h) => [`${h.name} share (EUR)`, `${h.name} paid (EUR)`])],
      ...months.map((m) => {
        const ml = lines.filter((l) => l.date.startsWith(m));
        const x = totals(ml, rates);
        const base = partnerTotals(ml, rates).base;
        return [
          monthName(m),
          eur(x.income),
          eur(x.expense),
          eur(x.profit),
          ...active.flatMap((h) => {
            const paid = dists.find((d) => d.stakeholderId === h.id && d.month === m);
            return [eur(shareOf(base, h.sharePct)), paid ? eur(paid.amountCents) : null];
          }),
        ];
      }),
    ],
  };

  const consultants: Sheet = {
    name: "Consultant shares",
    widths: [12, 24, 24, 40, 12, 9, 8, 12],
    money: [4],
    rows: [
      ["Date", "Consultant", "Student", "What for", "Amount", "Currency", "Status", "Paid on"],
      ...payouts
        .filter((p) => inPeriod(p.createdOn) || inPeriod(p.paidOn) || p.status === "owed")
        .map((p) => [p.createdOn, p.consultantName, p.studentName ?? "", p.description, p.amountCents / 100, p.currency, p.status === "paid" ? "Paid" : "Owed", p.paidOn ?? ""]),
    ],
  };

  const universities: Sheet = {
    name: "University commissions",
    widths: [26, 24, 12, 12, 12, 9, 10, 12],
    money: [4],
    rows: [
      ["University", "Student", "Intake", "Expected by", "Amount", "Currency", "Status", "Received on"],
      ...commissions
        .filter((c) => c.status === "expected" || inPeriod(c.receivedOn))
        .map((c) => [c.university, c.studentName, c.intake ?? "", c.expectedOn ?? "", c.amountCents / 100, c.currency, c.status === "received" ? "Received" : "Expected", c.receivedOn ?? ""]),
    ],
  };

  const fixed: Sheet = {
    name: "Fixed costs",
    widths: [26, 22, 12, 9, 8, 14, 10],
    money: [2],
    rows: [
      ["Name", "Category", "Every month", "Currency", "Day", "Paid", "Running"],
      ...recurring.map((r) => [r.name, r.category, r.amountCents / 100, r.currency, r.dayOfMonth, r.autoPaid ? "Automatically" : "By hand", r.active ? "Yes" : "Stopped"]),
    ],
  };

  return buildXlsx([summary, transactions, monthly, consultants, universities, fixed]);
}
