import { NextResponse } from "next/server";
import { SESSION_COOKIE, CSRF_COOKIE } from "@/lib/auth/constants";

export const runtime = "nodejs";

/**
 * Throws away a cookie that no longer buys anything, then sends the visitor to
 * sign in.
 *
 * WHY THIS IS A ROUTE AND NOT JUST A REDIRECT
 * `proxy.ts` decides where to send people from the PRESENCE of the session
 * cookie, because it is explicitly not the security boundary and cannot verify
 * a signature. Pages decide from whether the session actually verifies. Those
 * two disagree for exactly one input: a cookie that exists but is no longer
 * good — expired, or revoked by signing out or changing a password.
 *
 * Left alone they argue forever. The page redirects to /login because the
 * session is invalid; the proxy sees a cookie and bounces back to /portal
 * because it looks signed in; the browser gives up with ERR_TOO_MANY_REDIRECTS
 * and the person cannot reach either the portal OR the sign-in screen. Which
 * is worse than the bug that made the session invalid in the first place.
 *
 * A Server Component cannot clear a cookie — only a route handler or an action
 * can — so the guard redirects here, this clears it, and the visitor arrives at
 * sign-in carrying nothing for the proxy to misread.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reason = url.searchParams.get("reason");
  const requested = url.searchParams.get("next");

  /*
    Only a same-site path is echoed back. `next` arrives in a URL, so treating
    it as a destination unchecked would turn this into an open redirect: a link
    to our own domain that lands somewhere else entirely, which is the shape
    every credential-phishing page wants to wear. A leading `//` or `/\` is a
    protocol-relative URL to another host, not a local path.
  */
  const safeNext =
    requested && /^\/(?![/\\])/.test(requested) ? requested : null;

  const target = new URL("/login", url.origin);
  if (safeNext) target.searchParams.set("next", safeNext);
  if (reason === "suspended") target.searchParams.set("suspended", "1");
  else target.searchParams.set("expired", "1");

  const response = NextResponse.redirect(target);

  for (const name of [SESSION_COOKIE, CSRF_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: name === SESSION_COOKIE,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
