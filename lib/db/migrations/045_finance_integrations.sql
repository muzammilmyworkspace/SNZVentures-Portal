-- ---------------------------------------------------------------------------
-- FINANCE INTEGRATIONS: the bank and payment accounts connected to the books.
--
-- A connection belongs to one money account (finance_accounts) and reads the
-- provider's own figures:
--   wise     a Wise Business personal API token (read only): balances, and
--            statements where Wise allows them without extra approval;
--   stripe   a Stripe restricted key (read only): balance and balance
--            transactions (payments, fees, refunds, payouts);
--   revolut  Revolut Business, and any other bank: statement CSV upload.
--
-- THE TOKEN IS STORED ENCRYPTED (AES-256-GCM under AUTH_SECRET, via
-- lib/integrations/secret-box), never shown again once saved.
--
-- BANK LINES are what a provider says happened: one row per statement line,
-- kept once (provider id, or a hash of the line for CSV). Each is reviewed:
-- matched to an entry already in the books, added to the books as a new
-- entry, or ignored. This is the bank reconciliation.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL CHECK (provider IN ('wise', 'stripe', 'revolut', 'csv')),
  label           TEXT NOT NULL,
  account_id      UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  -- Sealed token; NULL for a CSV-only connection.
  secret          TEXT,
  -- Provider details found when connecting (Wise profile and balance ids, etc.).
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error', 'paused')),
  last_sync_at    TIMESTAMPTZ,
  last_error      TEXT,
  -- What the provider said the balance was at the last sync, in its currency.
  provider_balance_cents BIGINT,
  provider_currency      TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_bank_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id  UUID NOT NULL REFERENCES finance_integrations(id) ON DELETE CASCADE,
  external_id     TEXT NOT NULL,
  occurred_on     DATE NOT NULL,
  -- Signed: money in is positive, money out negative.
  amount_cents    BIGINT NOT NULL,
  currency        TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  counterparty    TEXT,
  -- What the provider calls it: charge, fee, payout, transfer, card…
  line_type       TEXT,
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'matched', 'added', 'ignored')),
  entry_id        UUID REFERENCES finance_entries(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (integration_id, external_id)
);
CREATE INDEX IF NOT EXISTS finance_bank_lines_review ON finance_bank_lines (status, occurred_on DESC);

ALTER TABLE finance_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_bank_lines ENABLE ROW LEVEL SECURITY;
