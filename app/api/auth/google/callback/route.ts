import { NextResponse } from "next/server";
import { googleConfigured, exchangeCode, verifyState } from "@/lib/auth/oauth";
import { createToken, setSessionCookie, authConfigured } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import * as usersRepo from "@/lib/db/repos/users";
import { isDatabaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send the visitor back to the sign-in page with a readable reason. */
const fail = (request: Request, reason: string) =>
  NextResponse.redirect(new URL(`/login?oauth=${reason}`, request.url));

/**
 * Google sign-in callback.
 *
 * WHAT THIS ROUTE WILL NOT DO
 *
 *  • It will not create an account for an unverified Google email. Google can
 *    issue a token for an address it has not confirmed, and treating that as
 *    proof of ownership would let someone claim an address they do not hold.
 *
 *  • It will not silently link a Google identity to an existing PASSWORD
 *    account that happens to share the email. That is account takeover by
 *    email collision. Linking is a deliberate action taken from inside an
 *    authenticated session, not something inferred at sign-in.
 *
 *  • It will not honour a `next` that points off-site. `verifyState` returns
 *    only an internal path.
 *
 * New accounts are created as `student` — the lowest-privilege client role.
 * A role is NEVER read from anything Google sends.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!googleConfigured() || !authConfigured() || !isDatabaseConfigured()) {
    return fail(request, "unavailable");
  }

  const ip = clientIp(request);
  if (!rateLimit(`oauth:${ip}`, { limit: 12, windowMs: 15 * 60_000 }).ok) {
    return fail(request, "rate_limited");
  }

  if (url.searchParams.get("error")) return fail(request, "cancelled");

  const state = verifyState(url.searchParams.get("state"));
  if (!state.ok) return fail(request, "state");

  const code = url.searchParams.get("code");
  if (!code) return fail(request, "no_code");

  const identity = await exchangeCode(code);
  if (!identity) return fail(request, "exchange");
  if (!identity.emailVerified) return fail(request, "unverified");

  // 1. Known Google identity → sign in.
  let user = await usersRepo.findByOauthSubject("google", identity.subject);

  // 2. No linked identity. Does the email already belong to someone?
  if (!user) {
    const existing = await usersRepo.findByEmail(identity.email);
    if (existing) {
      // Deliberately refused — see the header note on account takeover.
      await audit({
        action: "auth.login_failed",
        actorEmail: identity.email,
        meta: { reason: "oauth_email_collision" },
        ip,
      });
      return fail(request, "email_in_use");
    }

    // 3. Brand new — create a password-less account.
    user = await usersRepo.createOauthUser({
      email: identity.email,
      name: identity.name,
      provider: "google",
      subject: identity.subject,
      avatarUrl: identity.picture,
    });

    if (!user) return fail(request, "create_failed");

    await audit({
      action: "auth.register",
      actorId: user.id,
      actorEmail: user.email,
      meta: { provider: "google" },
      ip,
    });
  }

  if (user.status === "suspended") return fail(request, "suspended");

  await usersRepo.markLogin(user.id);

  /*
    The epoch has to be READ here, not assumed to be zero.

    This path signs in accounts that already exist, and any of them may have
    signed out or changed a password before — which leaves the column above
    zero. Minting a token without the current value would produce one that
    fails verification immediately, i.e. an endless bounce back to sign-in for
    exactly the returning users this flow is for.
  */
  const epoch = await usersRepo.sessionEpoch(user.id);

  const token = createToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    ep: epoch ?? undefined,
  });
  await setSessionCookie(token);

  await audit({
    action: "auth.login",
    actorId: user.id,
    actorEmail: user.email,
    meta: { provider: "google" },
    ip,
  });

  return NextResponse.redirect(new URL(state.next, request.url));
}
