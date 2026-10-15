-- ---------------------------------------------------------------------------
-- FINANCE, PART FOUR: money accounts, reverse-charge VAT, liabilities, proforma.
--
-- MONEY ACCOUNTS. Where the money actually sits: Business Revolut, Wise
-- Business, cash, the rupee account. Every entry says which account it went
-- through; each account has an opening balance from a date, and transfers
-- between accounts are kept on their own (they are neither income nor
-- expense). Verified fees and paid invoices land in the account marked as
-- the default for money in.
--
-- REVERSE-CHARGE VAT. A service bought from a supplier outside Lithuania is
-- invoiced without Lithuanian VAT; SnZ declares 21% on it to VMI as output
-- VAT and deducts the same 21% as input VAT. The cash paid does not change.
-- An expense (or a fixed cost) says 'reverse_charge', and the 21% is kept
-- on the entry so the month's VAT figures can be listed.
--
-- LIABILITIES. Anything recorded and not yet paid is a liability; an entry
-- says whether it is short-term (due within a year, the default) or
-- long-term.
--
-- PROFORMA INVOICES. An invoice is either a tax invoice or a proforma, with
-- its own number series (PF-2026-001). A proforma is never income; when it
-- is paid it is turned into a tax invoice, and remembers which one.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  kind           TEXT NOT NULL DEFAULT 'bank' CHECK (kind IN ('bank', 'cash')),
  currency       TEXT NOT NULL DEFAULT 'EUR',
  opening_cents  BIGINT NOT NULL DEFAULT 0,
  opening_on     DATE NOT NULL DEFAULT current_date,
  -- Verified fees and paid invoices land here.
  default_in     BOOLEAN NOT NULL DEFAULT FALSE,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort           SMALLINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO finance_accounts (name, kind, currency, default_in, sort) VALUES
  ('Business Revolut', 'bank', 'EUR', TRUE, 1),
  ('Wise Business', 'bank', 'EUR', FALSE, 2),
  ('Cash', 'cash', 'EUR', FALSE, 3),
  ('PKR account', 'cash', 'PKR', FALSE, 4)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS finance_transfers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account     UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  to_account       UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  -- In each account's own currency: a EUR to PKR transfer has two amounts.
  from_cents       BIGINT NOT NULL CHECK (from_cents > 0),
  to_cents         BIGINT NOT NULL CHECK (to_cents > 0),
  occurred_on      DATE NOT NULL,
  note             TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_account <> to_account)
);

ALTER TABLE finance_entries
  ADD COLUMN IF NOT EXISTS account_id     UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vat_mode       TEXT NOT NULL DEFAULT 'none' CHECK (vat_mode IN ('none', 'reverse_charge')),
  ADD COLUMN IF NOT EXISTS vat_cents      BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liability_term TEXT NOT NULL DEFAULT 'short' CHECK (liability_term IN ('short', 'long'));

ALTER TABLE finance_recurring
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vat_mode   TEXT NOT NULL DEFAULT 'none' CHECK (vat_mode IN ('none', 'reverse_charge'));

-- Entries written before accounts existed went through the default account.
UPDATE finance_entries SET account_id = (SELECT id FROM finance_accounts WHERE default_in ORDER BY sort LIMIT 1)
 WHERE account_id IS NULL AND currency = 'EUR';
UPDATE finance_entries SET account_id = (SELECT id FROM finance_accounts WHERE currency = 'PKR' ORDER BY sort LIMIT 1)
 WHERE account_id IS NULL AND currency = 'PKR';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS kind         TEXT NOT NULL DEFAULT 'invoice' CHECK (kind IN ('invoice', 'proforma')),
  ADD COLUMN IF NOT EXISTS converted_to UUID REFERENCES invoices(id) ON DELETE SET NULL;
