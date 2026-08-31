/**
 * FORM A — PAYMENT AUTHORIZATION & DECLARATION
 * ---------------------------------------------------------------------------
 * The wording is SnZ Ventures' own, transcribed from the signed paper form.
 * Nothing has been added: no promise about admission, no success rate, no
 * claim about outcomes. The clauses say what the paper says.
 *
 * VERSIONED, for the same reason the student undertaking is. A consent record
 * is only worth something if you can say WHAT was agreed to. If this text is
 * revised, `PAYMENT_CONSENT_VERSION` moves with it, and rows already written
 * keep pointing at the words those people actually read. A table storing a
 * bare `true` against wording that has since changed proves nothing.
 *
 * The clauses take the student's own figures because the declaration is a
 * declaration: the amount on it is the amount they typed, and we pre-fill
 * none of it.
 */

export const PAYMENT_CONSENT_VERSION = "2026-08-payment-v1";
export const PAYMENT_CONSENT_KIND = "payment_authorization";
export const PAYMENT_CONSENT_TITLE = "Payment Authorization & Declaration";

export type PaymentDeclarationFacts = {
  name: string;
  passport: string;
  nationality: string;
  city: string;
  university: string;
  programme?: string | null;
  feeType: string;
  amountLabel: string;
  method: string;
  payDate?: string | null;
  thirdParty: boolean;
  payerName?: string | null;
  payerRelation?: string | null;
};

/**
 * The numbered undertakings. Fixed text — these do not vary by student, which
 * is why they are a constant rather than built from the facts above.
 */
export const PAYMENT_CLAUSES: string[] = [
  "I have voluntarily transferred the above amount to MB SnZ Ventures solely for the purpose of paying the institution fee named above.",
  "MB SnZ Ventures is authorised to make this payment on my behalf and to identify me to the institution as the applicant it relates to.",
  "The fee is charged by the institution and is subject to that institution's own refund and admission policies, not to any policy of MB SnZ Ventures.",
  "Once MB SnZ Ventures has transferred the fee to the institution, the payment is considered completed on my behalf and MB SnZ Ventures has discharged its obligation in respect of it.",
  "MB SnZ Ventures gives no assurance as to the outcome of my application, and this authorisation is not connected to any admission decision.",
  "I sign this declaration willingly, in full understanding of its contents, and without any coercion.",
];

/**
 * The body paragraphs, with the student's own answers written into them.
 *
 * Returned as plain strings rather than markup so the same text can be shown
 * on screen, put in an email and printed without three copies drifting apart.
 */
export function paymentDeclarationBody(f: PaymentDeclarationFacts): string[] {
  const out: string[] = [];

  /*
    The opening sentence names the signatory the way the paper form does —
    passport, nationality and residence. A declaration that does not identify
    who is declaring is not one, and these are the three identifiers an
    institution matches a transfer against.
  */
  out.push(
    `I, ${f.name}, holder of passport ${f.passport}, a national of ${f.nationality} residing at ${f.city}, confirm that I have applied for admission to ${f.university}` +
      (f.programme ? ` for the programme ${f.programme}` : "") +
      "."
  );

  out.push(
    `I understand that the ${f.feeType.toLowerCase()} required by the institution is below the minimum amount accepted for international bank transfers, and that the institution does not provide an online card payment link or an alternative online payment method. It is therefore not practical for me to transfer the fee directly to the institution myself.`
  );

  if (f.thirdParty && f.payerName) {
    out.push(
      `Because of this, the transfer is being made on my behalf by ${f.payerName}` +
        (f.payerRelation ? ` (${f.payerRelation})` : "") +
        ", with my knowledge and at my request. I confirm that any funds sent by that person for this purpose are sent for me, and I accept full responsibility for them."
    );
  }

  out.push(
    `I hereby authorise MB SnZ Ventures, acting as my educational consultant, to collect the sum of ${f.amountLabel} from me and to transfer that payment to ${f.university} on my behalf` +
      (f.payDate ? `, in respect of a transfer made on ${f.payDate}` : "") +
      `. The payment is being sent by ${f.method.toLowerCase()}.`
  );

  return out;
}

/** Fee purposes, exactly as the paper form lists them. */
export const FEE_TYPES = [
  // The upfront payment that starts the file. It is the first thing most
  // students pay, so it leads the list rather than sitting beneath options
  // that only become relevant later in the process.
  "Process initiation fee",
  "University application fee",
  "Tuition deposit / first instalment",
  "Registration fee",
  "Document / verification fee",
  "Consultancy service fee",
] as const;

export const PAYMENT_METHODS = [
  "Bank transfer",
  "Wise / Revolut",
  "Western Union / MoneyGram",
  "Cash deposit",
  "Card payment",
  "Other",
] as const;

export const CURRENCIES = ["EUR", "USD", "GBP", "PKR", "AED", "INR"] as const;

/* ────────────────────────────────────────────────────── field validation ─ */

/**
 * ONE SET OF RULES, used by the dialog AND by the API.
 *
 * These were written twice — once in the browser to show a message, once on
 * the server to make the decision — and two copies of a rule are two rules
 * that drift. Exported so the check that shows the error and the check that
 * refuses the request are physically the same function.
 */

/**
 * Passport numbers: 6–12 characters, letters and digits only.
 *
 * There is no single global format. ICAO 9303 fixes the machine-readable zone
 * at nine characters but leaves each state to decide what goes in it, and
 * several issue shorter or longer human-readable numbers. So this rejects what
 * is certainly wrong — a two-character typo, a pasted sentence, spaces and
 * punctuation — without pretending to know every scheme. A stricter rule would
 * reject real passports, which is the worse failure: it stops a genuine
 * applicant with no way around it.
 */
export function passportError(value: string): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return "Enter your passport number.";
  if (!/^[A-Z0-9]+$/.test(v))
    return "A passport number is letters and digits only — no spaces or dashes.";
  if (v.length < 6) return "That looks too short for a passport number.";
  if (v.length > 12) return "That looks too long for a passport number.";
  return null;
}

/**
 * A date of birth that is a real date, in a plausible year.
 *
 * A five-digit year gets through a shape check. `<input type="date">` does not
 * cap what you type into its year box, so 20255 and 202555 both arrive as
 * well-formed values, and a regex that only counts digit groups waves them
 * past. The RANGE check below is what actually catches it.
 *
 * The round-trip comparison catches the other class of fake date: 2026-02-30
 * parses, and Date silently rolls it forward to 2 March. Re-serialising and
 * comparing is the only way to notice.
 */
export function dobError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your date of birth.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Enter a valid date of birth.";

  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "That is not a real date.";
  if (d.toISOString().slice(0, 10) !== v) return "That is not a real date.";

  const years = (Date.now() - d.getTime()) / 31_557_600_000;
  if (years < 16) return "Please check that date — it makes you under 16.";
  if (years > 100) return "Please check that date.";
  return null;
}

/**
 * Bounds for the picker itself, so the browser refuses an impossible year
 * before anyone has to be told about it. The validator above still runs —
 * `min`/`max` are a convenience, and a form post never has to honour them.
 */
export const DOB_MIN = new Date(Date.now() - 100 * 31_557_600_000)
  .toISOString()
  .slice(0, 10);
export const DOB_MAX = new Date(Date.now() - 16 * 31_557_600_000)
  .toISOString()
  .slice(0, 10);

/** `EUR 150.00` — one formatter, used by the screen, the record and the email. */
export function formatAmount(amount: string | number, currency: string): string {
  const n = typeof amount === "number" ? amount : parseFloat(String(amount).replace(/,/g, ""));
  if (!isFinite(n)) return "";
  return `${currency} ${n.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
