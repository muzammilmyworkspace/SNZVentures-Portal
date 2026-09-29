import { NextResponse } from "next/server";
import { getSession, createToken, setSessionCookie } from "@/lib/auth/session";
import { SESSION_IDLE_SECONDS } from "@/lib/auth/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * KEEP A SESSION ALIVE WHILE SOMEBODY IS ACTUALLY THERE.
 *
 * The session expires from inactivity now, so something has to say "still
 * here". This is that, called by SessionKeepalive from an open, visible tab.
 *
 * WHY NOT IN THE MIDDLEWARE, which sees every request and could do it without
 * a client at all: proxy.ts says plainly that it is not the security boundary
 * and may be hoisted to a CDN. A session that only stays alive while that
 * layer happens to execute would drop people mid-form the first time it was.
 *
 * WHY NOT ON PAGE RENDERS: a server component cannot set a cookie. Reading one
 * case file for forty minutes involves no navigation at all, and that reader
 * is exactly who must not be signed out.
 *
 * So the signal is a tab that is open and visible, which is also the closest
 * thing to the question actually being asked — is this person still here.
 */
export async function POST() {
  const session = await getSession();

  /*
    Expired or absent. A 401 rather than a redirect: the caller is a fetch from
    a page that is still on screen, and the component reloads to land the
    person on the sign-in screen with the reason visible.
  */
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session has ended." }, { status: 401 });
  }

  /*
    A VIEW-AS IS NEVER EXTENDED.

    It carries its own, much shorter cap, and the point of that cap is that
    stepping into somebody's account is temporary. Refreshing it from an open
    tab would quietly turn thirty minutes into the whole afternoon — the exact
    thing the short lifetime is there to prevent. Returning ok keeps the
    component quiet; the view-as ends on its own schedule.
  */
  if (session.impersonator) {
    return NextResponse.json({ ok: true, extended: false });
  }

  /*
    `abs` is passed straight back. createToken carries it through untouched, so
    the ceiling set at sign-in stays where it was however many times this runs
    — which is what stops an always-open tab becoming a permanent session.
  */
  await setSessionCookie(
    createToken({
      userId: session.userId,
      email: session.email,
      role: session.role,
      name: session.name,
      ep: session.ep,
      abs: session.abs,
    })
  );

  return NextResponse.json({
    ok: true,
    extended: true,
    idleSeconds: SESSION_IDLE_SECONDS,
  });
}
