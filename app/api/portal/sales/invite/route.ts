import { NextResponse } from "next/server";
import { apiRequireRole } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import * as invitesRepo from "@/lib/db/repos/invites";
import { revokeOlderInvites } from "@/lib/db/repos/sales";
import { emailStudentInvite } from "@/lib/integrations/sales-mail";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A sales agent adds a student from the portal: name + email, and a sign-up link is emailed. */
export async function POST(request: Request) {
  const guard = await apiRequireRole(["sales"]);
  if (!guard.ok) return guard.response;
  const { session } = guard;
  if (!rateLimit(`sales-invite:${session.userId}`, { limit: 40, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many invites. Please try again shortly." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { name, email } = (body ?? {}) as Record<string, unknown>;
  const studentName = typeof name === "string" ? name.trim().slice(0, 120) : "";
  const to = typeof email === "string" ? email.trim().toLowerCase().slice(0, 200) : "";
  if (studentName.length < 2) return NextResponse.json({ ok: false, error: "Enter the student's full name." }, { status: 400 });
  if (!EMAIL_RE.test(to)) return NextResponse.json({ ok: false, error: "Enter the student's email." }, { status: 400 });

  await revokeOlderInvites(session.userId, to);
  const created = await invitesRepo.createInvite({ consultantId: session.userId, createdBy: session.userId, email: to, name: studentName });
  if (!created) return NextResponse.json({ ok: false, error: "We couldn't create that link just now." }, { status: 503 });
  const link = `${siteUrl()}/join/${created.token}`;
  const emailed = await emailStudentInvite({ to, name: studentName, agentName: session.name, agentEmail: session.email, link });

  await audit({
    action: "invite.created",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "student_invite",
    entityId: created.id,
    meta: { via: "sales", emailed },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true, emailed, link });
}
