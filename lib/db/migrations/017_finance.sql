-- ---------------------------------------------------------------------------
-- THE BOOKS.
--
-- Replaces the finance spreadsheet, and the reason to move it here is not that
-- a web page is nicer than a sheet. It is that the left-hand side of that sheet
-- ALREADY EXISTS in this database: fee_submissions holds who paid, how much, in
-- what currency, by what method, with a receipt and a staff verification, and
-- every application records who referred the student. The sheet's real cost is
-- typing that in again — and anything typed in two places ends up different in
-- two places.
--
-- FOUR DECISIONS, EACH ONE EXPENSIVE TO CHANGE LATER:
--
-- 1. MONEY IS AN INTEGER NUMBER OF CENTS. Never a float, never a decimal read
--    into JavaScript. €4,000.01 split 50/25/25 in floating point produces three
--    shares that do not add back to €4,000.01, and the shortfall is too small
--    to notice and too persistent to explain. See lib/finance/money.ts.
--
-- 2. ONE CURRENCY: EUR. Chosen rather than defaulted. A multi-currency ledger
--    has to store the rate used on every row, or last month's profit changes
--    when today's rate moves. A payment that arrives as PKR is recorded as the
--    EUR actually received, with the PKR figure in `reference` — so the books
--    stay in one unit and nothing is silently reinterpreted.
--
-- 3. ENTRIES ARE APPEND-ONLY, enforced by a trigger below rather than by
--    remembering. A mistake is corrected with a reversing entry that points at
--    the original. This is the difference between books and a spreadsheet, and
--    it is what lets somebody answer "why did March change?".
--
-- 4. A CLOSED PERIOD IS CLOSED, also by trigger. Once profit has been divided
--    and three people have been told their share, nothing in that month may
--    move — otherwise the statement they were sent stops matching the system
--    that produced it.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- partners ----
-- Shares in basis points so 50/25/25 is exact: 5000 + 2500 + 2500. Percentages
-- as decimals would reintroduce the rounding this whole file is built to avoid.
CREATE TABLE IF NOT EXISTS finance_partners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  -- Set when the partner also has a portal account, so they can later be shown
  -- their own statement. Null for a partner who does not sign in.
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  share_bp      INTEGER NOT NULL CHECK (share_bp >= 0 AND share_bp <= 10000),
  -- Ended rather than deleted: a partner who leaves must stay attached to the
  -- distributions they have already been paid.
  active_from   DATE NOT NULL DEFAULT CURRENT_DATE,
  active_to     DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_partners_active_idx ON finance_partners (active_to);

-- -------------------------------------------------------------- periods ----
CREATE TABLE IF NOT EXISTS finance_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year          INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  -- A month that lost money pays nobody; the shortfall moves here and the next
  -- good month clears it before anybody is paid. Splitting a loss would mean
  -- asking three people to pay money in, which is not what happens in practice.
  carry_in_cents  BIGINT NOT NULL DEFAULT 0,
  carry_out_cents BIGINT NOT NULL DEFAULT 0,
  closed_at     TIMESTAMPTZ,
  closed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT finance_period_unique UNIQUE (year, month)
);

-- -------------------------------------------------------------- entries ----
CREATE TABLE IF NOT EXISTS finance_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id     UUID NOT NULL REFERENCES finance_periods(id) ON DELETE RESTRICT,
  kind          TEXT NOT NULL CHECK (kind IN ('income', 'refund', 'expense', 'referral_payout')),
  -- Free-form for expenses ('marketing', 'software', 'salary', …). The
  -- marketing fund is a category rather than a table of its own: it behaves
  -- exactly like every other expense and giving it special machinery would
  -- mean maintaining two ways to spend money.
  category      TEXT,
  -- ALWAYS POSITIVE. `kind` decides which way it moves. A signed amount lets a
  -- negative income and a positive refund mean the same thing two ways, and
  -- then no total can be trusted.
  amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0),
  currency      TEXT NOT NULL DEFAULT 'EUR',
  occurred_on   DATE NOT NULL,
  -- Which client this concerns, when it concerns one.
  client_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  -- The verified fee this came from. UNIQUE further down, so one verified
  -- payment can never be booked as income twice.
  fee_submission_id UUID REFERENCES fee_submissions(id) ON DELETE SET NULL,
  referral_id   UUID,
  method        TEXT,    -- stripe / bank / cash / card
  reference     TEXT,    -- transaction ref, invoice number, the PKR figure
  memo          TEXT,
  -- A correction. Points at the entry it cancels, because the original stays.
  reverses_id   UUID REFERENCES finance_entries(id) ON DELETE RESTRICT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_entries_period_idx ON finance_entries (period_id, kind);
CREATE INDEX IF NOT EXISTS finance_entries_client_idx ON finance_entries (client_id);
CREATE INDEX IF NOT EXISTS finance_entries_date_idx ON finance_entries (occurred_on);

-- ONE VERIFIED PAYMENT, ONE INCOME ROW.
-- The sheet's commonest error was entering the same payment twice — once when
-- the receipt arrived and again when the bank showed it. A partial index rather
-- than a plain unique so the many rows with no fee submission are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS finance_entries_fee_once
  ON finance_entries (fee_submission_id)
  WHERE fee_submission_id IS NOT NULL AND reverses_id IS NULL;

-- ------------------------------------------------------------ referrals ----
-- What was AGREED with whoever introduced a client. What was actually paid is
-- a referral_payout entry above; keeping the two apart is what makes "who are
-- we still short with" answerable.
CREATE TABLE IF NOT EXISTS finance_referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referrer_name TEXT NOT NULL,
  referrer_contact TEXT,
  fee_kind      TEXT NOT NULL CHECK (fee_kind IN ('fixed', 'percent')),
  fixed_cents   BIGINT CHECK (fixed_cents IS NULL OR fixed_cents > 0),
  -- Basis points of what the client actually paid, for the same reason shares
  -- are: a percentage as a decimal rounds.
  percent_bp    INTEGER CHECK (percent_bp IS NULL OR (percent_bp > 0 AND percent_bp <= 10000)),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one of the two, matching the kind. Without this a 'percent'
  -- referral can carry a fixed amount nobody reads, and be quietly worth zero.
  CONSTRAINT finance_referral_amount CHECK (
    (fee_kind = 'fixed'   AND fixed_cents IS NOT NULL AND percent_bp IS NULL) OR
    (fee_kind = 'percent' AND percent_bp  IS NOT NULL AND fixed_cents IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS finance_referrals_client_idx ON finance_referrals (client_id);

-- -------------------------------------------------------- distributions ----
-- Frozen at close. Written once, never recomputed: a share recalculated later
-- is a share that disagrees with the statement somebody was already sent.
CREATE TABLE IF NOT EXISTS finance_distributions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id     UUID NOT NULL REFERENCES finance_periods(id) ON DELETE RESTRICT,
  partner_id    UUID NOT NULL REFERENCES finance_partners(id) ON DELETE RESTRICT,
  -- The share as it stood when the month was closed, so a later change to the
  -- split cannot rewrite what was already divided.
  share_bp      INTEGER NOT NULL,
  amount_cents  BIGINT NOT NULL,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT finance_distribution_once UNIQUE (period_id, partner_id)
);

-- ------------------------------------------------------------- triggers ----

-- APPEND-ONLY, ENFORCED RATHER THAN REMEMBERED.
-- Correcting a mistake by editing the row destroys the only evidence that the
-- mistake happened. A reversing entry keeps both.
CREATE OR REPLACE FUNCTION finance_entries_are_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'finance_entries is append-only: reverse entry % with a new row instead of changing it',
    COALESCE(OLD.id::text, '(unknown)');
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS finance_entries_no_change ON finance_entries;
CREATE TRIGGER finance_entries_no_change
  BEFORE UPDATE OR DELETE ON finance_entries
  FOR EACH ROW EXECUTE FUNCTION finance_entries_are_append_only();

-- A CLOSED MONTH DOES NOT MOVE.
-- Three people have been told what they earned. Anything landing in that month
-- afterwards belongs in the current one, and the trigger says so rather than
-- letting it through and quietly contradicting a statement already sent.
CREATE OR REPLACE FUNCTION finance_period_must_be_open() RETURNS trigger AS $$
DECLARE
  period_status TEXT;
BEGIN
  SELECT status INTO period_status FROM finance_periods WHERE id = NEW.period_id;
  IF period_status = 'closed' THEN
    RAISE EXCEPTION
      'that month is closed: book this in the open period instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS finance_entries_open_period ON finance_entries;
CREATE TRIGGER finance_entries_open_period
  BEFORE INSERT ON finance_entries
  FOR EACH ROW EXECUTE FUNCTION finance_period_must_be_open();

COMMENT ON TABLE finance_entries IS
  'Append-only money ledger in EUR cents. Corrections are reversing rows.';
COMMENT ON COLUMN finance_entries.amount_cents IS
  'Always positive; `kind` decides direction. Integer cents, never a float.';
COMMENT ON TABLE finance_distributions IS
  'Partner shares as frozen at period close, with the share used at the time.';
