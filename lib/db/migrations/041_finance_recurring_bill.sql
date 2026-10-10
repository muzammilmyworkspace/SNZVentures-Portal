-- ---------------------------------------------------------------------------
-- A FIXED COST CAN CARRY ITS BILL: a photo or PDF of the contract, invoice or
-- subscription receipt it is based on, opened from the list.
-- ---------------------------------------------------------------------------

ALTER TABLE finance_recurring
  ADD COLUMN IF NOT EXISTS receipt_key      TEXT,
  ADD COLUMN IF NOT EXISTS receipt_name     TEXT,
  ADD COLUMN IF NOT EXISTS receipt_type     TEXT,
  ADD COLUMN IF NOT EXISTS receipt_provider TEXT;
