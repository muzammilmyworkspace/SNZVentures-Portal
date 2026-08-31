import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../env.ts";

/**
 * ENCRYPTING A CREDENTIAL WE HAVE TO KEEP.
 * ---------------------------------------------------------------------------
 * Passwords are hashed, because we never need them back. A Google refresh
 * token is the opposite: it is useless unless it can be read again. So it is
 * ENCRYPTED, not hashed, and the distinction matters — anyone who confuses the
 * two ends up storing a credential in the clear because "hashing broke it".
 *
 * WHY BOTHER, when the database is already private. Because a long-lived token
 * to a Google account holding client passports has a much longer blast radius
 * than a row of application answers. A database dump on a laptop, a backup in
 * the wrong bucket, or read access granted to somebody for an afternoon should
 * not be a route to the firm's Drive. Encrypting it means the database alone
 * is not enough — you also need the deployment's AUTH_SECRET.
 *
 * AES-256-GCM, so tampering is detected rather than silently decrypted into
 * something else. The key is derived from AUTH_SECRET with scrypt and a fixed
 * salt: fixed because the same secret must always produce the same key, and
 * the secret is already high-entropy, which is what a salt is for.
 *
 * ROTATING AUTH_SECRET makes anything sealed with the old one unreadable. That
 * is the correct behaviour, and the admin screen handles it the only sensible
 * way: the connection reads as broken and is reconnected in two clicks.
 */

const SALT = "snz-drive-v1";

function key(): Buffer {
  const secret = env("AUTH_SECRET");
  if (!secret) throw new Error("AUTH_SECRET is not set, so credentials cannot be sealed.");
  return scryptSync(secret, SALT, 32);
}

/** iv.tag.ciphertext, base64url, in one string. */
export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, body].map((b) => b.toString("base64url")).join(".");
}

/** Null when it cannot be opened — a wrong key, or tampering. Never throws. */
export function open(sealed: string): string | null {
  try {
    const [ivB64, tagB64, bodyB64] = sealed.split(".");
    if (!ivB64 || !tagB64 || !bodyB64) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(bodyB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    /*
      A failure here is expected after AUTH_SECRET is rotated, and it must not
      take a page down. The caller treats null as "not connected", which is
      both true and actionable.
    */
    return null;
  }
}
