import { NextResponse } from "next/server";
import { apiRequireStaff, isAdmin } from "@/lib/auth/guard";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import * as invitesRepo from "@/lib/db/repos/invites";
import { isDatabaseConfigured } from "@/lib/db/client";
import { siteUrl } from "@/lib/site-url";
import { sendMail, mailConfigured } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ENROLMENT LINKS.
 *
 * POST   mint a link for one student
 * DELETE withdraw an unclaimed one
 *
 * The link is returned in the response and shown once. It is NOT emailed: the
 * consultant sends it themselves, usually over WhatsApp, which is how they
 * already talk to the student. That also means enrolment does not wait on a
 * mail transport — the same reasoning as the admin password-reset link, which
 * hands the operator a URL rather than depending on email going out.
 *
 * WHO MAY MINT FOR WHOM
 *
 * A consultant mints for themselves and nobody else: `consultantId` is taken
 * from the SESSION, never the body. An admin may mint on a consultant's behalf
 * by naming one, because an admin placing a student is a real situation — but
 * that is an admin power, checked here, not something a consultant can reach
 * by posting a different id.
 */

/** Minted links are worth rate-limiting: each one is a claim on a student. */
const LIMIT = { limit: 30, windowMs: 60 * 60_000 };

export async function POST(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "The portal database is not configured yet." },
      { status: 503 }
    );
  }

  const ip = clientIp(request);
  const limit = rateLimit(`invite:${session.userId}`, LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many links created. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { email, note, forConsultantId } = (body ?? {}) as Record<string, unknown>;

  /*
    The id comes from the session unless an ADMIN names one. Reading it from
    the body for everyone would let any consultant mint a link that enrols a
    student under a colleague — or under themselves while appearing not to.
  */
  let consultantId = session.userId;
  if (typeof forConsultantId === "string" && forConsultantId) {
    if (!isAdmin(session.role)) {
      return NextResponse.json(
        { ok: false, error: "Only an administrator can create a link for someone else." },
        { status: 403 }
      );
    }
    consultantId = forConsultantId;
  }

  if (email !== undefined && email !== null && typeof email !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const created = await invitesRepo.createInvite({
    consultantId,
    createdBy: session.userId,
    email: typeof email === "string" ? email.slice(0, 200) : null,
    note: typeof note === "string" ? note.slice(0, 200) : null,
  });

  if (!created) {
    return NextResponse.json(
      { ok: false, error: "We couldn't create that link just now." },
      { status: 503 }
    );
  }

  const link = `${siteUrl()}/join/${created.token}`;
  const to = typeof email === "string" ? email.trim() : "";

  /*
    SENT WHEN AN ADDRESS WAS GIVEN, otherwise handed back to be passed on.

    This used to be copy-only for every invite, because no mail transport
    existed and a feature that silently sent nothing would have been worse than
    one that admitted it. With mail working, an address in that field should do
    what the field appears to promise — and a consultant who leaves it blank,
    because they are about to send the link over WhatsApp, still gets the link.

    A send that fails is NOT an error. The invite is already created and valid,
    and refusing here would throw away a usable link over a delivery problem.
    The response says which happened and the panel shows the link either way.
  */
  let emailed = false;
  if (to.includes("@") && (await mailConfigured())) {
    try {
      await sendMail({
        to,
        subject: `${session.name} has invited you to SnZ Ventures`,
        text: [
          "Hello,",
          "",
          `${session.name} at SnZ Ventures has invited you to create your account.`,
          "",
          "Open this link to get started — it works once, and expires in 14 days:",
          link,
          "",
          "You will be asked to choose a password, and then you can fill in your",
          "application and upload your documents.",
          "",
          "If you were not expecting this, ignore this message. Nothing is created",
          "until you fill in the form yourself.",
          "",
          "SnZ Ventures",
        ].join("\n"),
        replyTo: session.email,
      });
      emailed = true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[invite] email failed:", error);
    }
  }

  /*
    The audit records the invite id, NOT the token. An audit table that carries
    working enrolment links is a second copy of the secret, readable by every
    admin, for ever.
  */
  await audit({
    action: "invite.created",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "invite",
    entityId: created.id,
    meta: { consultantId, email: to || null, emailed },
    ip,
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    emailed,
    sentTo: emailed ? to : null,
    link,
    expiresAt: created.expiresAt,
  });
}

export async function DELETE(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { id, forConsultantId } = (body ?? {}) as Record<string, unknown>;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  let consultantId = session.userId;
  if (typeof forConsultantId === "string" && forConsultantId) {
    if (!isAdmin(session.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    consultantId = forConsultantId;
  }

  const revoked = await invitesRepo.revokeInvite(id, consultantId);
  if (!revoked) {
    /*
      One answer for "not yours", "already claimed" and "does not exist". The
      first two are genuinely different, but distinguishing them tells a caller
      whether an id they guessed belongs to somebody else.
    */
    return NextResponse.json(
      { ok: false, error: "That link can no longer be withdrawn." },
      { status: 409 }
    );
  }

  await audit({
    action: "invite.revoked",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "invite",
    entityId: id,
    meta: { consultantId },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}
