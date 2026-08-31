import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Route protection for the PORTAL ORIGIN.
 *
 * Formerly middleware.ts. Next 16 renamed the convention to `proxy` and the
 * old name is deprecated — the rename also means this now defaults to the
 * Node.js runtime rather than Edge.
 *
 * That does NOT make it the security boundary, and nothing here should start
 * treating it as one. It only checks for the PRESENCE of a session cookie so
 * an unauthenticated visitor is redirected before a page renders; a cookie's
 * presence says nothing about its signature. The real check is verification in
 * `getSession()`, which every portal page and API route performs. Next's own
 * guidance is that this layer may be hoisted to a CDN, so it must never hold
 * logic the app depends on for authorisation.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO `PORTAL_ONLY` FLAG HERE ANY MORE
 *
 * In the combined repo this behaviour sat behind an environment variable,
 * because one codebase served both the marketing site and the portal and had
 * to be told which one it was being. This repository is the portal, so the
 * answer is no longer conditional: `/` is the sign-in screen, and there are no
 * marketing routes to fall through to.
 *
 * A flag that can only ever hold one value is a flag someone will eventually
 * set wrong. Removing it means this origin cannot be misconfigured into
 * serving something it does not contain.
 */

const AUTH_SCREENS = ["/login", "/register", "/forgot-password"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // The root IS the portal here — signed in goes to the dashboard, everyone
  // else to sign-in. No marketing homepage exists on this origin.
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = hasCookie ? "/portal" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Portal requires a session.
  if (pathname.startsWith("/portal")) {
    if (!hasCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Signed-in users shouldn't land back on the auth screens.
  if (hasCookie && AUTH_SCREENS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Everything static is excluded so no asset pays for the check, and the
 * handler above returns immediately for normal requests.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|images/|brand/|fonts/|favicon|icon|apple-icon|manifest|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico|woff2?|txt|xml)$).*)",
  ],
};
