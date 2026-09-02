import { createHash, timingSafeEqual } from "node:crypto";

/**
 * WHO IS ALLOWED TO ASK.
 * ---------------------------------------------------------------------------
 * Kept out of the route so it can be tested. The route imports `next/server`
 * and cannot be loaded by a plain script; this file imports nothing but
 * `node:crypto`, so the check that actually guards a student's passport number
 * is exercised rather than assumed.
 */

/**
 * Compares two secrets without leaking their length or contents through how
 * long the comparison takes.
 *
 * Both sides are hashed first so `timingSafeEqual` always sees equal-length
 * buffers. That is not tidiness: it throws on a length mismatch, and a throw
 * on the wrong length is itself a length oracle — an attacker learns the size
 * of the token from which requests error rather than fail.
 */
export function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * True when the Authorization header carries the expected bearer token.
 *
 * An absent `expected` is never a pass. The endpoint is off until a token is
 * configured, because a route that opens itself when a variable is missing is
 * one bad deploy away from being public — and empty environment variables are
 * the single bug this codebase has hit most (see lib/env.ts).
 */
export function checkToken(header: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  const presented = readBearer(header);
  if (!presented) return false;
  return sameSecret(presented, expected);
}

/**
 * The token out of an Authorization header, or null.
 *
 * Split out because a presented token is now one of two things — a personal
 * key looked up by hash, or the shared environment one compared byte for byte
 * — and both paths must read the header identically. Two parsers that drift
 * apart is how one of them starts accepting what the other refuses.
 */
export function readBearer(header: string | null): string | null {
  const match = /^Bearer[ \t]+(\S.*)$/i.exec((header ?? "").trim());
  return match ? match[1].trim() : null;
}

/**
 * Origins that are a legitimate client of this endpoint rather than a page
 * trying to reach it from somebody's tab.
 *
 * The hosted Claude surfaces connect from Anthropic's servers and normally
 * send no Origin at all. This is here so that if one ever does, the connector
 * does not fail with a 403 — a refusal for a reason nobody would think to
 * look for, on the one path that cannot simply be retried differently.
 */
const KNOWN_CLIENTS = new Set(["https://claude.ai", "https://claude.com"]);

/**
 * The transport spec requires servers to validate `Origin` against DNS
 * rebinding.
 *
 * A program sends none, so: no Origin is fine, our own is fine, a known Claude
 * surface is fine, and anything else is refused.
 *
 * This check is a formality on THIS endpoint and worth knowing as one — a
 * browser page cannot reach it usefully anyway, because it would need the
 * bearer credential to get past 401 and no CORS headers are returned for it to
 * read the answer. The rebinding attack the rule exists for is against servers
 * bound to localhost, which this is not.
 */
export function originAllowed(origin: string | null, selfUrl: string): boolean {
  if (!origin) return true;
  try {
    const asked = new URL(origin);
    if (KNOWN_CLIENTS.has(`${asked.protocol}//${asked.host}`)) return true;
    return asked.host === new URL(selfUrl).host;
  } catch {
    return false;
  }
}
