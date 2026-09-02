import { randomBytes } from "node:crypto";
import { db, safeQuery } from "../client";
import type { Role } from "@/lib/auth/types";
import {
  sha256,
  ACCESS_TTL_SECONDS,
  CODE_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
} from "@/lib/oauth/server";

/**
 * OAUTH STORAGE.
 * ---------------------------------------------------------------------------
 * Every secret in here is stored as a SHA-256 digest and compared by looking
 * the digest up in a unique index. Nothing is ever selected back out in the
 * clear, so a copy of this database is not a set of working credentials.
 *
 * The same rule as personal keys applies to every token: THE ACCOUNT IS
 * RE-CHECKED ON USE, not merely when the token was granted. Somebody
 * suspended, or dropped below admin, loses access at that moment rather than
 * whenever their token happens to expire.
 */

/** Who may grant access to the portal through OAuth. */
const ALLOWED_ROLES: Role[] = ["admin", "super_admin"];

const secret = (bytes = 32) => randomBytes(bytes).toString("base64url");

/* ------------------------------------------------------------- clients --- */

export type OAuthClient = {
  id: string;
  name: string;
  redirectUris: string[];
  hasSecret: boolean;
};

/*
  The secret hash is turned into a boolean BY POSTGRES and never selected.

  Only `hasSecret` is ever needed — whether to demand client authentication —
  and loading the digest to compute that would put a stored secret in
  application memory, where it can reach a log line or an error dump. Asking
  the database the question instead means it never leaves the table.
*/
const mapClient = (r: Record<string, unknown>): OAuthClient => ({
  id: String(r.id),
  name: String(r.name),
  redirectUris: (r.redirect_uris ?? []) as string[],
  hasSecret: Boolean(r.has_secret),
});

/**
 * Dynamic client registration (RFC 7591).
 *
 * Open by design, and that is not the hole it looks like. Registering only
 * says "this client id maps to these redirect URIs" — it grants nothing. A
 * token still requires a person to sign in to the portal as an admin and press
 * Approve, and the code still only travels to a URI registered here. What
 * registration buys is that nobody has to create a client by hand before
 * connecting.
 */
export async function registerClient(input: {
  name: string;
  redirectUris: string[];
  /** Confidential clients only. Claude registers as public and sends none. */
  wantsSecret: boolean;
}): Promise<{ client: OAuthClient; secret: string | null }> {
  const id = `snzc_${secret(18)}`;
  const raw = input.wantsSecret ? secret(32) : null;

  const [row] = await db()`
    INSERT INTO oauth_clients (id, name, secret_hash, redirect_uris)
    VALUES (${id}, ${input.name.slice(0, 120) || "Unnamed client"},
            ${raw ? sha256(raw) : null}, ${input.redirectUris})
    RETURNING id, name, (secret_hash IS NOT NULL) AS has_secret, redirect_uris
  `;

  return { client: mapClient(row), secret: raw };
}

export async function getClient(id: string): Promise<OAuthClient | null> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT id, name, (secret_hash IS NOT NULL) AS has_secret, redirect_uris
        FROM oauth_clients WHERE id = ${id} LIMIT 1
    `;
    return rows[0] ? mapClient(rows[0]) : null;
  }, null);
}

/** Confirms a confidential client's secret, by hash. */
export async function clientSecretMatches(id: string, presented: string): Promise<boolean> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT 1 FROM oauth_clients WHERE id = ${id} AND secret_hash = ${sha256(presented)} LIMIT 1
    `;
    return rows.length > 0;
  }, false);
}

/* --------------------------------------------------------------- codes --- */

export async function createCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  scope: string;
}): Promise<string> {
  const raw = secret(32);
  const expires = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

  await db()`
    INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge,
                             resource, scope, expires_at)
    VALUES (${sha256(raw)}, ${input.clientId}, ${input.userId}, ${input.redirectUri},
            ${input.codeChallenge}, ${input.resource}, ${input.scope}, ${expires})
  `;

  return raw;
}

export type ConsumedCode = {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  scope: string;
};

/**
 * Redeems a code, once.
 *
 * SINGLE USE IS ENFORCED BY THE DATABASE, not by reading and then writing.
 * `UPDATE … WHERE used_at IS NULL RETURNING` means two simultaneous requests
 * with the same code produce exactly one winner: the second updates no rows
 * and gets nothing back. A read-then-write would let both through, and a
 * replayed code is a second access token for whoever intercepted it.
 */
export async function consumeCode(raw: string): Promise<ConsumedCode | null> {
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE oauth_codes SET used_at = now()
       WHERE code_hash = ${sha256(raw)}
         AND used_at IS NULL
         AND expires_at > now()
       RETURNING client_id, user_id, redirect_uri, code_challenge, resource, scope
    `;
    const r = rows[0];
    if (!r) return null;
    return {
      clientId: String(r.client_id),
      userId: String(r.user_id),
      redirectUri: String(r.redirect_uri),
      codeChallenge: String(r.code_challenge),
      resource: r.resource ? String(r.resource) : null,
      scope: String(r.scope ?? ""),
    };
  }, null);
}

/* -------------------------------------------------------------- tokens --- */

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
};

/**
 * Mints an access token, and a refresh token when offline access was granted.
 *
 * `parentId` chains a rotated refresh token to the one it replaced, which is
 * what makes reuse detectable later.
 */
export async function issueTokens(input: {
  clientId: string;
  userId: string;
  resource: string | null;
  scope: string;
  withRefresh: boolean;
  parentId?: string | null;
}): Promise<IssuedTokens> {
  const access = secret(32);
  const refresh = input.withRefresh ? secret(32) : null;

  await db()`
    INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, resource, scope, expires_at)
    VALUES (${sha256(access)}, 'access', ${input.clientId}, ${input.userId},
            ${input.resource}, ${input.scope},
            ${new Date(Date.now() + ACCESS_TTL_SECONDS * 1000)})
  `;

  if (refresh) {
    await db()`
      INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, resource, scope,
                                expires_at, parent_id)
      VALUES (${sha256(refresh)}, 'refresh', ${input.clientId}, ${input.userId},
              ${input.resource}, ${input.scope},
              ${new Date(Date.now() + REFRESH_TTL_SECONDS * 1000)},
              ${input.parentId ?? null})
    `;
  }

  return {
    accessToken: access,
    refreshToken: refresh,
    expiresIn: ACCESS_TTL_SECONDS,
    scope: input.scope,
  };
}

export type TokenIdentity = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  clientId: string;
  resource: string | null;
  scope: string;
  tokenId: string;
};

/**
 * Resolves an access token to the person it was granted by.
 *
 * The join is the security, exactly as it is for personal keys: an account
 * that is no longer active, or no longer holds an allowed role, resolves to
 * nothing regardless of how valid the token itself is.
 */
export async function verifyAccessToken(raw: string): Promise<TokenIdentity | null> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT t.id AS token_id, t.client_id, t.resource, t.scope,
             u.id, u.email, u.name, u.role::text AS role
        FROM oauth_tokens t
        JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ${sha256(raw)}
         AND t.kind = 'access'
         AND t.revoked_at IS NULL
         AND t.expires_at > now()
         AND u.status = 'active'
         AND u.role::text = ANY(${ALLOWED_ROLES as unknown as string[]}::text[])
       LIMIT 1
    `;
    const r = rows[0];
    if (!r) return null;
    return {
      userId: String(r.id),
      email: String(r.email),
      name: String(r.name),
      role: r.role as Role,
      clientId: String(r.client_id),
      resource: r.resource ? String(r.resource) : null,
      scope: String(r.scope ?? ""),
      tokenId: String(r.token_id),
    };
  }, null);
}

export type RefreshOutcome =
  | { kind: "ok"; row: { id: string; clientId: string; userId: string; resource: string | null; scope: string } }
  /** Carries the id so the caller can revoke the chain it sits in. */
  | { kind: "reused"; id: string }
  | { kind: "invalid" };

/**
 * Looks up a refresh token and says which of three things it is.
 *
 * "Reused" is the one that matters. A refresh token presented after it has
 * already been rotated away means two parties hold it, and only one of them
 * should — the legitimate client always has the newest one. That is theft, not
 * a retry, so the caller revokes the whole chain: it ends the attacker's
 * access and the victim's together, and losing a connection is the correct
 * price. Letting both continue quietly is not.
 */
export async function findRefresh(raw: string): Promise<RefreshOutcome> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT t.id, t.client_id, t.user_id, t.resource, t.scope,
             t.revoked_at, (t.expires_at > now()) AS live,
             u.status::text AS status, u.role::text AS role
        FROM oauth_tokens t
        JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ${sha256(raw)} AND t.kind = 'refresh'
       LIMIT 1
    `;
    const r = rows[0];
    if (!r) return { kind: "invalid" } as RefreshOutcome;
    if (r.revoked_at) return { kind: "reused", id: String(r.id) } as RefreshOutcome;
    if (!r.live) return { kind: "invalid" } as RefreshOutcome;
    if (r.status !== "active" || !ALLOWED_ROLES.includes(r.role as Role)) {
      return { kind: "invalid" } as RefreshOutcome;
    }
    return {
      kind: "ok",
      row: {
        id: String(r.id),
        clientId: String(r.client_id),
        userId: String(r.user_id),
        resource: r.resource ? String(r.resource) : null,
        scope: String(r.scope ?? ""),
      },
    } as RefreshOutcome;
  }, { kind: "invalid" } as RefreshOutcome);
}

/** Ends one refresh token, having just replaced it. */
export async function revokeToken(id: string): Promise<void> {
  await safeQuery(async () => {
    await db()`UPDATE oauth_tokens SET revoked_at = now() WHERE id = ${id} AND revoked_at IS NULL`;
    return true;
  }, false);
}

/**
 * Ends every token descended from or ancestral to this one.
 *
 * Walked with a recursive CTE in BOTH directions, because the token presented
 * may be anywhere in the chain: an attacker who stole an old refresh token is
 * at the top, and the legitimate client holding the newest is at the bottom.
 * Revoking only downwards would leave the thief's branch alive.
 */
export async function revokeChain(id: string): Promise<number> {
  return safeQuery(async () => {
    const rows = await db()`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id FROM oauth_tokens WHERE id = ${id}
        UNION
        SELECT t.id, t.parent_id FROM oauth_tokens t
          JOIN chain c ON t.parent_id = c.id OR t.id = c.parent_id
      )
      UPDATE oauth_tokens SET revoked_at = now()
       WHERE id IN (SELECT id FROM chain) AND revoked_at IS NULL
       RETURNING id
    `;
    return rows.length;
  }, 0);
}

/** Stamped after a call, through `after()`, so it never delays an answer. */
export async function touchToken(id: string): Promise<void> {
  await safeQuery(async () => {
    await db()`UPDATE oauth_tokens SET last_used_at = now() WHERE id = ${id}`;
    return true;
  }, false);
}

/* ------------------------------------------------- what a person granted --- */

export type Grant = {
  clientId: string;
  clientName: string;
  scope: string;
  grantedAt: string;
  lastUsedAt: string | null;
};

/**
 * The connections a person has approved, one row per client rather than per
 * token — somebody who has been connected a month has dozens of rotated
 * refresh tokens and one connection, and a list showing the tokens would be
 * unreadable and unactionable.
 */
export async function grantsFor(userId: string): Promise<Grant[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT c.id, c.name, min(t.created_at) AS granted_at,
             max(t.last_used_at) AS last_used_at,
             max(t.scope) AS scope
        FROM oauth_tokens t
        JOIN oauth_clients c ON c.id = t.client_id
       WHERE t.user_id = ${userId} AND t.revoked_at IS NULL AND t.expires_at > now()
       GROUP BY c.id, c.name
       ORDER BY min(t.created_at) DESC
    `;
    return rows.map((r) => ({
      clientId: String(r.id),
      clientName: String(r.name),
      scope: String(r.scope ?? ""),
      grantedAt: new Date(r.granted_at as string).toISOString(),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at as string).toISOString() : null,
    }));
  }, []);
}

/** Withdraws a whole connection: every token this client holds for this person. */
export async function revokeGrant(userId: string, clientId: string): Promise<number> {
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE oauth_tokens SET revoked_at = now()
       WHERE user_id = ${userId} AND client_id = ${clientId} AND revoked_at IS NULL
       RETURNING id
    `;
    return rows.length;
  }, 0);
}

export { ALLOWED_ROLES };
