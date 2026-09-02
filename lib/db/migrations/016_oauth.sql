-- ---------------------------------------------------------------------------
-- AN OAUTH AUTHORIZATION SERVER, BECAUSE CLAUDE.AI CANNOT HOLD A KEY.
--
-- Claude Code can send a header, so a personal key (015) is enough there. The
-- hosted surfaces — claude.ai in a browser, the desktop app, the phone —
-- cannot: the connection is made from Anthropic's servers, and the only
-- credential they will carry is one obtained through OAuth with the person's
-- consent. So the portal has to be able to issue one.
--
-- THREE TABLES, EACH FOR A DIFFERENT LIFETIME.
--
--   oauth_clients — who may ask. Claude registers itself dynamically (RFC
--                   7591) on first connection, so this fills itself in.
--   oauth_codes   — the few seconds between somebody pressing Approve and the
--                   client exchanging the code. Single use, and the PKCE
--                   challenge lives here because that is the only place it can
--                   be compared against the verifier presented later.
--   oauth_tokens  — access and refresh, both stored as hashes.
--
-- NOTHING HERE STORES A SECRET IN THE CLEAR. Codes, access tokens, refresh
-- tokens and client secrets are all held as SHA-256 digests, so a copy of this
-- database is not a set of working credentials.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS oauth_clients (
  -- The client_id itself, which we mint. Text rather than UUID because a CIMD
  -- client identifies itself with a URL, and this table should not have to
  -- change shape to hold one later.
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  -- Null for a public client. Claude registers as one — a browser-side client
  -- cannot keep a secret — which is exactly why PKCE is not optional below.
  secret_hash   TEXT,
  -- Exact strings. An authorization server that pattern-matches redirect URIs
  -- is one that can be talked into sending a code to somebody else's site.
  redirect_uris TEXT[] NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash      TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Recorded so the token request can be checked against the SAME value the
  -- code was issued for. A code issued for one redirect and redeemed against
  -- another is the classic interception route.
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  -- What the token will be usable at. Carried from the authorization request
  -- (RFC 8707) so the access token is bound to this MCP server and cannot be
  -- replayed against a different one.
  resource       TEXT,
  scope          TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_codes_expiry_idx ON oauth_codes (expires_at);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   TEXT NOT NULL UNIQUE,
  kind         TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  client_id    TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource     TEXT,
  scope        TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  -- REFRESH ROTATION, AND HOW A STOLEN TOKEN IS CAUGHT.
  --
  -- Each refresh is replaced on use and the old one revoked. `parent_id`
  -- chains them, so when a refresh token that has ALREADY been rotated is
  -- presented, that is not a retry — it means two parties hold the same token
  -- and one of them should not. The whole chain is then revoked, which ends
  -- the thief's access and the victim's together. Losing a session is the
  -- correct outcome; silently letting both continue is not.
  parent_id    UUID REFERENCES oauth_tokens(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS oauth_tokens_user_idx ON oauth_tokens (user_id, kind);
CREATE INDEX IF NOT EXISTS oauth_tokens_parent_idx ON oauth_tokens (parent_id);

COMMENT ON TABLE oauth_clients IS
  'OAuth clients allowed to ask for access, filled in by dynamic registration.';
COMMENT ON TABLE oauth_codes IS
  'Authorization codes: single use, minutes long, carrying the PKCE challenge.';
COMMENT ON TABLE oauth_tokens IS
  'Access and refresh tokens, stored as SHA-256 digests and never in the clear.';
