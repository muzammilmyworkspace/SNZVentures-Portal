import { timingSafeEqual, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import * as usersRepo from "@/lib/db/repos/users";
import type { Session, Role } from "./types";
import { SESSION_COOKIE, CSRF_COOKIE, SESSION_MAX_AGE_SECONDS } from "./constants";
import { authConfigured, createToken, verifyToken } from "./token";

/**
 * Stateless signed sessions.
 *
 * A compact HMAC-SHA256 token (`<payload-b64url>.<sig-b64url>`) stored in an
 * httpOnly cookie. No third-party dependency, no session table required.
 *
 * The signing and verification themselves live in `./token` — pulled out
 * because this file imports `cookies` from `next/headers`, which only
 * resolves inside a Next.js request. `npm run verify:session` exercises the
 * token logic directly, without needing that context.
 */

export { SESSION_COOKIE, CSRF_COOKIE, authConfigured, createToken, verifyToken };
const MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS;

/* ------------------------------------------------------------ cookie I/O */

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * The user's current session epoch, read at most once per request.
 *
 * `cache` is what keeps this affordable. `getSession()` is called by the page,
 * by its layout, and sometimes by a component underneath both; without
 * deduplication that is three round trips on a connection pool of one, which
 * is exactly the shape of starvation that took production down before. With
 * it, an authenticated request pays for one extra query and no more.
 */
const epochForRequest = cache(async (userId: string) => usersRepo.sessionEpoch(userId));

/**
 * Current session, or null. Safe to call from server components.
 *
 * A VALID SIGNATURE IS NO LONGER SUFFICIENT. The token is checked against the
 * user's session epoch, so signing out or changing a password genuinely ends
 * the session everywhere instead of only forgetting the cookie in one browser.
 *
 * Signing out previously did nothing a determined holder of the cookie would
 * notice: the token stayed cryptographically valid until it naturally
 * expired, on any machine that had a copy. That is fixed here, and it is
 * deliberately fixed HERE rather than in `proxy.ts` — the proxy may be
 * hoisted to a CDN and must never be what authorisation depends on.
 */
export async function getSession(): Promise<Session | null> {
  if (!authConfigured()) return null;
  const jar = await cookies();
  const session = verifyToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const current = await epochForRequest(session.userId);

  /*
    Null means the epoch could not be established, and that is a rejection —
    see `sessionEpoch`. Failing open would quietly reinstate exactly the
    sessions somebody went out of their way to revoke.
  */
  if (current === null) return null;

  // Tokens minted before the column existed carry no value and read as 0,
  // which matches the column default, so nobody is signed out by the deploy.
  if ((session.ep ?? 0) !== current) return null;

  return session;
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export function hasRole(session: Session | null, roles: Role[]): boolean {
  return Boolean(session && roles.includes(session.role));
}

/* ------------------------------------------------------------ CSRF token */

/**
 * Double-submit CSRF token. Cookie is readable by JS so the client can echo it
 * in a header; the server compares the two. Combined with SameSite=Lax this
 * covers form posts from other origins.
 */
export async function issueCsrfToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CSRF_COOKIE)?.value;
  if (existing) return existing;
  const token = randomBytes(24).toString("hex");
  jar.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return token;
}

export async function verifyCsrf(request: Request): Promise<boolean> {
  const jar = await cookies();
  const cookieToken = jar.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  return a.length === b.length && timingSafeEqual(a, b);
}
