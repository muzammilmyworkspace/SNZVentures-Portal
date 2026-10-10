-- ---------------------------------------------------------------------------
-- EXCHANGE RATES BY THEMSELVES.
--
-- The portal fetches today's rates (from a free exchange-rate service) and
-- keeps the current month's rate up to date, at most every twelve hours.
-- A rate the super admin typed in is 'manual' and is never overwritten; going
-- back to automatic removes it.
-- ---------------------------------------------------------------------------

ALTER TABLE finance_rates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto'));
