-- ---------------------------------------------------------------------------
-- CHANGING THE ADDRESS YOU SIGN IN WITH.
--
-- The address is only replaced once the NEW one has been proved, so the
-- pending value has to live somewhere until then. It goes on the token rather
-- than on `users`, which keeps the account row true at all times: there is no
-- window in which a user has an email they have not confirmed, and abandoning
-- the change leaves nothing behind to clean up.
--
-- `payload` is deliberately general rather than `pending_email`. A token that
-- carries a value with it is a shape this table will want again, and a column
-- named for one use is a column the next use has to work around.
-- ---------------------------------------------------------------------------

ALTER TABLE user_tokens
  ADD COLUMN IF NOT EXISTS payload TEXT;

-- The `kind` CHECK was written as a literal list, so a new kind cannot simply
-- be inserted. The constraint is found by what it is rather than by a name
-- Postgres generated, because that name is not guaranteed across databases —
-- and this migration has to apply to the throwaway one db:verify builds as
-- well as to production.
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
    CHECK (kind IN ('email_verify', 'password_reset', 'email_change'));
END
$$;

COMMENT ON COLUMN user_tokens.payload IS
  'What the token is for, when it needs a value: the new address for an '
  'email_change. Held here rather than on users so the account row is never '
  'carrying an address nobody has proved.';
