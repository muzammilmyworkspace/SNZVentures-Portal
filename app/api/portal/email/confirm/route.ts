import { NextResponse } from "next/server";
import * as store from "@/lib/auth/store";
import * as usersRepo from "@/lib/db/repos/users";
import { getSession, createToken, setSessionCookie } from "@/lib/auth/session";
import { sendMail, mailConfigured } from "@/lib/mail";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SPEND THE TOKEN, MOVE THE ADDRESS.
 *
 * Unauthenticated on purpose. The link lands in a mailbox, and requiring a
 * signed-in session to open it would break the ordinary case of confirming
 * from a phone that is not signed in. Proof is the token itself: single-use,
 * an hour long, and it carries the address it was issued for — so a link
 * cannot be pointed at a different one.
 *
 * The uniqueness check runs AGAIN here, not only when the change was
 * requested. An hour is long enough for somebody else to have registered that
 * address in between, and the database's own unique index is the last word.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { token } = (body ?? {}) as Record<string, unknown>;
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 400 });
  }

  const spent = await store.consumeTokenWithPayload(token, "email_change");
  if (!spent?.payload) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This link has expired or has already been used. Request the change again from Settings.",
      },
      { status: 400 }
    );
  }

  const next = spent.payload.trim().toLowerCase();
  const before = await usersRepo.findById(spent.userId);
  if (!before) {
    return NextResponse.json({ ok: false, error: "That account no longer exists." }, { status: 404 });
  }

  if (await usersRepo.emailExists(next)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "That address has been taken since you asked. Start again from Settings with a different one.",
      },
      { status: 409 }
    );
  }

  const moved = await usersRepo.changeEmail(spent.userId, next);
  if (!moved) {
    return NextResponse.json(
      { ok: false, error: "We could not apply that just now. Please try again." },
      { status: 503 }
    );
  }

  /*
    The session carries the old address in its payload, so it is re-minted for
    whoever is signed in HERE — but only if that is the same person. Confirming
    from a phone while signed in as somebody else must not hand them a session
    for this account.
  */
  const current = await getSession();
  if (current?.userId === spent.userId && !current.impersonator) {
    await setSessionCookie(
      createToken({
        userId: before.id,
        email: next,
        role: before.role,
        name: before.name,
        ep: current.ep,
      })
    );
  }

  if (mailConfigured()) {
    /*
      The old address is told it has happened, not just that it was asked for.
      It is the last message that mailbox will ever receive from us, and the
      only place an owner who did not do this can still find out.
    */
    await sendMail({
      to: before.email,
      subject: "Your SnZ Ventures email address has been changed",
      text:
        `Hello ${before.name},\n\n` +
        `Your portal account now signs in with ${next}. This address will no longer work.\n\n` +
        `IF THIS WAS NOT YOU, reply to this message immediately — somebody else has your password.`,
    });
  }

  await audit({
    action: "user.email_changed",
    actorId: spent.userId,
    actorEmail: next,
    entity: "user",
    entityId: spent.userId,
    meta: { from: before.email, to: next },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, email: next });
}
