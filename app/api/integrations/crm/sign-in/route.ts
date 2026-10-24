import { NextResponse } from "next/server";
import { createToken, setSessionCookie } from "@/lib/auth/session";
import { verifyCrmTicket, useCrmTicket } from "@/lib/integrations/crm";
import { agentByCrmCode, upsertSalesAgent } from "@/lib/db/repos/sales";
import * as usersRepo from "@/lib/db/repos/users";
import { audit } from "@/lib/db/repos/audit";
import { isDatabaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";

/**
 * "OPEN PORTAL" FROM THE CRM.
 *
 * The CRM posts a signed, two-minute, one-use ticket for the signed-in sales
 * agent (see verifyCrmTicket). A valid ticket signs the agent in to their
 * portal account, found by their Agent ID and created on the spot if the CRM
 * had not linked it yet, and sends them to My students.
 *
 * Only ever a SALES login: the account must have the sales role. Anything
 * wrong ends on the sign-in screen with a short message, never a session.
 */
const back = (request: Request, error: string) =>
  NextResponse.redirect(new URL(`/login?oauth=${encodeURIComponent(error)}`, request.url), 303);

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return back(request, "crm_signin_unavailable");

  let ticket = "";
  try {
    const form = await request.formData();
    ticket = String(form.get("ticket") ?? "");
  } catch {
    return back(request, "crm_signin_invalid");
  }

  const t = verifyCrmTicket(ticket);
  if (!t) return back(request, "crm_signin_invalid");

  let agent = await agentByCrmCode(t.code);
  if (!agent) {
    const made = await upsertSalesAgent({ code: t.code, name: t.name, email: t.email });
    if (!made.ok) return back(request, "crm_signin_conflict");
    agent = made.agent;
  }
  if (agent.status === "suspended") return back(request, "crm_signin_suspended");

  if (!(await useCrmTicket(t.nonce, agent.id))) return back(request, "crm_signin_used");

  const user = await usersRepo.findForSession(agent.id);
  if (!user || user.role !== "sales") return back(request, "crm_signin_invalid");

  await setSessionCookie(
    createToken({ userId: user.id, email: user.email, role: user.role, name: user.name, ep: user.sessionEpoch })
  );
  await audit({
    action: "auth.crm_sign_in",
    actorId: user.id,
    actorEmail: user.email,
    meta: { code: agent.crmCode },
  });

  return NextResponse.redirect(new URL("/portal/sales", request.url), 303);
}
