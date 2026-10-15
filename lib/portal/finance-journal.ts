import type { FinanceLine, Transfer } from "@/lib/db/repos/finance";

/**
 * EVERY MONEY EVENT AS A JOURNAL ENTRY: which account is debited and which
 * is credited, in the accountant's terms. Built from the finance lines and
 * the transfers, so the journal is a view of the same records, never a second
 * copy that could disagree with them.
 *
 *   money in (fee, invoice, other income)  Dr  bank or cash account
 *                                          Cr  Revenue: <category>
 *   expense paid                           Dr  Expense: <category>
 *                                          Cr  bank or cash account
 *   expense in process (not paid)          Dr  Expense: <category>
 *                                          Cr  Accounts payable (or long-term liabilities)
 *   reverse-charge purchase, as well       Dr  Input VAT 21%
 *                                          Cr  Output VAT 21%
 *   transfer between own accounts          Dr  receiving account
 *                                          Cr  sending account
 */

export type JournalLeg = { side: "Dr" | "Cr"; account: string; cents: number; currency: string; money: string | null };

export type JournalEntry = {
  key: string;
  ref: string;
  date: string;
  particulars: string;
  party: string | null;
  legs: JournalLeg[];
  line: FinanceLine | null;
  transfer: Transfer | null;
};

const NOT_SAID = "Bank or cash (not said)";
const PREFIX: Record<FinanceLine["source"], string> = {
  fee: "FEE",
  invoice: "INV",
  manual: "JV",
  recurring: "FX",
  payout: "REF",
  commission: "COM",
};

export const refOf = (source: string, id: string) => `${source}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

export function journalOf(lines: FinanceLine[], transfers: Transfer[]): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const l of lines) {
    const bank = l.accountName ?? NOT_SAID;
    const legs: JournalLeg[] =
      l.kind === "income"
        ? [
            { side: "Dr", account: bank, cents: l.amountCents, currency: l.currency, money: l.accountId },
            { side: "Cr", account: `Revenue: ${l.category}`, cents: l.amountCents, currency: l.currency, money: null },
          ]
        : [
            { side: "Dr", account: `Expense: ${l.category}`, cents: l.amountCents, currency: l.currency, money: null },
            l.status === "paid"
              ? { side: "Cr", account: bank, cents: l.amountCents, currency: l.currency, money: l.accountId }
              : {
                  side: "Cr",
                  account: l.liabilityTerm === "long" ? "Long-term liabilities" : "Accounts payable (in process)",
                  cents: l.amountCents,
                  currency: l.currency,
                  money: null,
                },
          ];
    if (l.vatMode === "reverse_charge" && l.vatCents > 0) {
      legs.push(
        { side: "Dr", account: "Input VAT 21% (deductible)", cents: l.vatCents, currency: l.currency, money: null },
        { side: "Cr", account: "Output VAT 21% (reverse charge)", cents: l.vatCents, currency: l.currency, money: null }
      );
    }
    out.push({ key: `${l.source}-${l.id}`, ref: refOf(PREFIX[l.source], l.id), date: l.date, particulars: l.description, party: l.party, legs, line: l, transfer: null });
  }
  for (const t of transfers) {
    out.push({
      key: `tr-${t.id}`,
      ref: refOf("TRF", t.id),
      date: t.date,
      particulars: t.note ? `Transfer · ${t.note}` : "Transfer between own accounts",
      party: null,
      legs: [
        { side: "Dr", account: t.toName, cents: t.toCents, currency: t.toCurrency, money: t.toId },
        { side: "Cr", account: t.fromName, cents: t.fromCents, currency: t.fromCurrency, money: t.fromId },
      ],
      line: null,
      transfer: t,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.ref.localeCompare(b.ref));
}
