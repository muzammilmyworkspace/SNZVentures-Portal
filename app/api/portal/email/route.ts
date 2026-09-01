import { NextResponse } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import * as store from "@/lib/auth/store";
import * as usersRepo from "@/lib/db/repos/users";
import { verifyPassword } from "@/lib/auth/password";
import { sendMail, mailConfigured } from "@/lib/mail";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { SEALED_MESSAGE } from "@/lib/auth/impersonation";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CHANGING THE ADDRESS YOU SIGN IN WITH.
 * ---------------------------------------------------------------------------
 * Four things make this safe, and each one is here because leaving it out has
 * a specific consequence:
 *
 *  1. THE CURRENT PASSWORD IS REQUIRED. Without it, anyone who reaches an
 *     unlocked laptop owns the account permanently — change the address, then
 *     request a reset to it. A session alone must not be enough to move where
 *     recovery mail goes.
 *
 *  2. THE NEW ADDRESS IS VERIFIED FIRST. The account keeps its old address
 *     until somebody proves they can read the new one, so a typo cannot lock
 *     the owner out of their own recovery.
 *
 *  3. THE OLD ADDRESS IS TOLD. This is the one people leave out. If the
 *     request was not yours, the message arrives somewhere you can still read
 *     — which is the only warning you would ever get.
 *
 *  4. NOT WHILE SIGNED IN AS SOMEBODY ELSE. See lib/auth/impersonation.
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  const ip = clientIp(request);

  if (session.impersonator) {
    return NextResponse.json({ ok: false, error: SEALED_MESSAGE }, { status: 403 });
  }

  if (!rateLimit(`email-change:${session.userId}`, { limit: 5, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please try again in an hour." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { email, password } = (body ?? {}) as Record<string, unknown>;

  const next = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(next)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 }
    );
  }
  if (next === session.email.toLowerCase()) {
    return NextResponse.json(
      { ok: false, error: "That is already your address." },
      { status: 400 }
    );
  }
  if (typeof password !== "string" || !password) {
    return NextResponse.json(
      { ok: false, error: "Enter your current password." },
      { status: 400 }
    );
  }

  const account = await store.findAuthByEmail(session.email);
  const valid =
    account?.passwordHash && (await verifyPassword(password, account.passwordHash));
  if (!valid) {
    await audit({
      action: "user.email_change_refused",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "user",
      entityId: session.userId,
      meta: { reason: "bad_password" },
      ip,
    });
    return NextResponse.json(
      { ok: false, error: "That password is not right." },
      { status: 401 }
    );
  }

  /*
    Taken, and said so plainly.

    Sign-in normally hides whether an address exists, because there the asker
    is a stranger. Here they have already proved they are this account holder,
    and refusing without a reason would send them round in circles over a
    typo — the privacy this would protect is not theirs to lose.
  */
  if (await usersRepo.emailExists(next)) {
    return NextResponse.json(
      { ok: false, error: "Another account already uses that address." },
      { status: 409 }
    );
  }

  if (!mailConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Email is not configured on this deployment, so the new address cannot be verified.",
      },
      { status: 503 }
    );
  }

  const token = await store.issueToken(session.userId, "email_change", 60, next);
  const base = (env("NEXT_PUBLIC_PORTAL_URL") ?? new URL(request.url).origin).replace(/\/+$/, "");
  const link = `${base}/change-email?token=${encodeURIComponent(token)}`;

  /*
    To the NEW address: the link. To the OLD one: a warning, with no link at
    all — somebody who did not ask for this must not be handed a button, and
    the message they need is "this is happening", not "confirm it".
  */
  await sendMail({
    to: next,
    subject: "Confirm your new SnZ Ventures email address",
    text:
      `Hello ${session.name},\n\n` +
      `You asked to use this address for your SnZ Ventures portal account. ` +
      `Confirm it here — the link works once and expires in an hour:\n\n${link}\n\n` +
      `Until you confirm, you keep signing in with ${session.email}.\n\n` +
      `If you did not ask for this, ignore this message and nothing changes.`,
  });

  await sendMail({
    to: session.email,
    subject: "Someone asked to change your SnZ Ventures email address",
    text:
      `Hello ${session.name},\n\n` +
      `A request was made to move your portal account to ${next}. ` +
      `It only takes effect once that address is confirmed.\n\n` +
      `IF THIS WAS NOT YOU, your password may be known to somebody else. ` +
      `Change it now at ${base}/portal/settings and reply to this message so we can help.\n\n` +
      `If it was you, nothing more is needed here.`,
  });

  await audit({
    action: "user.email_change_requested",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: session.userId,
    meta: { to: next },
    ip,
  });

  return NextResponse.json({ ok: true, sentTo: next });
}
