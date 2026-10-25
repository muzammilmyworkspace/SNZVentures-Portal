import { db, safeQuery, isDatabaseConfigured } from "../client";
import {
  PAYMENT_TERMS_VERSION,
  paymentSettingsFrom,
  scheduleFor,
  type PaymentSettings,
  type Phase,
  type PlanKey,
} from "@/lib/portal/payment-plan";

/* The process-fee settings (047 portal_settings "payments") and each student's chosen plan (047 payment_plans). */

const KEY = "payments";

export async function getPaymentSettings(): Promise<PaymentSettings> {
  if (!isDatabaseConfigured()) return paymentSettingsFrom(null);
  return safeQuery(async () => {
    const [r] = await db()`SELECT value FROM portal_settings WHERE key = ${KEY}`;
    return paymentSettingsFrom(r?.value ?? null);
  }, paymentSettingsFrom(null));
}

export async function savePaymentSettings(value: PaymentSettings, by: string): Promise<void> {
  const clean = paymentSettingsFrom(value);
  await db()`
    INSERT INTO portal_settings (key, value, updated_by, updated_at)
    VALUES (${KEY}, ${db().json(clean)}, ${by}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
}

export type StudentPlan = {
  plan: PlanKey;
  schedule: Phase[];
  currency: string;
  termsAcceptedAt: string;
};

export async function planFor(userId: string): Promise<StudentPlan | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`SELECT plan, schedule, currency, terms_accepted_at FROM payment_plans WHERE user_id = ${userId}`;
    if (!r) return null;
    return {
      plan: r.plan as PlanKey,
      schedule: (r.schedule ?? []) as Phase[],
      currency: String(r.currency),
      termsAcceptedAt: new Date(String(r.terms_accepted_at)).toISOString(),
    };
  }, null);
}

/**
 * Records the student's plan and their acceptance of the payment terms, with
 * the amounts frozen as they were when they agreed. Changing plan is allowed
 * until the initial fee is verified.
 */
export async function choosePlan(
  userId: string,
  plan: PlanKey,
  ip: string | null,
  termsVersion: string = PAYMENT_TERMS_VERSION,
  userAgent: string | null = null,
): Promise<StudentPlan | null> {
  const settings = await getPaymentSettings();
  const schedule = scheduleFor(plan, settings);
  const [r] = await db()`
    INSERT INTO payment_plans (user_id, plan, schedule, currency, terms_version, terms_accepted_at, ip, user_agent)
    SELECT ${userId}, ${plan}, ${db().json(schedule)}, ${settings.currency}, ${termsVersion}, now(), ${ip}, ${userAgent}
     WHERE NOT EXISTS (SELECT 1 FROM fee_submissions WHERE user_id = ${userId} AND status = 'verified')
    ON CONFLICT (user_id) DO UPDATE
      SET plan = EXCLUDED.plan, schedule = EXCLUDED.schedule, currency = EXCLUDED.currency,
          terms_version = EXCLUDED.terms_version, terms_accepted_at = now(), ip = EXCLUDED.ip,
          user_agent = EXCLUDED.user_agent, updated_at = now()
    RETURNING plan, schedule, currency, terms_accepted_at
  `;
  if (!r) return null;
  return {
    plan: r.plan as PlanKey,
    schedule: r.schedule as Phase[],
    currency: String(r.currency),
    termsAcceptedAt: new Date(String(r.terms_accepted_at)).toISOString(),
  };
}
