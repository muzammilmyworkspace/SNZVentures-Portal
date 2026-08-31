import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: { N?: number; r?: number; p?: number; maxmem?: number }
) => Promise<Buffer>;

/**
 * Password hashing — scrypt from node:crypto.
 *
 * scrypt is memory-hard and ships with Node, so there is no native build step
 * and no extra dependency. Parameters follow current OWASP guidance
 * (N=2^16, r=8, p=1). Stored format is self-describing so the cost can be
 * raised later and old hashes still verify:
 *
 *   scrypt$N$r$p$<salt-b64>$<hash-b64>
 *
 * Passwords are never logged, never returned, and never leave the server.
 */

const N = 65536; // 2^16
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 160 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, n, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");

    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAXMEM,
    });

    // Constant-time: length check first, then timingSafeEqual on equal buffers.
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * The minimum is FOUR CHARACTERS, and the composition rules are gone.
 *
 * This was ten characters plus "one letter" plus "one number or symbol". It
 * was lowered on request so short passwords can be used to open an account.
 * The composition rules had to go with it: keeping them would have rejected
 * `1234` for containing no letter, so changing the length alone would not have
 * allowed the passwords this change exists to allow.
 *
 * ⚠ WHAT THIS COSTS, recorded here so the decision stays visible to whoever
 * reads this next rather than being rediscovered afterwards. This portal holds
 * passport scans, financial documents and immigration paperwork. A
 * four-character password of lowercase letters and digits is one of about 1.7
 * million — seconds of work for anyone who ever obtains the password table.
 * Online, guessing is held back only by the rate limiter, which is per-instance
 * on Vercel and so looser in production than it looks.
 *
 * WHAT STILL PROTECTS ACCOUNTS:
 *   • Hashing is unchanged — scrypt at OWASP parameters, so a stolen table is
 *     still expensive to attack, just far less expensive than it was.
 *   • Sign-in is rate limited (8 attempts per 15 minutes per IP).
 *   • The 200-character ceiling stays. It is not a strength rule; it stops a
 *     megabyte-long input turning one sign-in into a memory-hard
 *     denial-of-service against the server.
 *
 * If this is revisited, the middle ground is keeping a strong policy for staff
 * and admin accounts — those can read every client's documents — while leaving
 * clients free to choose. Every rule is in this one function, so that is a
 * small change.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 4) return "Use at least 4 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}
