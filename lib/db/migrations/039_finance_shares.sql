-- ---------------------------------------------------------------------------
-- FINANCE, PART TWO: who money comes from and goes to.
--
-- finance_entries gains a party (received from / paid to) and optional links
-- to a student, a consultant and a university.
--
-- CONSULTANT SHARES. Each consultant can have terms (a percentage of a fee,
-- or a fixed amount) from a date. When a fee of one of their students is
-- verified on or after that date, a payout is written by itself, as owed.
-- Marking it paid writes the expense; un-marking takes it back out.
--
-- UNIVERSITY COMMISSIONS. Universities that pay a commission, with their
-- terms, and the commissions expected from them per student. Marking one
-- received writes the income.
-- ---------------------------------------------------------------------------

ALTER TABLE finance_entries
  ADD COLUMN IF NOT EXISTS party         TEXT,
  ADD COLUMN IF NOT EXISTS student_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consultant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS university    TEXT;

CREATE TABLE IF NOT EXISTS finance_consultant_terms (
  consultant_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value         NUMERIC(12,2) NOT NULL CHECK (value > 0),
  currency      TEXT NOT NULL DEFAULT 'EUR',
  starts_on     DATE NOT NULL DEFAULT current_date,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_payouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  fee_id        UUID REFERENCES fee_submissions(id) ON DELETE SET NULL,
  description   TEXT NOT NULL,
  amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0),
  currency      TEXT NOT NULL DEFAULT 'EUR',
  status        TEXT NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'paid')),
  created_on    DATE NOT NULL DEFAULT current_date,
  paid_on       DATE,
  entry_id      UUID REFERENCES finance_entries(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One automatic payout per verified fee.
CREATE UNIQUE INDEX IF NOT EXISTS finance_payouts_fee_once ON finance_payouts (fee_id) WHERE fee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS finance_universities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL DEFAULT 'fixed' CHECK (kind IN ('percent', 'fixed')),
  value      NUMERIC(12,2),
  currency   TEXT NOT NULL DEFAULT 'EUR',
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_commissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID NOT NULL REFERENCES finance_universities(id) ON DELETE CASCADE,
  student_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  student_name  TEXT NOT NULL,
  intake        TEXT,
  amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0),
  currency      TEXT NOT NULL DEFAULT 'EUR',
  expected_on   DATE,
  status        TEXT NOT NULL DEFAULT 'expected' CHECK (status IN ('expected', 'received')),
  received_on   DATE,
  entry_id      UUID REFERENCES finance_entries(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
