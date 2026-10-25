import { randomBytes } from "node:crypto";
import { notify } from "./portal";
import { db, safeQuery, isDatabaseConfigured } from "../client";
import * as usersRepo from "./users";
import { hashPassword } from "@/lib/auth/password";
import { memberId } from "@/lib/portal/member-id";

/*
 * SALES AGENTS (migration 047) and the students they bring.
 *
 * A sales agent's account is created from the CRM (crm.admitsfair.com) with
 * the agent's CRM ID in users.crm_code. Their students carry
 * users.sales_agent_id. Every query here is scoped to ONE agent: an agent
 * never sees another agent's students or anybody else in the portal.
 */

export type SalesAgent = { id: string; name: string; email: string; crmCode: string; status: string };

export async function agentByCrmCode(code: string): Promise<SalesAgent | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT id, name, email, crm_code, status::text AS status FROM users
       WHERE upper(crm_code) = ${code.trim().toUpperCase()} AND role = 'sales'
       LIMIT 1
    `;
    return r ? { id: String(r.id), name: String(r.name), email: String(r.email), crmCode: String(r.crm_code), status: String(r.status) } : null;
  }, null);
}

export type UpsertAgent =
  | { ok: true; agent: SalesAgent; created: boolean }
  | { ok: false; error: string };

/**
 * Creates the agent's login, or refreshes the name on an existing one. The
 * password is random and unusable: the agent sets their own from the
 * account_setup link the caller emails.
 */
export async function upsertSalesAgent(input: { code: string; name: string; email: string }): Promise<UpsertAgent> {
  const code = input.code.trim().toUpperCase();
  const existing = await agentByCrmCode(code);
  if (existing) {
    await db()`UPDATE users SET name = ${input.name.trim()}, updated_at = now() WHERE id = ${existing.id}`;
    return { ok: true, agent: { ...existing, name: input.name.trim() }, created: false };
  }

  const byEmail = await usersRepo.findByEmail(input.email);
  if (byEmail) {
    if (byEmail.role !== "sales") {
      return { ok: false, error: `${input.email} already has a portal account of another kind. Use a different email for this agent.` };
    }
    // A sales login that lost its code (or changed code in the CRM): adopt it.
    await db()`UPDATE users SET crm_code = ${code}, name = ${input.name.trim()}, updated_at = now() WHERE id = ${byEmail.id}`;
    return { ok: true, agent: { id: byEmail.id, name: input.name.trim(), email: byEmail.email, crmCode: code, status: byEmail.status }, created: false };
  }

  const user = await usersRepo.createUser({
    email: input.email,
    name: input.name,
    role: "sales",
    passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
  });
  await db()`UPDATE users SET crm_code = ${code}, email_verified = TRUE, updated_at = now() WHERE id = ${user.id}`;
  return { ok: true, agent: { id: user.id, name: user.name, email: user.email, crmCode: code, status: user.status }, created: true };
}

export type SalesStudentStage =
  | "registered"
  | "fee_submitted"
  | "fee_rejected"
  | "fee_verified"
  | "application_submitted";

export type SalesStudent = {
  id: string;
  name: string;
  email: string;
  code: string;
  joinedAt: string;
  plan: string | null;
  stage: SalesStudentStage;
  feeAmount: string | null;
  handedOverAt: string | null;
  /** The four checkpoints the agent follows, each with its own state. */
  fee: "none" | "submitted" | "verified" | "rejected";
  application: "none" | "draft" | "submitted";
  consent: boolean;
};

export type PendingInvite = { id: string; name: string | null; email: string | null; createdAt: string; expiresAt: string };

/** The agent's students and their unclaimed invite links, in one query. */
export async function studentsOf(agentId: string): Promise<{ students: SalesStudent[]; invites: PendingInvite[] }> {
  const empty = { students: [], invites: [] };
  if (!isDatabaseConfigured()) return empty;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT
        COALESCE((SELECT json_agg(x ORDER BY x.created_at DESC) FROM (
          SELECT s.id, s.name, s.email, s.role::text AS role, s.member_no, s.created_at, s.sales_handover_at,
            (SELECT p.plan FROM payment_plans p WHERE p.user_id = s.id) AS plan,
            (SELECT f.status::text FROM fee_submissions f WHERE f.user_id = s.id
              ORDER BY (f.status IN ('submitted','verified')) DESC, f.created_at DESC LIMIT 1) AS fee_status,
            (SELECT f.currency || ' ' || f.amount::text FROM fee_submissions f WHERE f.user_id = s.id AND f.status = 'verified'
              ORDER BY f.reviewed_at DESC NULLS LAST LIMIT 1) AS fee_amount,
            (SELECT i.status::text FROM intake_forms i WHERE i.user_id = s.id AND i.pathway = 'study' LIMIT 1) AS intake,
            EXISTS (SELECT 1 FROM consents c WHERE c.user_id = s.id
              AND c.kind IN ('student_undertaking', 'consultant_student')) AS consent
          FROM users s
          WHERE s.sales_agent_id = ${agentId}
        ) x), '[]'::json) AS students,
        COALESCE((SELECT json_agg(y ORDER BY y.created_at DESC) FROM (
          SELECT id, name, email, created_at, expires_at FROM student_invites
           WHERE consultant_id = ${agentId} AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
             -- A student who already signed up (with any of their links) is not "waiting".
             AND (email IS NULL OR lower(email) NOT IN (SELECT lower(u.email) FROM users u WHERE u.sales_agent_id = ${agentId}))
        ) y), '[]'::json) AS invites
    `;
    const students = ((r?.students ?? []) as Record<string, unknown>[]).map((s) => {
      const fee = s.fee_status as string | null;
      const intake = s.intake as string | null;
      const stage: SalesStudentStage =
        fee === "verified"
          ? intake && intake !== "draft" && intake !== "returned"
            ? "application_submitted"
            : "fee_verified"
          : fee === "submitted"
            ? "fee_submitted"
            : fee === "rejected"
              ? "fee_rejected"
              : "registered";
      return {
        id: String(s.id),
        name: String(s.name),
        email: String(s.email),
        code: memberId(String(s.role), s.member_no == null ? null : Number(s.member_no)),
        joinedAt: new Date(String(s.created_at)).toISOString(),
        plan: s.plan ? String(s.plan) : null,
        stage,
        feeAmount: s.fee_amount ? String(s.fee_amount) : null,
        handedOverAt: s.sales_handover_at ? new Date(String(s.sales_handover_at)).toISOString() : null,
        fee: (fee === "submitted" || fee === "verified" || fee === "rejected" ? fee : "none") as SalesStudent["fee"],
        application: (!intake ? "none" : intake === "draft" || intake === "returned" ? "draft" : "submitted") as SalesStudent["application"],
        consent: Boolean(s.consent),
      };
    });
    const invites = ((r?.invites ?? []) as Record<string, unknown>[]).map((i) => ({
      id: String(i.id),
      name: i.name ? String(i.name) : null,
      email: i.email ? String(i.email) : null,
      createdAt: new Date(String(i.created_at)).toISOString(),
      expiresAt: new Date(String(i.expires_at)).toISOString(),
    }));
    return { students, invites };
  }, empty);
}

/**
 * "Push to Super Admin": the agent hands the case over once the initial fee
 * is verified. Only their own student, only once. Returns the student's name,
 * or null when the hand-over is not allowed.
 */
export async function handOver(agentId: string, studentId: string): Promise<{ name: string; code: string } | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`
      UPDATE users s SET sales_handover_at = now(), updated_at = now()
       WHERE s.id = ${studentId}
         AND s.sales_agent_id = ${agentId}
         AND s.sales_handover_at IS NULL
         AND EXISTS (SELECT 1 FROM fee_submissions f WHERE f.user_id = s.id AND f.status = 'verified')
      RETURNING s.name, s.role::text AS role, s.member_no
    `;
    return r ? { name: String(r.name), code: memberId(String(r.role), r.member_no == null ? null : Number(r.member_no)) } : null;
  }, null);
}

/** Who brought a student, for staff screens: "Ali Raza (AF-001)", or null. */
export async function salesAgentLabel(studentId: string): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT a.name, a.crm_code FROM users s JOIN users a ON a.id = s.sales_agent_id WHERE s.id = ${studentId} LIMIT 1
    `;
    return r ? `${String(r.name)}${r.crm_code ? ` (${String(r.crm_code)})` : ""}` : null;
  }, null);
}

/** A fresh link replaces the agent's older unused links to the same address, so only one works. */
export async function revokeOlderInvites(agentId: string, email: string): Promise<void> {
  await safeQuery(async () => {
    await db()`
      UPDATE student_invites SET revoked_at = now()
       WHERE consultant_id = ${agentId} AND lower(email) = ${email.toLowerCase()}
         AND claimed_at IS NULL AND revoked_at IS NULL
    `;
  }, undefined);
}

/**
 * Tells a student's sales agent, in their portal bell, that something moved:
 * signed up, receipt sent, fee verified or returned, application submitted.
 * The agent follows progress only; they never see the application itself.
 * Best effort and silent for a student who came without an agent.
 */
export async function notifySalesAgent(studentId: string, what: (studentName: string) => string): Promise<void> {
  await safeQuery(async () => {
    const [r] = await db()`
      SELECT s.name, s.sales_agent_id FROM users s
       WHERE s.id = ${studentId} AND s.sales_agent_id IS NOT NULL
    `;
    if (!r) return false;
    await notify({ userId: String(r.sales_agent_id), kind: "status", title: what(String(r.name)), href: "/portal/sales" });
    return true;
  }, false);
}
