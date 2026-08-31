import { NextResponse } from "next/server";
import * as store from "@/lib/auth/store";
import { verifyPassword } from "@/lib/auth/password";
import { createToken, setSessionCookie, authConfigured } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import { homeFor } from "@/lib/portal/roles";

export const runtime = "nodejs";

/**
 * A real scrypt hash of a random value. Verified when an account is not found
 * so that response timing does not reveal whether an email is registered.
 */
const DUMMY_HASH =
  "scrypt$65536$8$1$Y2FuYXJ5c2FsdHZhbHVlMDA$" +
  "M2E5ZDhjN2I2YTVmNGUzZDJjMWIwYTk4Nzc2NjU1NDQzMzIyMTEwMGZmZWVkZGNjYmJhYTk5ODg3NzY2NTU0NA";

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
  const limit = rateLimit(`login:${ip}`, { limit: 8, windowMs: 15 * 60_000 });
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

  const { email, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { ok: false, error: "Enter your email and password." },
      { status: 400 }
    );
  }

  const user = await store.findAuthByEmail(email);
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    /*
      THE REASON IS RECORDED SERVER-SIDE, and only there.

      This previously logged `auth.login_failed` with empty meta, so a
      succession of failures was indistinguishable from each other in the audit
      table — an operator with full database access still could not tell an
      unknown address from a mistyped password. A real lockout took a day to
      understand because of it.

      The reply to the BROWSER stays deliberately identical in every case: it
      must not reveal whether an address is registered, or an attacker can
      enumerate accounts one request at a time. Distinguishing them in a log
      only the operator can read carries none of that risk.
    */
    await audit({
      action: "auth.login_failed",
      actorId: user?.id ?? null,
      actorEmail: email.slice(0, 200),
      meta: {
        reason: !user
          ? "unknown_email"
          : user.passwordHash === null
            ? "account_has_no_password"
            : "wrong_password",
      },
      ip,
    });
    return NextResponse.json(
      { ok: false, error: "Those details don't match an account." },
      { status: 401 }
    );
  }

  if (user.status === "suspended") {
    await audit({
      action: "auth.login_failed",
      actorId: user.id,
      actorEmail: user.email,
      meta: { reason: "suspended" },
      ip,
    });
    return NextResponse.json(
      { ok: false, error: "This account has been suspended. Please contact us." },
      { status: 403 }
    );
  }

  await store.markLogin(user.id);
  await audit({
    action: "auth.login",
    actorId: user.id,
    actorEmail: user.email,
    meta: { role: user.role },
    ip,
  });

  await setSessionCookie(
    createToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      // Stamped so this session can be revoked later; see users.session_epoch.
      ep: user.sessionEpoch,
    })
  );

  /*
    The destination is decided HERE, from the role the server just verified.
    Returning it means the browser never has to guess where a role belongs, and
    never gets to choose — it follows what the server says.
  */
  return NextResponse.json({ ok: true, role: user.role, redirectTo: homeFor(user.role) });
}
