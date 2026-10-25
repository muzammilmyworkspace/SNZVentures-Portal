import { NextResponse } from "next/server";
import { verifyCrmRequest } from "@/lib/integrations/crm";
import * as sales from "@/lib/db/repos/sales";
import * as invitesRepo from "@/lib/db/repos/invites";
import * as store from "@/lib/auth/store";
import { audit } from "@/lib/db/repos/audit";
import { emailStudentInvite, emailAgentSetup } from "@/lib/integrations/sales-mail";
import { siteUrl } from "@/lib/site-url";
import { isDatabaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * REQUESTS FROM THE SALES CRM (crm.admitsfair.com), signed with
 * CRM_PORTAL_SECRET (see lib/integrations/crm.ts). There is no session here:
 * the signature is the authentication, and without the secret every request
 * is refused.
 *
 *   agent.upsert    { code, name, email }
 *     The agent's portal login (role `sales`, users.crm_code = code). Emails a
 *     one-time link to set their password, on creation and on every request
 *     (the CRM admin pressing the button again is asking for a new link).
 *
 *   student.invite  { agentCode, leadId, name, email }
 *     A sign-up link tagged to the agent, emailed to the student. When the
 *     student signs up with it they are recorded as that agent's student.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SETUP_TTL_MINUTES = 60 * 24 * 3;
const CODE_RE = /^[A-Z]{2,4}-\d{3,5}$/;

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  // Said plainly, so whoever sees it on the CRM knows which setting to fix.
  if (!process.env.CRM_PORTAL_SECRET) {
    return bad("CRM_PORTAL_SECRET is not set on the portal. Add it in Vercel (admitsfair-portal → Settings → Environment Variables) and redeploy.", 503);
  }
  const body = await verifyCrmRequest(request);
  if (!body) return bad("The CRM and the portal have different CRM_PORTAL_SECRET values. Make them identical and redeploy both.", 401);
  if (!isDatabaseConfigured()) return bad("The portal database is not configured.", 503);

  // The CRM removed the agent from the team: their portal login ends too.
  if (body.type === "agent.remove") {
    const code = str(body.code, 20).toUpperCase();
    if (!CODE_RE.test(code)) return bad("Invalid Agent ID.");
    const suspended = await sales.suspendAgent(code);
    await audit({ action: "sales.agent_removed", actorId: null, actorEmail: "crm", entity: "user", meta: { crmCode: code, suspended } });
    return NextResponse.json({ ok: true, suspended });
  }

  if (body.type === "agent.upsert") {
    const code = str(body.code, 20).toUpperCase();
    const name = str(body.name, 120);
    const email = str(body.email, 200).toLowerCase();
    if (!CODE_RE.test(code) || name.length < 2 || !EMAIL_RE.test(email)) return bad("Invalid agent details.");

    const res = await sales.upsertSalesAgent({ code, name, email });
    if (!res.ok) return bad(res.error, 409);
    if (res.agent.status === "suspended") return bad("This agent's portal login is suspended. Reactivate it in the portal first.", 409);

    const setupLink = `${siteUrl()}/set-up?token=${encodeURIComponent(
      await store.issueToken(res.agent.id, "account_setup", SETUP_TTL_MINUTES),
    )}`;
    const emailed = await emailAgentSetup({ to: res.agent.email, name: res.agent.name, code: res.agent.crmCode, link: setupLink });
    await audit({
      action: res.created ? "sales.agent_created" : "sales.agent_link_sent",
      actorId: null,
      actorEmail: "crm",
      entity: "user",
      entityId: res.agent.id,
      meta: { crmCode: code, emailed },
    });
    return NextResponse.json({ ok: true, created: res.created, emailed, setupLink: emailed ? null : setupLink });
  }

  if (body.type === "student.invite") {
    const agentCode = str(body.agentCode, 20).toUpperCase();
    const leadId = str(body.leadId, 40) || null;
    const name = str(body.name, 120);
    const email = str(body.email, 200).toLowerCase();
    if (name.length < 2 || !EMAIL_RE.test(email)) return bad("Enter the student's name and a valid email.");

    const agent = await sales.agentByCrmCode(agentCode);
    if (!agent) return bad("This agent has no portal login yet.", 404);
    if (agent.status !== "active") return bad("This agent's portal login is not active.", 409);

    await sales.revokeOlderInvites(agent.id, email);
    const created = await invitesRepo.createInvite({ consultantId: agent.id, createdBy: agent.id, email, name, crmLeadId: leadId });
    if (!created) return bad("We couldn't create the sign-up link just now.", 503);
    const link = `${siteUrl()}/join/${created.token}`;
    const emailed = await emailStudentInvite({ to: email, name, agentName: agent.name, agentEmail: agent.email, link });

    await audit({
      action: "invite.created",
      actorId: agent.id,
      actorEmail: agent.email,
      entity: "student_invite",
      entityId: created.id,
      meta: { via: "crm", crmLeadId: leadId, emailed },
    });
    return NextResponse.json({ ok: true, emailed, link });
  }

  return bad("Unknown request type.");
}
