import { NextResponse } from "next/server";
import { apiRequireAdmin } from "@/lib/auth/guard";
import { getSession, createToken, setSessionCookie } from "@/lib/auth/session";
import * as store from "@/lib/db/repos/users";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import {
  refuseImpersonation,
  REFUSAL_MESSAGE,
  IMPERSONATION_MAX_AGE_SECONDS,
} from "@/lib/auth/impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * START, AND END, VIEWING THE PORTAL AS A CLIENT.
 *
 * POST   step into their account
 * DELETE come back to your own
 *
 * The cookie that comes back is an ordinary session for the CLIENT, carrying
 * the member of staff inside it. Every guard and gate in the portal therefore
 * behaves exactly as it does for them, with nothing else in the codebase aware
 * this is happening — which is the only way a support view shows you the same
 * thing the client is looking at.
 *
 * BOTH DIRECTIONS ARE AUDITED, with the real person named. A view-as that is
 * not attributable is not a support tool.
 */
export async function POST(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  const ip = clientIp(request);

  if (!rateLimit(`impersonate:${session.userId}`, { limit: 20, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Slow down a moment." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { userId } = (body ?? {}) as Record<string, unknown>;
  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ ok: false, error: "Which client?" }, { status: 400 });
  }

  const target = await store.findById(userId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "No such user." }, { status: 404 });
  }

  const refusal = refuseImpersonation({
    actor: session,
    target: { id: target.id, role: target.role, status: target.status },
  });
  if (refusal) {
    return NextResponse.json({ ok: false, error: REFUSAL_MESSAGE[refusal] }, { status: 403 });
  }

  /*
    The TARGET's epoch, not the admin's. It is what makes this session end the
    moment that account's own sessions end — if they change their password
    while being viewed, the view stops with them.
  */
  const epoch = await store.sessionEpoch(target.id);

  const token = createToken(
    {
      userId: target.id,
      email: target.email,
      role: target.role,
      name: target.name,
      ep: epoch ?? undefined,
      impersonator: {
        userId: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
        since: Math.floor(Date.now() / 1000),
      },
    },
    IMPERSONATION_MAX_AGE_SECONDS
  );
  await setSessionCookie(token);

  await audit({
    action: "user.impersonation_started",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: target.id,
    meta: { target: target.email, role: target.role },
    ip,
  });

  return NextResponse.json({ ok: true, redirectTo: "/portal" });
}

/**
 * Back to your own account.
 *
 * Guarded by the presence of an impersonator in the CURRENT session rather
 * than by a role, because the session is a client's while this is in force —
 * an admin check here would refuse the very person who needs to get out.
 */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session?.impersonator) {
    return NextResponse.json(
      { ok: false, error: "You are not viewing as anyone." },
      { status: 400 }
    );
  }

  const back = session.impersonator;
  const admin = await store.findById(back.userId);

  /*
    Re-read from the database rather than trusting the token's copy. The staff
    account may have been suspended or demoted during the view, and restoring
    a role from a token minted before that would hand back access that has
    since been taken away.
  */
  if (!admin || admin.status !== "active") {
    const { clearSessionCookie } = await import("@/lib/auth/session");
    await clearSessionCookie();
    return NextResponse.json({ ok: true, redirectTo: "/login" });
  }

  const epoch = await store.sessionEpoch(admin.id);
  await setSessionCookie(
    createToken({
      userId: admin.id,
      email: admin.email,
      role: admin.role,
      name: admin.name,
      ep: epoch ?? undefined,
    })
  );

  await audit({
    action: "user.impersonation_ended",
    actorId: admin.id,
    actorEmail: admin.email,
    entity: "user",
    entityId: session.userId,
    meta: { target: session.email, seconds: Math.floor(Date.now() / 1000) - back.since },
    ip: clientIp(request),
  });

  return NextResponse.json({
    ok: true,
    redirectTo: `/portal/admin/users/${session.userId}`,
  });
}
