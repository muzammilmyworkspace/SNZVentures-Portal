-- ---------------------------------------------------------------------------
-- 004 — Make sessions revocable.
--
-- ADDITIVE. One nullable-free column with a default, no rewrite of any
-- existing row, nothing dropped. 001–003 are applied to production and stay
-- exactly as they are.
--
-- WHY THIS EXISTS
-- Sessions were stateless signed tokens: a valid signature meant a valid
-- session, full stop. That is fast and needs no session table, but it also
-- means nothing on the server can ever take a session back. Signing out only
-- deleted the cookie from the browser doing the signing out; the token itself
-- stayed good for its full seven days. Anyone holding a copy — a shared
-- machine, a borrowed laptop, a session left open in a library — kept access,
-- and changing the password did not remove them either.
--
-- WHY A COUNTER AND NOT A TIMESTAMP
-- A "sessions valid from" timestamp has to be compared against the time the
-- token was issued, which means trusting two clocks to agree: the application
-- server's and the database's. They routinely differ by a second or more, and
-- the failure that produces — a token rejected immediately after being issued
-- — is intermittent and miserable to diagnose. A counter has no clock in it.
-- The token carries the value it was minted with; anything that should end a
-- session increments the column; the two either match or they do not.
--
-- DEFAULT 0 IS DELIBERATE. Tokens issued before this migration carry no
-- counter at all and are read as 0, so they match the default and keep
-- working. Deploying this does not sign everybody out mid-task.
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_epoch integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.session_epoch IS
  'Incremented to invalidate every existing session for this user. Sessions '
  'carry the value they were issued with; a mismatch is rejected at verification.';
