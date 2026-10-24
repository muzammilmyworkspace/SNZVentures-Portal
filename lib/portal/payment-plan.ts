/*
 * AdmitsFair's process fee: the plans a student can choose, the amounts, the
 * bank details on the voucher, and the terms they accept when choosing.
 *
 * Plain data and pure functions, no database, so the student dialog, the API
 * and the settings page all read the same rules. Amounts and bank details are
 * edited by the Super Admin (portal_settings key "payments"); DEFAULTS apply
 * until they do.
 */

export type PlanKey = "one_time" | "installments";

export type PaymentSettings = {
  currency: string;
  /** Paid first, on either plan: starts document verification and applications. */
  initialFee: number;
  /** One-time plan: the rest, paid when the offer letter arrives. */
  oneTimeOfferLetter: number;
  /** Installments plan: phase 2 at the offer letter, phase 3 at the visa application. */
  installmentOfferLetter: number;
  installmentVisa: number;
  bank: {
    accountTitle: string;
    bankName: string;
    iban: string;
    accountNumber: string;
    swift: string;
    /** Anything else the student must know, e.g. "Write your student ID as the reference". */
    note: string;
  };
};

export const PAYMENT_DEFAULTS: PaymentSettings = {
  currency: "EUR",
  initialFee: 300,
  oneTimeOfferLetter: 500,
  installmentOfferLetter: 300,
  installmentVisa: 200,
  bank: { accountTitle: "", bankName: "", iban: "", accountNumber: "", swift: "", note: "" },
};

/** Merges a stored (possibly partial or old) value over the defaults. */
export function paymentSettingsFrom(raw: unknown): PaymentSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PaymentSettings>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 300) : "");
  const b = (r.bank ?? {}) as Partial<PaymentSettings["bank"]>;
  return {
    currency: str(r.currency) || PAYMENT_DEFAULTS.currency,
    initialFee: num(r.initialFee, PAYMENT_DEFAULTS.initialFee),
    oneTimeOfferLetter: num(r.oneTimeOfferLetter, PAYMENT_DEFAULTS.oneTimeOfferLetter),
    installmentOfferLetter: num(r.installmentOfferLetter, PAYMENT_DEFAULTS.installmentOfferLetter),
    installmentVisa: num(r.installmentVisa, PAYMENT_DEFAULTS.installmentVisa),
    bank: {
      accountTitle: str(b.accountTitle),
      bankName: str(b.bankName),
      iban: str(b.iban).toUpperCase(),
      accountNumber: str(b.accountNumber),
      swift: str(b.swift).toUpperCase(),
      note: str(b.note),
    },
  };
}

export const bankReady = (s: PaymentSettings) => !!(s.bank.accountTitle && s.bank.bankName && (s.bank.iban || s.bank.accountNumber));

export type Phase = { key: "initial" | "offer_letter" | "visa"; label: string; when: string; amount: number };

/** What the student pays, phase by phase, on a plan. */
export function scheduleFor(plan: PlanKey, s: PaymentSettings): Phase[] {
  const initial: Phase = {
    key: "initial",
    label: "Initial process",
    when: "Now — document verification and university applications",
    amount: s.initialFee,
  };
  if (plan === "one_time") {
    return [initial, { key: "offer_letter", label: "Remaining fee", when: "When your offer letter arrives", amount: s.oneTimeOfferLetter }];
  }
  return [
    initial,
    { key: "offer_letter", label: "Phase 2", when: "When your offer letter arrives", amount: s.installmentOfferLetter },
    { key: "visa", label: "Phase 3", when: "When your visa application is made", amount: s.installmentVisa },
  ];
}

export const PLAN_LABEL: Record<PlanKey, string> = {
  one_time: "One-time payment",
  installments: "Installments",
};

export function money(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** The terms the student accepts before paying. Bump the version when the wording changes. */
export const PAYMENT_TERMS_VERSION = "2026-10";

export const PAYMENT_TERMS: string[] = [
  "The initial process fee starts your file: AdmitsFair verifies your documents and applies to universities on your behalf.",
  "The initial process fee is non-refundable once paid, including if a university does not offer you a place or you decide not to continue.",
  "The remaining fee (or the later phases, on installments) is due when the milestone is reached: your offer letter, and on installments your visa application.",
  "Admission decisions are made only by the universities, and visa decisions only by the embassy. AdmitsFair cannot guarantee either.",
  "You confirm that the documents and information you give us are true and your own. False documents end the process without refund.",
  "Pay only to the AdmitsFair account shown on your voucher, and upload the receipt in the portal so we can verify it.",
];
