import { createHash, randomBytes } from "node:crypto";
import { db, isDatabaseConfigured, safeQuery } from "@/lib/db/client";
import * as usersRepo from "@/lib/db/repos/users";
import * as profilesRepo from "@/lib/db/repos/profiles";
import type { Role } from "./types";

/**
 * USER STORE — PostgreSQL.
 *
 * The previous JSON-file adapter has been removed: it was never safe for
 * production (non-transactional, single-instance, and wiped on every Vercel
 * deploy because the filesystem is ephemeral).
 *
 * `isStoreReady()` reports whether DATABASE_URL is present. Auth routes check
 * it and return a clear 503 rather than throwing, so a deployment that is
 * missing the variable degrades honestly instead of 500-ing.
 */

export function isStoreReady(): boolean {
  return isDatabaseConfigured();
}

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: "active" | "suspended" | "pending";
  emailVerified: boolean;
  createdAt: string;
  profile: Record<string, string>;
};

export async function findByEmail(email: string) {
  return usersRepo.findByEmail(email);
}

export async function findById(id: string): Promise<StoredUser | null> {
  const user = await usersRepo.findById(id);
  if (!user) return null;
  const profile = await profilesRepo.getProfile(user.id, user.role);
  return { ...user, profile };
}

export async function findAuthByEmail(email: string) {
  return usersRepo.findAuthByEmail(email);
}

export async function createUser(input: {
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
}) {
  return usersRepo.createUser(input);
}

export async function saveProfile(
  userId: string,
  role: Role,
  patch: Record<string, string>
) {
  await profilesRepo.saveProfile(userId, role, patch);
}

export async function getProfile(userId: string, role: Role) {
  return profilesRepo.getProfile(userId, role);
}

export const setPasswordHash = usersRepo.setPasswordHash;
export const markLogin = usersRepo.markLogin;
export const setEmailVerified = usersRepo.setEmailVerified;

/* ------------------------------------------------------- one-time tokens */

/**
 * Verification / reset tokens.
 *
 * Only a SHA-256 hash of the token is stored, so a database leak cannot be
 * replayed to take over accounts. Tokens are single-use and time-limited.
 */

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export async function issueToken(
  userId: string,
  kind: "email_verify" | "password_reset",
  ttlMinutes: number
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + ttlMinutes * 60_000);

  // Invalidate any outstanding token of the same kind.
  await db()`
    UPDATE user_tokens SET used_at = now()
    WHERE user_id = ${userId} AND kind = ${kind} AND used_at IS NULL
  `;
  await db()`
    INSERT INTO user_tokens (user_id, kind, token_hash, expires_at)
    VALUES (${userId}, ${kind}, ${hashToken(raw)}, ${expires})
  `;
  return raw;
}

/**
 * Is this token still usable? Checked WITHOUT consuming it.
 *
 * The reset page rendered its form for any token at all, so a link that had
 * already been used looked perfectly functional — you only discovered it was
 * dead after choosing and confirming a new password. The API refused it
 * correctly, so nothing was ever insecure; it was simply a wasted minute and a
 * confusing failure at the worst moment.
 *
 * Deliberately separate from `consumeToken`: this must not mark anything used,
 * or merely LOADING the page would burn the link.
 */
export async function isTokenValid(
  raw: string,
  kind: "email_verify" | "password_reset"
): Promise<boolean> {
  if (!isDatabaseConfigured() || !raw) return false;
  return safeQuery(async () => {
    const rows = await db()`
      SELECT 1 FROM user_tokens
      WHERE token_hash = ${hashToken(raw)}
        AND kind = ${kind}
        AND used_at IS NULL
        AND expires_at > now()
      LIMIT 1
    `;
    return rows.length > 0;
  }, false);
}

export async function consumeToken(
  raw: string,
  kind: "email_verify" | "password_reset"
): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  const rows = await db()`
    UPDATE user_tokens SET used_at = now()
    WHERE token_hash = ${hashToken(raw)}
      AND kind = ${kind}
      AND used_at IS NULL
      AND expires_at > now()
    RETURNING user_id
  `;
  return rows[0] ? String(rows[0].user_id) : null;
}
