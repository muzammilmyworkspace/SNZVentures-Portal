-- ---------------------------------------------------------------------------
-- 007 — Fee verification, and the gate it opens.
--
-- ADDITIVE. One enum, one table, no existing row rewritten, nothing dropped.
-- 001–006 are applied to production and stay exactly as they are.
--
-- WHAT THIS IS FOR
-- A student now pays before the application form opens to them. They declare
-- the payment themselves (Form A — Payment Authorization & Declaration), upload
-- the receipt, sign it on screen, and submit. Staff check the receipt against
-- the bank and mark it verified; only then does the rest of the portal unlock.
--
-- WHY THE STAGE IS DERIVED, NOT STORED
-- There is deliberately no `students.stage` column. A stored stage is a second
-- source of truth that drifts the first time a write half-fails: a fee marked
-- verified but a stage still saying pending locks a paying student out, and
-- the reverse lets an unpaid one through. The stage is computed from the rows
-- that actually exist — this table, `intake_forms`, `consents` — so it cannot
-- disagree with them. See lib/portal/stage.ts.
--
-- WHY THE RECEIPT IS A DOCUMENT ID, NOT A STORAGE KEY
-- Receipts go through the same upload path, the same private bucket and the
-- same authorised-download route as every other client document. Storing a
-- bare storage key here would be a second way to reach a file, bypassing the
-- authorisation in /api/portal/documents/[id] — and it is a financial record
-- attached to a named person, so it wants the audit trail that route provides.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE fee_status AS ENUM ('submitted','verified','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fee_submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- What the student declared. Nothing here is pre-filled by us: the amount on
  -- the declaration is the amount the student typed, which is the whole point
  -- of it being a declaration.
  university     TEXT NOT NULL,
  programme      TEXT,
  fee_type       TEXT NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'EUR',
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method         TEXT NOT NULL,
  txn_ref        TEXT,
  pay_date       DATE,

  -- Someone else may send the money. Their name goes on the declaration so the
  -- transfer can be matched to this file.
  third_party      BOOLEAN NOT NULL DEFAULT FALSE,
  payer_name       TEXT,
  payer_relation   TEXT,

  receipt_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,

  -- Evidence of signing, kept with the record rather than only in a PDF.
  signature_png  TEXT,
  signed_name    TEXT NOT NULL,
  signed_at      timestamptz NOT NULL DEFAULT now(),
  consent_version TEXT NOT NULL,
  ip             TEXT,
  user_agent     TEXT,

  status         fee_status NOT NULL DEFAULT 'submitted',
  reviewed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  review_note    TEXT,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- One LIVE submission per student. A rejected one must stay on the record —
-- it is part of the financial history and the reason for the rejection is the
-- thing a later dispute turns on — so the constraint only covers the two
-- states that mean "this is the current claim".
CREATE UNIQUE INDEX IF NOT EXISTS fee_submissions_live_idx
  ON fee_submissions (user_id)
  WHERE status IN ('submitted','verified');

CREATE INDEX IF NOT EXISTS fee_submissions_queue_idx
  ON fee_submissions (status, created_at DESC);

-- Same posture as every other client table: RLS on, and the application
-- connects as the owner, so policy is expressed in the queries themselves.
-- See 002_supabase_hardening.sql for why this is enabled rather than relied on.
ALTER TABLE fee_submissions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE fee_submissions IS
  'Student payment declarations (Form A) and their verification by staff. '
  'The portal gate for a student is derived from this table, not stored.';
