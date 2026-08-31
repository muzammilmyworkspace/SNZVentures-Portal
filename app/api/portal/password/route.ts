import { NextResponse } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import { hashPassword, verifyPassword, validatePassword } from "@/lib/auth/password";
import { createToken, setSessionCookie } from "@/lib/auth/session";
import * as usersRepo from "@/lib/db/repos/users";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CHANGE PASSWORD — for every role, including the super admin.
 *
 * This is what removes the CLI from ordinary account management: the database
 * stays the source of truth, but the operator no longer needs shell access to
 * rotate a password.
 *
 * THE CURRENT PASSWORD IS ALWAYS REQUIRED, even though the caller is already
 * authenticated. A session cookie proves someone signed in at some point; it
 * does not prove the person at the keyboard right now is the account holder.
 * Without this check, an unattended laptop is a permanent account takeover.
 *
 * THE POLICY IS NOT RELAXED. `validatePassword` is the same function the
 * registration API uses, so a weak password cannot enter through this door
 * either — including for the QA accounts, whose short password was written by
 * a CLI script that hashes directly and never touches this route.
 *
 * A FRESH SESSION IS ISSUED on success. The old token stays cryptographically
 * valid until it expires — these sessions are stateless, so there is no server
 * record to revoke — but the caller's own cookie is replaced immediately. The
 * honest limitation is recorded at the bottom of this file.
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const ip = clientIp(request);
  // Tight, because this endpoint verifies a password and is therefore a place
  // someone could try to guess one.
  if (!rateLimit(`pwchange:${session.userId}`, { limit: 6, windowMs: 15 * 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please try again shortly." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { currentPassword, newPassword, confirmPassword } = (body ?? {}) as Record<string, unknown>;

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return NextResponse.json(
      { ok: false, error: "Enter your current and new password." },
      { status: 400 }
    );
  }
  if (typeof confirmPassword === "string" && confirmPassword !== newPassword) {
    return NextResponse.json({ ok: false, error: "Those passwords don't match." }, { status: 400 });
  }

  const policy = validatePassword(newPassword);
  if (policy) return NextResponse.json({ ok: false, error: policy }, { status: 400 });

  if (newPassword === currentPassword) {
    return NextResponse.json(
      { ok: false, error: "Your new password must be different from the current one." },
      { status: 400 }
    );
  }

  const account = await usersRepo.findAuthByEmail(session.email);
  if (!account) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  /*
    An account created through Google has no password to verify. Offering a
    "change password" that silently sets a first one would give a second way in
    to an account the owner believes is protected by their provider alone.
  */
  if (!account.passwordHash) {
    return NextResponse.json(
      {
        ok: false,
        error: "This account signs in with Google, so it has no password to change.",
      },
      { status: 400 }
    );
  }

  const valid = await verifyPassword(currentPassword, account.passwordHash);
  if (!valid) {
    await audit({
      action: "auth.login_failed",
      actorId: session.userId,
      actorEmail: session.email,
      meta: { reason: "password_change_wrong_current" },
      ip,
    });
    return NextResponse.json(
      { ok: false, error: "Your current password isn't right." },
      { status: 401 }
    );
  }

  await usersRepo.setPasswordHash(session.userId, await hashPassword(newPassword));

  /*
    EVERY OTHER SESSION ENDS HERE.

    The usual reason to change a password is suspecting somebody else has it.
    A change that left their session alive would be the one moment the product
    absolutely has to work and quietly didn't — they would keep the account
    until the old token aged out a week later.

    Order matters: revoke first, then mint this caller a token carrying the new
    epoch, so the person who just changed their password stays signed in and
    everyone else is out.
  */
  const epoch = await usersRepo.revokeSessions(session.userId);

  await setSessionCookie(
    createToken({
      userId: session.userId,
      email: session.email,
      role: session.role,
      name: session.name,
      ep: epoch ?? undefined,
    })
  );

  await audit({
    action: "auth.password_reset",
    actorId: session.userId,
    actorEmail: session.email,
    // Never the password, never its length — an audit log is not a hint.
    meta: { via: "portal_settings" },
    ip,
  });

  return NextResponse.json({ ok: true });
}

/*
 * KNOWN LIMITATION, recorded rather than hidden.
 *
 * Sessions are stateless HMAC tokens, so a password change cannot invalidate a
 * token already issued to another device — it stays valid until it expires
 * (seven days). Closing that gap means either a session table or a per-user
 * token version column checked on every request, which is a schema change and
 * a cost on every authenticated read. It is worth doing before the portal
 * holds significant volume; it is not worth pretending is already done.
 */
