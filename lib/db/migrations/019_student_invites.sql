-- ---------------------------------------------------------------------------
-- A CONSULTANT BRINGS A STUDENT, AND THE LINK IS THE PROOF.
--
-- Consultants (stored role `advisor`) enrol their own students. The question
-- that decides money — "is this student yours?" — must be answerable from a
-- row, not from two people's recollection. So enrolment happens through a
-- single-use invite link, and this table is the record of it: who issued it,
-- when, who it was meant for, and which account finally used it.
--
-- WHY NOT user_tokens. That table is the right shape for verification and
-- password resets and the wrong shape here: `user_id` is NOT NULL and points
-- at the account the token acts on. An invite is issued BEFORE the student has
-- an account — there is nothing to point at yet. Forcing it in would mean
-- either a nullable FK on a table whose whole meaning is "this token belongs
-- to this user", or inventing a placeholder account for someone who may never
-- accept. Both are worse than a second table that says what it means.
--
-- THE TOKEN IS STORED AS A HASH, never in the clear, exactly as user_tokens
-- does it. A database leak must not hand the reader a set of working enrolment
-- links, and an operator reading rows over someone's shoulder must not be able
-- to claim a student by copying what they saw.
--
-- SINGLE USE IS ENFORCED IN SQL, not by the application remembering to check.
-- `claimed_by` is UNIQUE, so the same invite cannot bind two students even if
-- two requests arrive at the same instant — the second one hits the index and
-- loses. See the partial unique index below for why it is partial.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS student_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The consultant this invite enrols FOR. Cascades: if the consultant's
  -- account goes, their unclaimed links are meaningless and should go with it.
  -- Students already claimed are NOT affected — that link lives in
  -- staff_assignments, which is a separate row with its own lifecycle.
  consultant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Who pressed the button. Usually the consultant themselves, but an admin
  -- may issue on their behalf, and then the two differ and the audit needs it.
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,

  token_hash    TEXT NOT NULL,

  -- Both optional and both only ever a LABEL. The email is not verified here
  -- and deliberately does not restrict who may claim the link: a student who
  -- signs up with a different address than the consultant expected is the
  -- normal case, not an attack. It exists so a consultant can tell their own
  -- pending links apart, and so a dispute has something to compare against.
  email         TEXT,
  note          TEXT,

  expires_at    TIMESTAMPTZ NOT NULL,
  claimed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Claimed means claimed: the two columns move together or not at all.
  CONSTRAINT student_invites_claim_is_whole
    CHECK ((claimed_by IS NULL) = (claimed_at IS NULL))
);

-- The lookup on every claim, and the guarantee that two invites cannot share a
-- token even across consultants.
CREATE UNIQUE INDEX IF NOT EXISTS student_invites_hash_key
  ON student_invites (token_hash);

/*
  ONE ACCOUNT CANNOT BE CLAIMED TWICE, and the index is partial because NULL is
  not equal to NULL in Postgres — a plain UNIQUE on a mostly-NULL column would
  permit unlimited unclaimed rows but say nothing useful. Restricting it to
  rows that HAVE been claimed makes it mean what it should: a student arrived
  through exactly one invite, for ever.

  This is what stops a second consultant re-enrolling somebody else's student
  by sending them a fresh link.
*/
CREATE UNIQUE INDEX IF NOT EXISTS student_invites_claimed_once
  ON student_invites (claimed_by) WHERE claimed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS student_invites_consultant_idx
  ON student_invites (consultant_id, created_at DESC);

-- RLS on, policies none — the posture 002_supabase_hardening sets for every
-- table here. The application connects as the owner; the Supabase API roles
-- have no privileges at all.
ALTER TABLE student_invites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE student_invites IS
  'Single-use enrolment links. The record of which consultant brought which '
  'student, and the evidence when that is disputed.';
COMMENT ON COLUMN student_invites.token_hash IS
  'SHA-256 of the link token. The token itself is shown once, at creation, and '
  'is not recoverable afterwards.';
COMMENT ON COLUMN student_invites.email IS
  'A label only. Not verified, and does not restrict who may claim the link.';
