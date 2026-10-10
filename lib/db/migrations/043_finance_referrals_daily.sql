-- ---------------------------------------------------------------------------
-- FINANCE, PART THREE.
--
-- DAILY RATES. Each day's market rate is kept (finance_rates_daily), so an
-- amount in rupees is turned into euros at the rate of the day it was paid,
-- not one rate for the whole month. A rate the super admin fixes for a month
-- (finance_rates, 'manual') still wins over the daily ones.
--
-- REFERRALS. A referral is owed either to a consultant (one of the portal's
-- users, their students listed) or to anyone else who sent a student (a
-- name typed in, and the student's name typed in). Each carries its share
-- rule: a percentage of an amount, or a fixed amount.
--
-- PARTNER COSTS. Stakeholders who only share the profit do not carry every
-- cost: office rent, internet, phone are SnZ Ventures' own. A fixed cost or
-- an expense says whether it counts against the profit the partners share.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_rates_daily (
  day        DATE NOT NULL,
  currency   TEXT NOT NULL,
  per_eur    NUMERIC(14,4) NOT NULL CHECK (per_eur > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, currency)
);

ALTER TABLE finance_payouts ALTER COLUMN consultant_id DROP NOT NULL;
ALTER TABLE finance_payouts
  ADD COLUMN IF NOT EXISTS referrer_kind TEXT NOT NULL DEFAULT 'consultant' CHECK (referrer_kind IN ('consultant', 'referral')),
  ADD COLUMN IF NOT EXISTS referrer_name TEXT,
  ADD COLUMN IF NOT EXISTS student_name  TEXT,
  ADD COLUMN IF NOT EXISTS rule_kind     TEXT CHECK (rule_kind IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS rule_value    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS base_cents    BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_payouts_someone') THEN
    ALTER TABLE finance_payouts
      ADD CONSTRAINT finance_payouts_someone CHECK (consultant_id IS NOT NULL OR referrer_name IS NOT NULL);
  END IF;
END $$;

ALTER TABLE finance_recurring ADD COLUMN IF NOT EXISTS partner_cost BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE finance_entries   ADD COLUMN IF NOT EXISTS partner_cost BOOLEAN NOT NULL DEFAULT TRUE;
