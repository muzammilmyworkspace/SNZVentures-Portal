/**
 * WHAT AN INVOICE IS, WITH NO DATABASE AND NO REQUEST.
 * ---------------------------------------------------------------------------
 * Money, VAT, numbering and validation, kept apart from the routes so they can
 * be exercised by `npm run verify:invoices`. Every one of them is a thing that
 * goes wrong quietly: a float total that is a cent away from its own lines, a
 * number issued twice, an amount read as a hundred times what was typed.
 *
 * An invoice is a document somebody is asked to pay from. Being approximately
 * right is not a category that exists here.
 */

export const CURRENCIES = {
  EUR: { symbol: "€", name: "Euro" },
  PKR: { symbol: "Rs ", name: "Pakistani rupee" },
  USD: { symbol: "$", name: "US dollar" },
  GBP: { symbol: "£", name: "Pound sterling" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;
export const isCurrency = (v: unknown): v is CurrencyCode =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(CURRENCIES, v);

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "void"];

/** A status other than draft means the document has left the building. */
export const isIssued = (s: InvoiceStatus) => s !== "draft";

export type Line = { desc: string; amountCents: number };

/**
 * Reads a typed amount into minor units.
 *
 * Accepts what people actually paste: "500", "1,250.50", "€500", " 500.5 ".
 * REFUSES more than two decimal places rather than rounding, because somebody
 * typing 200.555 has made a mistake and rounding it to 200.56 hides the
 * mistake on a document they are about to send.
 *
 * A bare comma is refused unless it is unambiguous — "1,50" is one-fifty in
 * Vilnius and fifteen hundred in Lahore, and reading it the wrong way is a
 * hundredfold error on an invoice.
 */
export function parseAmount(input: string): number | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (!s) return null;

  s = s.replace(/[€$£\s ]/g, "").replace(/^Rs/i, "");
  if (s.startsWith("-")) return null; // an invoice line is never negative

  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (s.includes(",")) return null;

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  const [whole, fraction = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** "1234.56" — no symbol, no separators. For inputs and machine reading. */
export function toDecimal(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** "€1,234.56" — for the document and the list. */
export function formatMoney(cents: number, currency: CurrencyCode): string {
  const { symbol } = CURRENCIES[currency] ?? CURRENCIES.EUR;
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < 0 ? "-" : ""}${symbol}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** A percentage as typed ("21", "17.5") into basis points, or null. */
export function parseVatPercent(input: string): number | null {
  const s = String(input ?? "").trim().replace("%", "").replace(",", ".");
  if (!s) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const bp = Math.round(Number(s) * 100);
  return bp >= 0 && bp <= 10_000 ? bp : null;
}

/**
 * VAT on the whole subtotal, rounded once.
 *
 * Deliberately NOT per line. Rounding each line and adding them gives a figure
 * that can differ by a cent or two from the tax on the total — and then the
 * invoice's own numbers disagree with each other in front of the customer.
 */
export const vatOn = (subtotalCents: number, vatBp: number) =>
  Math.round((subtotalCents * vatBp) / 10_000);

export type Totals = { subtotalCents: number; vatCents: number; totalCents: number };

export function totalsFor(lines: readonly Line[], vatBp: number): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  const vatCents = vatOn(subtotalCents, vatBp);
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}

/* ------------------------------------------------------------ numbering --- */

export const NUMBER_PATTERN = /^SNZ-(\d{4})-(\d{3,})$/;

/**
 * The next number, worked out from the ones that already exist.
 *
 * Read off the table rather than kept as a counter, so a gap — or a number
 * somebody set by hand — cannot make the next invoice collide with one already
 * sent. Two documents claiming to be SNZ-2026-004 is the failure this exists
 * to prevent, and the unique index behind it is what makes the guarantee real
 * when two people press Save at the same moment.
 */
export function nextNumber(year: number, existing: readonly string[]): string {
  let highest = 0;
  for (const number of existing) {
    const m = NUMBER_PATTERN.exec(number);
    if (m && Number(m[1]) === year) highest = Math.max(highest, Number(m[2]));
  }
  return `SNZ-${year}-${String(highest + 1).padStart(3, "0")}`;
}

/* ------------------------------------------------------------ validating --- */

export type DraftInput = {
  billToName: string;
  billToEmail: string;
  billToAddress: string;
  currency: string;
  vatPercent: string;
  issuedOn: string;
  dueOn: string;
  notes: string;
  lines: { desc: string; amount: string }[];
};

export type Validated = {
  billToName: string;
  billToEmail: string | null;
  billToAddress: string | null;
  currency: CurrencyCode;
  vatBp: number;
  issuedOn: string;
  dueOn: string | null;
  notes: string | null;
  lines: Line[];
} & Totals;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Turns what a person typed into something that can be stored, or says what is
 * wrong with it — every problem at once, not the first one.
 *
 * One form, one list of corrections. Returning only the first means somebody
 * fixes the name, presses save, and is then told about the amount.
 */
export function validateDraft(input: DraftInput): { ok: true; value: Validated } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const billToName = (input.billToName ?? "").trim();
  if (!billToName) errors.push("The invoice needs a name to go to.");
  if (billToName.length > 160) errors.push("That name is too long for an invoice.");

  const email = (input.billToEmail ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(`“${email}” does not look like an email address.`);
  }

  if (!isCurrency(input.currency)) errors.push("Choose a currency.");

  const vatBp = parseVatPercent(input.vatPercent ?? "0");
  if (vatBp === null) errors.push("VAT must be a percentage between 0 and 100, e.g. 21 or 17.5.");

  if (!isDate(input.issuedOn ?? "")) errors.push("The invoice needs a date.");
  const dueOn = (input.dueOn ?? "").trim();
  if (dueOn && !isDate(dueOn)) errors.push("The due date is not a valid date.");
  if (dueOn && isDate(input.issuedOn ?? "") && dueOn < input.issuedOn) {
    // Not fatal anywhere else, but an invoice due before it was issued is the
    // sort of thing a customer replies about instead of paying.
    errors.push("The due date is before the invoice date.");
  }

  const lines: Line[] = [];
  (input.lines ?? []).forEach((raw, i) => {
    const desc = (raw.desc ?? "").trim();
    const amount = (raw.amount ?? "").trim();
    if (!desc && !amount) return; // a blank row is simply not a line

    const cents = parseAmount(amount);
    if (cents === null) {
      errors.push(
        `Line ${i + 1}: “${amount || "(blank)"}” is not an amount. Use 500 or 500.50 — ` +
          "more than two decimal places is refused rather than rounded."
      );
      return;
    }
    if (cents <= 0) {
      errors.push(`Line ${i + 1}: an invoice line must be more than zero.`);
      return;
    }
    lines.push({ desc: desc || "Consultancy fee", amountCents: cents });
  });

  if (!lines.length) errors.push("An invoice needs at least one line with an amount.");
  if (lines.length > 40) errors.push("That is more lines than an invoice should carry.");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      billToName,
      billToEmail: email || null,
      billToAddress: (input.billToAddress ?? "").trim() || null,
      currency: input.currency as CurrencyCode,
      vatBp: vatBp as number,
      issuedOn: input.issuedOn,
      dueOn: dueOn || null,
      notes: (input.notes ?? "").trim() || null,
      lines,
      ...totalsFor(lines, vatBp as number),
    },
  };
}
