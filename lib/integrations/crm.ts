import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, safeQuery, isDatabaseConfigured } from "@/lib/db/client";
import { memberId } from "@/lib/portal/member-id";

/*
 * THE LINK WITH THE SALES CRM (crm.admitsfair.com).
 *
 * Both apps share one secret, CRM_PORTAL_SECRET, set on both Vercel projects.
 * Every request carries X-AF-Timestamp (ms) and X-AF-Signature, an HMAC-SHA256
 * of "<timestamp>.<raw body>". Older than five minutes is refused, so a
 * captured request cannot be replayed. The CRM side is src/server/portal.ts.
 *
 *   CRM -> portal  POST /api/integrations/crm      agent.upsert, student.invite
 *   portal -> CRM  POST {CRM_URL}/api/integrations/portal
 *                  student.registered, fee.submitted, sale.verified
 *
 * Calls to the CRM are best effort: a CRM outage must never stop a student
 * registering or a fee being verified. A verified fee that could not be told
 * to the CRM keeps fee_submissions.crm_synced_at NULL, so it can be re-sent.
 */

const CRM_URL = (process.env.CRM_URL || "https://crm.admitsfair.com").replace(/\/+$/, "");
const MAX_SKEW_MS = 5 * 60 * 1000;

export const crmConfigured = () => !!process.env.CRM_PORTAL_SECRET;

const sign = (secret: string, ts: string, body: string) =>
  createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

/** Checks a request from the CRM; returns the parsed body or null. */
export async function verifyCrmRequest(req: Request): Promise<Record<string, unknown> | null> {
  const secret = process.env.CRM_PORTAL_SECRET;
  if (!secret) return null;
  const ts = req.headers.get("x-af-timestamp") ?? "";
  const given = req.headers.get("x-af-signature") ?? "";
  if (!/^\d{10,16}$/.test(ts) || Math.abs(Date.now() - Number(ts)) > MAX_SKEW_MS) return null;
  if (!/^[a-f0-9]{64}$/.test(given)) return null;
  const body = await req.text();
  const want = Buffer.from(sign(secret, ts, body), "hex");
  if (!timingSafeEqual(want, Buffer.from(given, "hex"))) return null;
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function postToCrm(payload: Record<string, unknown>): Promise<boolean> {
  const secret = process.env.CRM_PORTAL_SECRET;
  if (!secret) return false;
  const body = JSON.stringify(payload);
  const ts = String(Date.now());
  try {
    const res = await fetch(`${CRM_URL}/api/integrations/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AF-Timestamp": ts, "X-AF-Signature": sign(secret, ts, body) },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) console.error(`[crm] ${String(payload.type)} answered ${res.status}: ${await res.text().catch(() => "")}`);
    return res.ok;
  } catch (error) {
    console.error(`[crm] ${String(payload.type)} failed:`, error);
    return false;
  }
}

type StudentLink = {
  agentCode: string;
  leadId: string | null;
  student: { name: string; email: string; code: string };
};

/** The sales agent (by CRM code) and CRM lead behind a student, or null if none. */
async function linkFor(studentId: string): Promise<StudentLink | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT s.name, s.email, s.role::text AS role, s.member_no, a.crm_code,
        (SELECT i.crm_lead_id FROM student_invites i
          WHERE i.claimed_by = s.id AND i.consultant_id = a.id LIMIT 1) AS lead_id
        FROM users s
        JOIN users a ON a.id = s.sales_agent_id
       WHERE s.id = ${studentId} AND a.crm_code IS NOT NULL
       LIMIT 1
    `;
    if (!r) return null;
    return {
      agentCode: String(r.crm_code),
      leadId: r.lead_id ? String(r.lead_id) : null,
      student: {
        name: String(r.name),
        email: String(r.email),
        code: memberId(String(r.role), r.member_no == null ? null : Number(r.member_no)),
      },
    };
  }, null);
}

/** The student signed up (or uploaded their fee receipt) through a sales agent's link. */
export async function tellCrm(event: "student.registered" | "fee.submitted", studentId: string): Promise<void> {
  if (!crmConfigured()) return;
  const link = await linkFor(studentId);
  if (link) await postToCrm({ type: event, ...link });
}

/**
 * A verified initial-process fee from a sales agent's student: the agent's
 * sale counts in the CRM. Idempotent on the fee submission id there, so
 * sending it twice is harmless. Marks the submission synced when it worked.
 */
export async function tellCrmSaleVerified(fee: { id: string; userId: string; amount: number | string; currency: string }): Promise<boolean> {
  if (!crmConfigured()) return false;
  const link = await linkFor(fee.userId);
  if (!link) return false;
  const amount = Number(fee.amount);
  const ok = await postToCrm({
    type: "sale.verified",
    ref: fee.id,
    amount: Number.isFinite(amount) ? amount : null,
    currency: fee.currency,
    ...link,
  });
  if (ok) await safeQuery(async () => (await db()`UPDATE fee_submissions SET crm_synced_at = now() WHERE id = ${fee.id}`, true), false);
  return ok;
}

/**
 * Re-sends verified sales the CRM has not acknowledged yet (it was down, or
 * the secret was missing at the time). Recent ones only, a few per call; run
 * after each fee verification and when an agent opens their students.
 */
export async function retryUnsyncedSales(limit = 5): Promise<void> {
  if (!crmConfigured() || !isDatabaseConfigured()) return;
  const pending = await safeQuery(
    async () =>
      (await db()`
        SELECT f.id, f.user_id, f.amount, f.currency
          FROM fee_submissions f
          JOIN users s ON s.id = f.user_id
         WHERE f.status = 'verified' AND f.crm_synced_at IS NULL
           AND s.sales_agent_id IS NOT NULL
           AND f.reviewed_at > now() - interval '60 days'
         ORDER BY f.reviewed_at ASC
         LIMIT ${limit}
      `).map((r) => ({ id: String(r.id), userId: String(r.user_id), amount: String(r.amount), currency: String(r.currency) })),
    [] as { id: string; userId: string; amount: string; currency: string }[],
  );
  for (const fee of pending) await tellCrmSaleVerified(fee);
}
