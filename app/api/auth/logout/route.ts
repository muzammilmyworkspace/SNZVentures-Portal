import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth/session";
import { audit } from "@/lib/db/repos/audit";
import { revokeSessions } from "@/lib/db/repos/users";
import { clientIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (session) {
    await audit({
      action: "auth.logout",
      actorId: session.userId,
      actorEmail: session.email,
      ip: clientIp(request),
    });
  }
  /*
    SIGNING OUT ENDS THE SESSION EVERYWHERE, not just in this browser.

    Clearing the cookie only ever removed the token from the machine doing the
    signing out. The token itself stayed valid for its full seven days, so
    anyone holding a copy — a shared computer, a session left open somewhere —
    kept access, and the person who signed out had no way to remove them. That
    is the whole reason to press Sign out on a machine that isn't yours.

    So this is deliberately global rather than per-device. Signing out on a
    phone also ends the desktop session; that is a real cost, and it is the
    correct trade when the alternative is a sign-out that does not sign anyone
    out. A per-device version needs a session table, which is a larger change
    than the problem warrants today.
  */
  if (session) await revokeSessions(session.userId);

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
