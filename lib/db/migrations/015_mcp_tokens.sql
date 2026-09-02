-- ---------------------------------------------------------------------------
-- A PERSONAL KEY FOR ASKING THE PORTAL QUESTIONS.
--
-- The MCP endpoint began with one token in an environment variable. That works
-- for one person and fails at two: a shared secret has no owner, so the audit
-- log records that a client's passport number was read and cannot say by whom;
-- it cannot be withdrawn from one person without cutting off everyone; and
-- changing it means a redeploy. None of those are noticed until the day they
-- matter.
--
-- These are per-person instead, and reuse `user_tokens` rather than adding a
-- table: the shape is identical — a hash, an owner, an expiry, a used marker —
-- and `payload`, added in 013 as a general column precisely so the next use
-- would not have to work around a name, carries the label.
--
-- ONLY THE HASH IS STORED. The token is shown once, at creation, and cannot be
-- recovered afterwards. A key that can be read back out of the database is one
-- that leaks with a database backup.
-- ---------------------------------------------------------------------------

-- When it was last used to ask something. The question this answers is "is
-- anybody still using this, or can I revoke it" — which without a timestamp
-- nobody can answer, so old keys accumulate forever rather than being tidied.
ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- The `kind` CHECK is a literal list, so a new kind cannot simply be inserted.
-- Found by shape rather than by name, because the name Postgres generated is
-- not guaranteed to match across databases — this has to apply both to
-- production and to the throwaway one db:verify builds.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'user_tokens'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%kind%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_tokens DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE user_tokens
    ADD CONSTRAINT user_tokens_kind_check
    CHECK (kind IN ('email_verify', 'password_reset', 'email_change', 'mcp'));
END
$$;

-- Every other kind here is single-use and short-lived; these are neither, and
-- a member of staff may hold one per machine. Listing a person's live keys is
-- therefore a query this table did not previously need to be fast at.
CREATE INDEX IF NOT EXISTS user_tokens_mcp_idx
  ON user_tokens (user_id, created_at DESC)
  WHERE kind = 'mcp';

COMMENT ON COLUMN user_tokens.last_used_at IS
  'When an mcp token last answered a question. Lets a stale key be recognised '
  'and withdrawn; null on every single-use kind.';
