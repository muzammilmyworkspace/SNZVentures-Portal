import { NextResponse } from "next/server";
import { getSession, createToken, setSessionCookie } from "@/lib/auth/session";
import * as store from "@/lib/auth/store";
import { revokeSessions, setAvatar } from "@/lib/db/repos/users";
import { safeAvatar } from "@/lib/auth/avatar";
import * as profilesRepo from "@/lib/db/repos/profiles";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import { mustOnboard, setMustOnboard } from "@/lib/db/repos/student-desk";
import { homeFor } from "@/lib/portal/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED = [
  ["phone", "phone number"],
  ["city", "city"],
  ["country", "country"],
] as const;

/**
 * FIRST SIGN-IN: details, photo, and their own password in place of the one
 * that was emailed. Only for an account still marked must_onboard.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  // Viewing as someone never chooses their password for them.
  if (session.impersonator) {
    return NextResponse.json({ ok: false, error: "Only they can do this, from their own sign-in." }, { status: 403 });
  }
  if (!(await mustOnboard(session.userId))) {
    return NextResponse.json({ ok: true, redirectTo: homeFor(session.role) });
  }

  const ip = clientIp(request);
  if (!rateLimit(`welcome:${session.userId}`, { limit: 10, windowMs: 15 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Please try again shortly." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  const pwError = validatePassword(password);
  if (pwError) return NextResponse.json({ ok: false, error: pwError }, { status: 400 });

  const patch: Record<string, string> = {};
  for (const [key, label] of REQUIRED) {
    const value = body[key];
    if (typeof value !== "string" || !value.trim()) {
      return NextResponse.json({ ok: false, error: `Enter your ${label}.` }, { status: 400 });
    }
    patch[key] = value.trim().slice(0, 120);
  }

  await profilesRepo.saveProfile(session.userId, session.role, patch);
  const avatar = safeAvatar(body.avatar);
  if (avatar) await setAvatar(session.userId, avatar);
  await store.setPasswordHash(session.userId, await hashPassword(password));
  await setMustOnboard(session.userId, false);

  await audit({
    action: "auth.account_set_up",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: session.userId,
    meta: { role: session.role, via: "first_sign_in" },
    ip,
  });

  // The emailed password is spent: every other session ends, this one renews.
  const epoch = await revokeSessions(session.userId);
  await setSessionCookie(
    createToken({
      userId: session.userId,
      email: session.email,
      role: session.role,
      name: session.name,
      ep: epoch ?? undefined,
    })
  );

  return NextResponse.json({ ok: true, redirectTo: homeFor(session.role) });
}
