import { NextResponse } from "next/server";
import * as store from "@/lib/auth/store";
import { revokeSessions, setEmailVerified } from "@/lib/db/repos/users";
import * as profilesRepo from "@/lib/db/repos/profiles";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { createToken, setSessionCookie, authConfigured } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import { homeFor } from "@/lib/portal/roles";
import { isDatabaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything a consultant is asked for before they can sign in. */
const REQUIRED = [
  ["phone", "phone number"],
  ["company", "company name"],
  ["address_line", "company address"],
  ["city", "city"],
  ["postcode", "zip or postcode"],
  ["country", "country"],
] as const;

/**
 * FIRST SIGN-IN FOR AN ACCOUNT SOMEBODY ELSE CREATED.
 *
 * Takes the contact details and the password together, in one spend of the
 * token, because they are one act: the person is setting up their account, not
 * doing two unrelated things that happen to share a screen.
 *
 * WHY THIS IS NOT /api/auth/reset-password. That route serves somebody who has
 * forgotten their password, and it must stay a single field. Asking a locked-
 * out consultant to re-enter a company address before they can get back in
 * would be the same screen doing two jobs badly. The token kinds keep them
 * apart: this accepts only `account_setup`, that one only `password_reset`,
 * so neither link can be used as the other.
 *
 * THE DETAILS ARE WRITTEN BEFORE THE PASSWORD. If the write fails, nothing has
 * been spent and the person tries again with the same link. Doing it the other
 * way would leave an account that can sign in and a profile that is empty,
 * with no prompt ever to finish it — which is the state this whole flow exists
 * to avoid.
 */
export async function POST(request: Request) {
  if (!authConfigured() || !isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "This portal is not fully set up yet." },
      { status: 503 }
    );
  }

  const ip = clientIp(request);
  if (!rateLimit(`set-up:${ip}`, { limit: 10, windowMs: 15 * 60_000 }).ok) {
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
  const { token, password, ...fields } = (body ?? {}) as Record<string, unknown>;

  if (typeof token !== "string" || !token) {
    return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 400 });
  }
  if (typeof password !== "string") {
    return NextResponse.json({ ok: false, error: "Choose a password." }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) return NextResponse.json({ ok: false, error: pwError }, { status: 400 });

  /*
    Checked before the token is spent. A link that dies because one field was
    blank is a link the person has to ask for again, and they would be right to
    be annoyed.
  */
  const patch: Record<string, string> = {};
  for (const [key, label] of REQUIRED) {
    const value = fields[key];
    if (typeof value !== "string" || !value.trim()) {
      return NextResponse.json(
        { ok: false, error: `Enter your ${label}.` },
        { status: 400 }
      );
    }
    patch[key] = value.trim();
  }

  const spent = await store.consumeToken(token, "account_setup");
  if (!spent) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This link has expired or has already been used. Ask for a new invitation.",
      },
      { status: 400 }
    );
  }

  const user = await store.findById(spent);
  if (!user) {
    return NextResponse.json({ ok: false, error: "That account no longer exists." }, { status: 404 });
  }

  await profilesRepo.saveProfile(user.id, user.role, patch);
  await store.setPasswordHash(user.id, await hashPassword(password));

  /*
    The address was confirmed by the person who owns it, arriving through a
    link only they received — which is exactly what verifying an email proves.
  */
  await setEmailVerified(user.id);

  await audit({
    action: "auth.account_set_up",
    actorId: user.id,
    actorEmail: user.email,
    entity: "user",
    entityId: user.id,
    meta: { role: user.role },
    ip,
  });

  /*
    Everything else signs out, exactly as a password reset does. The invitation
    went to an inbox, and an account being set up for the first time should not
    inherit any session that somehow already existed for it.
  */
  const epoch = await revokeSessions(user.id);

  await setSessionCookie(
    createToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      ep: epoch ?? undefined,
    })
  );

  return NextResponse.json({ ok: true, role: user.role, redirectTo: homeFor(user.role) });
}
