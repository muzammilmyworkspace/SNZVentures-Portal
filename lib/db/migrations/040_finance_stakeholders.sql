-- ---------------------------------------------------------------------------
-- STAKEHOLDERS: who shares the profit, and what each was paid.
--
-- Each stakeholder has a share of the monthly profit (SnZ Ventures itself is
-- one of them, keeping its share in the business). Shares are worked out live
-- from each month's profit; when a stakeholder is paid, the amount is written
-- down for that month so it never changes afterwards, even if a later entry
-- changes the month's profit.
--
-- A profit share is not an expense: paying it does not lower the profit it
-- was a share of. It is shown on its own.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_stakeholders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  share_pct   NUMERIC(5,2) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  -- SnZ Ventures' own share: kept in the business, nobody to pay.
  is_company  BOOLEAN NOT NULL DEFAULT FALSE,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_distributions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stakeholder_id UUID NOT NULL REFERENCES finance_stakeholders(id) ON DELETE CASCADE,
  month          DATE NOT NULL,
  amount_cents   BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency       TEXT NOT NULL DEFAULT 'EUR',
  paid_on        DATE NOT NULL DEFAULT current_date,
  note           TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stakeholder_id, month)
);
