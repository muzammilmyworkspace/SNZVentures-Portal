import { createHash, randomBytes } from "node:crypto";
import { db, safeQuery } from "../client";
import type { Role } from "@/lib/auth/types";

/**
 * PERSONAL KEYS FOR THE MCP ENDPOINT.
 * ---------------------------------------------------------------------------
 * One per person, per machine if they want. The endpoint they open can read
 * every client's file, so three properties matter more than convenience:
 *
 *   • ONLY THE HASH IS KEPT. The key is returned once, from `issue`, and there
 *     is no query in this file that could hand it back. A secret readable out
 *     of the database is one that leaks with a backup.
 *   • THE OWNER IS RE-CHECKED ON EVERY CALL, not just at creation. Suspending
 *     somebody or dropping their role has to end their access immediately —
 *     otherwise revoking an account leaves a working key behind it, which is
 *     exactly the door nobody remembers to close.
 *   • REVOCATION IS PER PERSON. Withdrawing one key leaves everyone else's
 *     working, which is the whole reason these exist rather than the single
 *     shared environment token.
 */

/** Who may hold one. Anyone who can already read this data in the admin area. */
const ALLOWED_ROLES: Role[] = ["admin", "super_admin"];

/**
 * A year. Long enough not to be a nuisance, short enough that a key forgotten
 * on a laptop somebody no longer uses does not work indefinitely.
 */
const LIFETIME_DAYS = 365;

/**
 * Prefixed so it is recognisable on sight. A 43-character string in a config
 * file tells nobody what it opens; `snzmcp_…` in a screenshot or a support
 * message is immediately identifiable as a key for this, and worth revoking.
 */
const PREFIX = "snzmcp_";

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export type McpToken = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
};

const map = (r: Record<string, unknown>): McpToken => ({
  id: String(r.id),
  label: r.payload ? String(r.payload) : "Unnamed",
  createdAt: new Date(r.created_at as string).toISOString(),
  expiresAt: new Date(r.expires_at as string).toISOString(),
  lastUsedAt: r.last_used_at ? new Date(r.last_used_at as string).toISOString() : null,
});

/**
 * Creates a key and returns it in the clear — the only time it exists outside
 * a hash.
 *
 * Deliberately NOT wrapped in safeQuery. A failure here must reach the person
 * pressing the button: the alternative is a screen that shows no new key and
 * no error, and somebody pressing it again until they have six.
 */
export async function issue(
  userId: string,
  label: string
): Promise<{ token: string; row: McpToken }> {
  const raw = PREFIX + randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + LIFETIME_DAYS * 86_400_000);

  const [row] = await db()`
    INSERT INTO user_tokens (user_id, kind, token_hash, expires_at, payload)
    VALUES (${userId}, 'mcp', ${hashToken(raw)}, ${expires}, ${label.trim().slice(0, 60) || "Unnamed"})
    RETURNING id, payload, created_at, expires_at, last_used_at
  `;

  return { token: raw, row: map(row) };
}

export type McpIdentity = { userId: string; email: string; name: string; role: Role; tokenId: string };

/**
 * Resolves a presented key to the person who holds it, or null.
 *
 * The lookup is by hash, which is a unique index — so this is one indexed
 * probe rather than a scan, and no comparison is made against a value an
 * attacker controls the length of.
 *
 * THE JOIN IS THE POINT. The key alone is not enough: the account must still
 * be active and still hold a role allowed to have one. A member of staff who
 * left last week has a suspended account, and their key stops the moment it
 * is suspended rather than in a year when it expires.
 */
export async function verify(raw: string): Promise<McpIdentity | null> {
  if (!raw.startsWith(PREFIX)) return null;

  return safeQuery(async () => {
    const [row] = await db()`
      SELECT t.id AS token_id, u.id, u.email, u.name, u.role::text AS role
        FROM user_tokens t
        JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ${hashToken(raw)}
         AND t.kind = 'mcp'
         AND t.used_at IS NULL
         AND t.expires_at > now()
         AND u.status = 'active'
         AND u.role::text = ANY(${ALLOWED_ROLES as unknown as string[]}::text[])
       LIMIT 1
    `;
    if (!row) return null;

    return {
      userId: String(row.id),
      email: String(row.email),
      name: String(row.name),
      role: row.role as Role,
      tokenId: String(row.token_id),
    };
  }, null);
}

/**
 * Records that a key was used, without holding the request up for it.
 *
 * Its own statement rather than part of `verify`, so a write that fails or is
 * slow cannot stop somebody reading. Called through `after()` at the route.
 */
export async function touch(tokenId: string): Promise<void> {
  await safeQuery(async () => {
    await db()`UPDATE user_tokens SET last_used_at = now() WHERE id = ${tokenId}`;
    return true;
  }, false);
}

/** A person's live keys. The hash is never selected, so it cannot leak here. */
export async function list(userId: string): Promise<McpToken[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT id, payload, created_at, expires_at, last_used_at
        FROM user_tokens
       WHERE user_id = ${userId} AND kind = 'mcp'
         AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 20
    `;
    return rows.map(map);
  }, []);
}

/**
 * Withdraws one key.
 *
 * Scoped to the owner in the WHERE clause, not checked beforehand: an admin
 * cannot revoke another admin's key by guessing its id, and the check cannot
 * be forgotten by a later caller because there is no version of this query
 * without it. Marked used rather than deleted, so the row survives as a record
 * that the key existed.
 */
export async function revoke(id: string, userId: string): Promise<boolean> {
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE user_tokens SET used_at = now()
       WHERE id = ${id} AND user_id = ${userId} AND kind = 'mcp' AND used_at IS NULL
       RETURNING id
    `;
    return rows.length > 0;
  }, false);
}

export { ALLOWED_ROLES, LIFETIME_DAYS, PREFIX };
