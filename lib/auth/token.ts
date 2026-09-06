import { createHmac, timingSafeEqual } from "node:crypto";
import type { Session } from "./types";
import { SESSION_MAX_AGE_SECONDS } from "./constants.ts";

/**
 * SIGNING AND VERIFYING A SESSION TOKEN — WITH NO COOKIE, NO REQUEST, NO DB.
 * ---------------------------------------------------------------------------
 * Split out of session.ts so it can be exercised by `npm run verify:session`
 * without a Next.js request context. session.ts imports `cookies` from
 * `next/headers`, which does not resolve outside a Next.js runtime — a script
 * that merely imports it fails before a single assertion runs. Everything
 * that actually decides whether a token is valid lives here instead, where it
 * can be tested directly.
 *
 * ⚠ AUTH_SECRET must be set in production. Without it the server refuses to
 * issue or verify sessions rather than silently falling back to a known key —
 * a predictable signing key is the same as no authentication at all.
 */

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (needs 32+ chars). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return s;
}

/** True when the server is configured well enough to authenticate anyone. */
export function authConfigured(): boolean {
  const s = process.env.AUTH_SECRET;
  return Boolean(s && s.length >= 32);
}

const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

export function createToken(
  data: Omit<Session, "exp">,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS
): string {
  const session: Session = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const payload = b64url(Buffer.from(JSON.stringify(session)));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);

  let expectedBuf: Buffer;
  let providedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(sign(payload));
    providedBuf = Buffer.from(provided);
  } catch {
    return null;
  }
  if (expectedBuf.length !== providedBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, providedBuf)) return null;

  try {
    const session = JSON.parse(fromB64url(payload).toString()) as Session;
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}
