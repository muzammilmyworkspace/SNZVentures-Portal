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

  out.push(
    `I, ${f.name}, confirm that I have applied for admission to ${f.university}` +
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

/** `EUR 150.00` — one formatter, used by the screen, the record and the email. */
export function formatAmount(amount: string | number, currency: string): string {
  const n = typeof amount === "number" ? amount : parseFloat(String(amount).replace(/,/g, ""));
  if (!isFinite(n)) return "";
  return `${currency} ${n.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
