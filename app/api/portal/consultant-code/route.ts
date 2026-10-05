import { NextResponse } from "next/server";
import { SEALED_MESSAGE } from "@/lib/auth/impersonation";
import { apiRequireUser } from "@/lib/auth/guard";
import { CLIENT_ROLES, type Role } from "@/lib/auth/types";
import { enrolByCode } from "@/lib/db/repos/invites";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A client who signed up without a code adds it later, from Settings.
 * Only works while they have no consultant at all; moving between
 * consultants stays an admin decision.
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  if (session.impersonator) {
    return NextResponse.json({ ok: false, error: SEALED_MESSAGE }, { status: 403 });
  }
  if (!(CLIENT_ROLES as readonly Role[]).includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Consultant codes are for client accounts." }, { status: 400 });
  }
  if (!rateLimit(`ccode:${session.userId}`, { limit: 10, windowMs: 15 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many tries. Please wait a few minutes." }, { status: 429 });
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  } catch {}
  if (!code) return NextResponse.json({ ok: false, error: "Enter the code." }, { status: 400 });

  const result = await enrolByCode(session.userId, code);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          result.reason === "already"
            ? "You already have a consultant. Message us if it should be someone else."
            : "We don't recognise that code. Check it with your consultant.",
      },
      { status: 400 }
    );
  }
  await audit({
    action: "invite.claimed",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: session.userId,
    meta: { consultantId: result.consultantId, via: "code" },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true, consultantName: result.consultantName });
}
