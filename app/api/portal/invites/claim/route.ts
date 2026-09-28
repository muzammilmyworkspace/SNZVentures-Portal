import { NextResponse } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import * as invitesRepo from "@/lib/db/repos/invites";
import { isDatabaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ATTACH AN ACCOUNT THAT ALREADY EXISTS TO THE CONSULTANT WHO SENT THE LINK.
 *
 * The register route claims an invite for somebody signing up through it. This
 * is the other half: a student who registered directly last week, and whose
 * consultant has now sent them a link.
 *
 * Without this the case has no answer at all. The join page would show a
 * sign-up form to somebody already signed in, and the careful ones would make
 * a SECOND account to use the link — which is worse than not enrolling, since
 * their documents are now split across two files.
 *
 * Every rule lives in `claimInvite`: one transaction, live rows, and a refusal
 * for an account that already has a consultant. Nothing is decided here.
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "The portal database is not configured yet." },
      { status: 503 }
    );
  }

  /*
    Rate-limited per ACCOUNT, not per IP. The thing worth slowing down is one
    signed-in person feeding guessed tokens at the endpoint; several students
    behind one office connection are not that.
  */
  const limit = rateLimit(`invite-claim:${session.userId}`, { limit: 10, windowMs: 15 * 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { token } = (body ?? {}) as Record<string, unknown>;
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const claim = await invitesRepo.claimInvite(token, session.userId);

  if (!claim.ok) {
    /*
      `already_assigned` is named plainly because the person CAN act on it —
      they know who their consultant is and can ask us to change it. The other
      two collapse into one message: a signed-in stranger must not be able to
      tell a dead token from a real one belonging to somebody else.
    */
    const message =
      claim.reason === "already_assigned"
        ? "Your account already has a consultant. Contact us if that is wrong."
        : "This link isn't valid. Ask your consultant for a new one.";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }

  await audit({
    action: "invite.claimed",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: session.userId,
    meta: { consultantId: claim.consultantId, via: "existing_account" },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, consultantName: claim.consultantName });
}
