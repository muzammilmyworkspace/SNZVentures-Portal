-- ---------------------------------------------------------------------------
-- SETTING UP AN ACCOUNT IS NOT THE SAME AS RESETTING A PASSWORD.
--
-- A new consultant was sent a `password_reset` token, because choosing a first
-- password and choosing a replacement both end at the same screen. They are
-- not the same act, and the difference matters the moment onboarding asks for
-- anything beyond a password: somebody who has simply forgotten theirs must
-- not be made to re-enter a company address to get back in.
--
-- One token kind cannot tell those two apart, so this adds the kind that can.
-- `/set-up` accepts only this one and `/reset-password` only the old one, which
-- also means a setup link cannot be used as a bare password reset that skips
-- the details, and a reset link cannot be turned into a second onboarding.
--
-- Nothing is migrated. Tokens live for hours or days and are single-use; any
-- outstanding `password_reset` still works exactly as it did, and the next
-- consultant created gets the new kind.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TABLE user_tokens DROP CONSTRAINT IF EXISTS user_tokens_kind_check;
  ALTER TABLE user_tokens
    ADD CONSTRAINT user_tokens_kind_check
    CHECK (kind IN ('email_verify', 'password_reset', 'email_change', 'mcp', 'account_setup'));
END
$$;

COMMENT ON COLUMN user_tokens.kind IS
  'What the token authorises. account_setup is a first sign-in: it collects '
  'contact details as well as a password, and is issued only when an account '
  'is created for somebody.';
