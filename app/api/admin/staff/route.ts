import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import * as usersRepo from "@/lib/db/repos/users";
import * as store from "@/lib/auth/store";
import { hashPassword } from "@/lib/auth/password";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { sendMail, mailConfigured } from "@/lib/mail";
import { siteUrl } from "@/lib/site-url";
import { isDatabaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** How long the new consultant has to set their password. */
const SETUP_TTL_MINUTES = 60 * 24 * 3;

/**
 * CREATE A CONSULTANT.
 *
 * The only way a staff account comes into existence. Public registration can
 * mint client roles and nothing else — the request body has no role field at
 * all — so before this there was no path to a consultant except registering as
 * a student and being promoted, which meant an unvetted account existed first.
 *
 * SUPER ADMIN ONLY, not admin. Creating staff is how the circle of people who
 * can see every client file grows, and it is one step from creating an account
 * and then promoting it further. `assignableRoles` already says only a super
 * admin may mint staff roles; this is the same rule at the point of creation.
 *
 * NO PASSWORD IS EVER CHOSEN FOR THEM, and none is emailed.
 *
 * The row needs one — a user with neither a password nor an OAuth identity
 * fails the CHECK added in migration 003 — so it gets a random 32-byte value
 * that is hashed and then discarded, unknown to the creator and to us. The
 * only way into the account is the single-use link below, which the person
 * themselves spends to choose a password.
 *
 * A password sent by email is a password that lives in that inbox for ever,
 * and in the sent folder of whoever forwarded it. This avoids ever creating
 * that copy rather than trying to manage it.
 */
export async function POST(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "The portal database is not configured yet." },
      { status: 503 }
    );
  }

  const ip = clientIp(request);
  const limit = rateLimit(`create-staff:${session.userId}`, { limit: 20, windowMs: 60 * 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many accounts created. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { name, email } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length < 2 || name.length > 120) {
    return NextResponse.json({ ok: false, error: "Enter their full name." }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim()) || email.length > 200) {
    return NextResponse.json(
      { ok: false, error: "That email address doesn't look right." },
      { status: 400 }
    );
  }

  /*
    Said plainly, unlike the equivalent check on public registration.

    There the vague answer protects a stranger from learning whether an address
    is registered. Here the asker is a super admin who can already list every
    account, so there is nothing to protect — and a vague refusal would just
    send them hunting for an account they are perfectly entitled to see.
  */
  if (await usersRepo.findByEmail(email)) {
    return NextResponse.json(
      {
        ok: false,
        error: "An account already uses that address. Change their role from Users instead.",
      },
      { status: 409 }
    );
  }

  let user;
  try {
    user = await usersRepo.createUser({
      email,
      name,
      role: "advisor",
      // Random, hashed, and immediately out of scope. Nobody ever holds it.
      passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[create-staff] failed:", error);
    return NextResponse.json(
      { ok: false, error: "We couldn't create that account right now." },
      { status: 500 }
    );
  }

  const link = `${siteUrl()}/reset-password?token=${encodeURIComponent(
    await store.issueToken(user.id, "password_reset", SETUP_TTL_MINUTES)
  )}`;

  /*
    Sent if mail is configured, and the link comes back either way.

    Handing it to the admin regardless is what makes this work on a deployment
    with no mail transport — the same answer the admin password-reset link
    already gives, for the same reason. `emailed` says which happened, so the
    screen can tell them to pass it on rather than leaving them to guess
    whether anything went out.
  */
  let emailed = false;
  if (mailConfigured()) {
    try {
      await sendMail({
        to: user.email,
        subject: "Your SnZ Ventures consultant account",
        text: [
          `Hello ${user.name},`,
          "",
          "An account has been created for you on the SnZ Ventures consultant portal.",
          "",
          `You sign in with: ${user.email}`,
          "",
          "Choose your password here — the link works once and expires in three days:",
          link,
          "",
          "After that you can enrol your students by sending them a link from",
          "Your students in the portal.",
          "",
          "If you were not expecting this, ignore this message and nothing happens.",
          "",
          "SnZ Ventures",
        ].join("\n"),
      });
      emailed = true;
    } catch (error) {
      // Recorded, never fatal — the link in the response is the fallback.
      // eslint-disable-next-line no-console
      console.error("[create-staff] invitation email failed:", error);
    }
  }

  await audit({
    action: "staff.created",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: user.id,
    meta: { email: user.email, role: "advisor", emailed },
    ip,
  });

  return NextResponse.json({
    ok: true,
    id: user.id,
    name: user.name,
    email: user.email,
    link,
    emailed,
    expiresInHours: SETUP_TTL_MINUTES / 60,
  });
}
