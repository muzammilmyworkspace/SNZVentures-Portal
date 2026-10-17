import { NextResponse } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import { createToken, setSessionCookie } from "@/lib/auth/session";
import * as usersRepo from "@/lib/db/repos/users";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { SEALED_MESSAGE } from "@/lib/auth/impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CHANGING THE NAME ON YOUR OWN ACCOUNT.
 *
 * The name travels inside the signed session, so after writing it the session
 * is re-issued with the new name (same epoch, same absolute expiry); otherwise
 * the sidebar would keep the old one until the next sign-in. Not while viewing
 * as somebody else.
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (session.impersonator) {
    return NextResponse.json({ ok: false, error: SEALED_MESSAGE }, { status: 403 });
  }
  if (!rateLimit(`name-change:${session.userId}`, { limit: 10, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many changes. Please try again in an hour." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ ok: false, error: "Enter a name between 2 and 80 characters." }, { status: 400 });
  }
  if (name === session.name) return NextResponse.json({ ok: true, name });

  if (!(await usersRepo.updateName(session.userId, name))) {
    return NextResponse.json({ ok: false, error: "That didn't save. Please try again." }, { status: 500 });
  }

  await audit({
    action: "user.name_changed",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: session.userId,
    meta: { from: session.name, to: name },
    ip: clientIp(request),
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { exp, ...rest } = session;
  await setSessionCookie(createToken({ ...rest, name }));
  return NextResponse.json({ ok: true, name });
}
