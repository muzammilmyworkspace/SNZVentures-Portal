import { NextResponse } from "next/server";
import * as store from "@/lib/auth/store";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { createToken, setSessionCookie, authConfigured } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { PATHWAY_TO_ROLE, type Role } from "@/lib/auth/types";
import { audit } from "@/lib/db/repos/audit";
import { homeFor } from "@/lib/portal/roles";
import { sendMail, mailConfigured } from "@/lib/mail";
import { siteUrl } from "@/lib/site-url";
import * as invitesRepo from "@/lib/db/repos/invites";
import * as profilesRepo from "@/lib/db/repos/profiles";
import { setAvatar } from "@/lib/db/repos/users";
import { safeAvatar } from "@/lib/auth/avatar";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Public registration.
 *
 * Can ONLY create client roles. The role is derived server-side from the
 * pathway question — the request body has no role field, so there is no
 * privilege-escalation surface here at all.
 */
export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Authentication is not configured on this server." },
      { status: 503 }
    );
  }
  if (!store.isStoreReady()) {
    return NextResponse.json(
      { ok: false, error: "The portal database is not configured yet." },
      { status: 503 }
    );
  }

  const ip = clientIp(request);
  const limit = rateLimit(`register:${ip}`, { limit: 5, windowMs: 15 * 60_000 });
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

  const { name, password, pathway, invite, phone, city, country, avatar } = (body ?? {}) as Record<
    string,
    unknown
  >;
  let { email } = body as { email?: unknown };

  /*
    AN INVITED ACCOUNT IS CREATED WITH THE ADDRESS IT WAS INVITED TO.

    The form locks the field, and this is the half that actually decides it —
    a locked input is a courtesy to the person typing, not a constraint on
    what arrives here. Taking the address from the invite also means the
    consultant who addressed it and the account that appears are the same
    thing, which is what makes "did my student sign up yet" answerable.

    A token that does not resolve falls through to whatever was typed; the
    claim then fails later and the account lands in Unassigned, which is the
    behaviour that already existed for an expired link.
  */
  if (typeof invite === "string" && invite) {
    const invited = await invitesRepo.previewInvite(invite);
    if (invited?.email) email = invited.email;
  }

  if (typeof name !== "string" || name.trim().length < 2 || name.length > 120) {
    return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim()) || email.length > 200) {
    return NextResponse.json(
      { ok: false, error: "That email address doesn't look right." },
      { status: 400 }
    );
  }
  if (typeof password !== "string") {
    return NextResponse.json({ ok: false, error: "Please choose a password." }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) return NextResponse.json({ ok: false, error: pwError }, { status: 400 });

  if (typeof pathway !== "string" || !(pathway in PATHWAY_TO_ROLE)) {
    return NextResponse.json(
      { ok: false, error: "Please choose what brings you here." },
      { status: 400 }
    );
  }
  // Role is decided here, never taken from the client.
  const role: Role = PATHWAY_TO_ROLE[pathway as keyof typeof PATHWAY_TO_ROLE];

  /*
    Asked for once, at the only moment everybody passes through. A profile
    filled in later is a profile mostly left empty — the consultant details
    sat blank for exactly that reason — and a phone number is what turns a
    stalled application into a phone call.
  */
  const contact: Record<string, string> = {};
  for (const [key, value, label] of [
    ["phone", phone, "phone number"],
    ["city", city, "city"],
    ["country", country, "country"],
  ] as const) {
    if (typeof value !== "string" || !value.trim()) {
      return NextResponse.json({ ok: false, error: `Enter your ${label}.` }, { status: 400 });
    }
    contact[key] = value.trim().slice(0, 200);
  }

  /*
    NO UNDERTAKING IS TAKEN AT SIGN-UP.

    It is enforced where it belongs instead — app/api/portal/intake refuses to
    submit a student application without it, on the completed file. Creating an
    account is not the moment somebody can meaningfully agree that documents
    they have not yet uploaded are genuine.
  */

  const existing = await store.findByEmail(email);
  if (existing) {
    // Same shape as success-adjacent errors — no account-existence oracle.
    return NextResponse.json(
      { ok: false, error: "We couldn't create that account. Try signing in instead." },
      { status: 409 }
    );
  }

  let user;
  try {
    user = await store.createUser({
      email,
      name,
      role,
      passwordHash: await hashPassword(password),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[register] failed:", error);
    return NextResponse.json(
      { ok: false, error: "We couldn't create that account right now." },
      { status: 500 }
    );
  }

  /*
    After the account, never before: a profile row with no user is not a thing
    this schema allows, and a failure here must not cost somebody the account
    they just created.
  */
  await profilesRepo.saveProfile(user.id, role, contact);

  // Optional. A rejected photo must never cost somebody the account.
  const photo = safeAvatar(avatar);
  if (photo) await setAvatar(user.id, photo);

  await audit({
    action: "auth.register",
    actorId: user.id,
    actorEmail: user.email,
    entity: "user",
    entityId: user.id,
    meta: { role },
    ip,
  });

  /*
    ENROLMENT, IF THEY ARRIVED THROUGH A CONSULTANT'S LINK.

    Deliberately AFTER the account exists and deliberately unable to fail the
    registration. A link that has expired between opening the page and
    submitting the form must not cost somebody the account they just created —
    they end up in the admin's "unassigned" queue instead, which is exactly the
    case that queue exists for.

    Every rule about who may be enrolled is enforced inside `claimInvite`, in
    one transaction, against live rows. Nothing is trusted from here beyond the
    fact that a string was supplied.
  */
  let enrolledWith: string | null = null;
  if (typeof invite === "string" && invite) {
    const claim = await invitesRepo.claimInvite(invite, user.id);
    if (claim.ok) {
      enrolledWith = claim.consultantName;
      await audit({
        action: "invite.claimed",
        actorId: user.id,
        actorEmail: user.email,
        entity: "user",
        entityId: user.id,
        meta: { consultantId: claim.consultantId },
        ip,
      });
    } else {
      // Recorded, not shown. The student can do nothing about it; the admin can.
      // eslint-disable-next-line no-console
      console.error("[register] invite claim failed:", claim.reason, "for", user.id);
    }
  }

  /*
    The consent row is written with the version from the SERVER's constant,
    never from the request. A browser must not be able to claim it accepted a
    different document — or an older one — than the one it was actually shown.

    The audit entry records that a consent happened and which version; the
    consents table holds the evidence. Neither records anything the person did
    not deliberately type.
  */
  /*
    The Student Consent & Undertaking used to be recorded here. It is now the
    final section of the application — see app/api/portal/intake — because it
    authorises us to submit a file, and taking that authorisation before the
    file exists made the document say something that was not yet true.
  */

  // Verification email — best effort, never blocks registration.
  if (await mailConfigured()) {
    try {
      const token = await store.issueToken(user.id, "email_verify", 60 * 24);
      const base = siteUrl();
      await sendMail({
        to: user.email,
        subject: "Confirm your SnZ Ventures account",
        text: [
          `Hello ${user.name},`,
          "",
          "Confirm your email address to finish setting up your account:",
          `${base}/verify-email?token=${encodeURIComponent(token)}`,
          "",
          "The link is valid for 24 hours.",
          "",
          "SnZ Ventures",
        ].join("\n"),
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[register] verification email failed:", error);
    }
  }

  await setSessionCookie(
    createToken({ userId: user.id, email: user.email, role: user.role, name: user.name })
  );

  /*
    The destination is decided HERE, from the role the server just verified.
    Returning it means the browser never has to guess where a role belongs, and
    never gets to choose — it follows what the server says.
  */
  return NextResponse.json({
    ok: true,
    role: user.role,
    redirectTo: homeFor(user.role),
    enrolledWith,
  });
}
