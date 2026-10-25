import "server-only";
import { currentTemplate, listTemplates, templateVersion } from "@/lib/db/repos/consent-templates";
import { PAYMENT_TERMS, PAYMENT_TERMS_VERSION } from "./payment-plan";

/**
 * THE PAYMENT TERMS a student accepts before choosing a plan: the version the
 * super admin published under Forms → Consent forms → Payment terms, or the
 * built-in wording when none is active. Each line is one term.
 */
export type PaymentTerms = { title: string; version: string; lines: string[] };

export const PAYMENT_TERMS_TITLE = "Payment Terms";

const linesOf = (body: string) =>
  body
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

export async function activePaymentTerms(): Promise<PaymentTerms> {
  const t = await currentTemplate("payment", null);
  if (t?.body && linesOf(t.body).length) return { title: t.title, version: templateVersion(t), lines: linesOf(t.body) };
  return { title: PAYMENT_TERMS_TITLE, version: PAYMENT_TERMS_VERSION, lines: PAYMENT_TERMS };
}

/** The terms of an exact version, as the person who accepted it read them. */
export async function paymentTermsOf(version: string): Promise<PaymentTerms> {
  if (version === PAYMENT_TERMS_VERSION) return { title: PAYMENT_TERMS_TITLE, version, lines: PAYMENT_TERMS };
  const t = (await listTemplates("payment", null)).find((x) => templateVersion(x) === version);
  if (t?.body) return { title: t.title, version, lines: linesOf(t.body) };
  return { title: PAYMENT_TERMS_TITLE, version, lines: PAYMENT_TERMS };
}
