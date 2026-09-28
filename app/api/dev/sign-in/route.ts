import { NextResponse } from "next/server";
import * as store from "@/lib/auth/store";
import { createToken, setSessionCookie } from "@/lib/auth/session";
import { devSignInAllowed, DEV_ACCOUNTS } from "@/lib/auth/dev-signin";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";
import { homeFor } from "@/lib/portal/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign in as a seeded local account without a password.
 *
 * See lib/auth/dev-signin.ts for the three gates. They are checked HERE as
 * well as where the buttons are drawn, because hiding a control does not close
 * the route behind it — and of the two, this is the one that matters.
 *
 * A 404, not a 403: somewhere this is not allowed, this endpoint does not
 * exist, and saying "forbidden" would confirm that it does.
 */
export async function POST(request: Request) {
  if (!devSignInAllowed()) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { key } = (body ?? {}) as Record<string, unknown>;

  /*
    The email comes from the fixed list, never from the request. Taking it from
    the body would make this "sign me in as anyone", which is a different and
    much worse thing than "sign me in as one of three seeded test accounts".
  */
  const account = DEV_ACCOUNTS.find((a) => a.key === key);
  if (!account) {
    return NextResponse.json({ ok: false, error: "Unknown account." }, { status: 400 });
  }

  const user = await store.findAuthByEmail(account.email);
  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: `No local account for ${account.email}. Seed it with: npm run db:bootstrap -- --email ${account.email} --name "Test"`,
      },
      { status: 404 }
    );
  }

  await store.markLogin(user.id);

  /*
    Recorded like any other sign-in, with the method named. A local audit log
    that cannot tell a real sign-in from a bypassed one teaches you to read it
    wrong, and that habit does not stay local.
  */
  await audit({
    action: "auth.login",
    actorId: user.id,
    actorEmail: user.email,
    meta: { role: user.role, via: "dev_sign_in" },
    ip: clientIp(request),
  });

  await setSessionCookie(
    createToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      ep: user.sessionEpoch,
    })
  );

  return NextResponse.json({ ok: true, role: user.role, redirectTo: homeFor(user.role) });
}
