-- ---------------------------------------------------------------------------
-- FINANCE (super admin only).
--
-- INCOME comes in two ways:
--   automatic  verified student fees and paid invoices, read straight from
--              their own tables, so they are never typed twice and never
--              disagree with the record they came from;
--   manual     finance_entries with kind 'income' (cash, bank transfers that
--              are not in the portal).
--
-- EXPENSES are finance_entries with kind 'expense': one-off ones typed in,
-- and the fixed monthly ones (finance_recurring) which the portal writes into
-- each month by itself, once, as due (or paid, if set to auto-pay).
--
-- RATES: totals are shown in EUR. For every other currency the super admin
-- sets how many units make one euro, per month; the latest rate set is used
-- for a month that has none.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_recurring (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0),
  currency      TEXT NOT NULL DEFAULT 'EUR',
  day_of_month  SMALLINT NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  auto_paid     BOOLEAN NOT NULL DEFAULT FALSE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  starts_on     DATE NOT NULL,
  notes         TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  category         TEXT NOT NULL,
  description      TEXT NOT NULL,
  amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
  currency         TEXT NOT NULL DEFAULT 'EUR',
  occurred_on      DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'due')),
  recurring_id     UUID REFERENCES finance_recurring(id) ON DELETE SET NULL,
  -- The month a fixed cost was written for, so it is written once only.
  recurring_month  DATE,
  receipt_key      TEXT,
  receipt_name     TEXT,
  receipt_type     TEXT,
  receipt_provider TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_entries_recurring_once
  ON finance_entries (recurring_id, recurring_month) WHERE recurring_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS finance_entries_month_idx ON finance_entries (occurred_on, kind);

CREATE TABLE IF NOT EXISTS finance_rates (
  month      DATE NOT NULL,
  currency   TEXT NOT NULL,
  per_eur    NUMERIC(14,4) NOT NULL CHECK (per_eur > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month, currency)
);
