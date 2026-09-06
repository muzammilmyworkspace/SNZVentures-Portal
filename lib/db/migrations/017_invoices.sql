-- ---------------------------------------------------------------------------
-- INVOICES.
--
-- Raised for anybody, not only for people with a portal account. That is the
-- point rather than an oversight: leads arrive on Instagram and WhatsApp, the
-- consultancy fee is agreed there, and only afterwards does somebody get a
-- login. An invoice that required a user row would be an invoice that could
-- not be sent to most of the people who need one.
--
-- FOUR THINGS THE DATABASE GUARANTEES, because an invoice is a document
-- somebody is being asked to pay from and every one of these fails quietly:
--
-- 1. MONEY IS INTEGER MINOR UNITS. Never a float. VAT on a float total
--    produces an invoice whose lines do not add up to the total printed on it.
--
-- 2. A NUMBER APPEARS ONCE. Unique, so two documents can never both claim to
--    be SNZ-2026-004 — which is what happens when two tabs are left open on
--    the form and both are saved.
--
-- 3. AN ISSUED INVOICE DOES NOT CHANGE. Once it leaves draft, a trigger allows
--    only its status to move. A sent invoice that can be edited is one where
--    the copy in somebody's inbox and the copy in the system quietly disagree,
--    and the customer's copy is the one that counts.
--
-- 4. NOTHING IS DELETED. A missing number reads as a document somebody is
--    hiding; `void` is the way out, and it stays in the sequence.
--
-- THE TOTALS ARE STORED, not recomputed on read. An invoice must always say
-- what it said on the day it was issued, even if the VAT rate changes or the
-- rounding rule is corrected later.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SNZ-2026-001. Human-facing, quoted on payments, and unique for ever.
  number         TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'sent', 'paid', 'void')),

  issued_on      DATE NOT NULL,
  due_on         DATE,

  -- Free text, deliberately. See the note above about WhatsApp.
  bill_to_name   TEXT NOT NULL CHECK (btrim(bill_to_name) <> ''),
  bill_to_email  TEXT,
  bill_to_address TEXT,
  -- Filled in when the person does happen to have an account, so their
  -- invoices can later be shown on their file. Never required.
  client_id      UUID REFERENCES users(id) ON DELETE SET NULL,

  -- The document's own currency. The finance ledger is EUR-only; an invoice is
  -- written in whatever was actually agreed, which is not always the same.
  currency       TEXT NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  -- Basis points: 2100 is 21%. An integer, for the same reason the amounts are.
  vat_bp         INTEGER NOT NULL DEFAULT 0 CHECK (vat_bp >= 0 AND vat_bp <= 10000),

  /*
    THE LINES ARE A SNAPSHOT, NOT A JOIN.

    Held as JSONB rather than child rows because an issued invoice is a
    document, not a live view. With rows, a single line could be edited without
    the invoice itself being touched — the trigger below would never fire, and
    the total would silently stop matching its own lines. As one column, the
    document changes as a whole or not at all.

    Shape: [{ "desc": "...", "amount_cents": 20000 }, …]
  */
  lines          JSONB NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0),

  subtotal_cents BIGINT NOT NULL CHECK (subtotal_cents >= 0),
  vat_cents      BIGINT NOT NULL CHECK (vat_cents >= 0),
  total_cents    BIGINT NOT NULL CHECK (total_cents >= 0),

  notes          TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The one arithmetic guarantee worth having in the schema: the printed total
  -- is its own parts. Application code that got this wrong could not store it.
  CONSTRAINT invoice_total_adds_up CHECK (total_cents = subtotal_cents + vat_cents)
);

CREATE INDEX IF NOT EXISTS invoices_issued_idx ON invoices (issued_on DESC);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);
CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices (client_id);

-- ---------------------------------------------------------------------------
-- AN ISSUED INVOICE IS FIXED.
--
-- Everything except `status`, `updated_at` and the client link is frozen once
-- the invoice leaves draft. Correcting a sent invoice means voiding it and
-- raising another — which is what the number sequence is for, and what an
-- accountant expects to see.
--
-- Enforced here rather than in the route, because a rule the application has
-- to remember is a rule the second route to touch this table will forget.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invoices_freeze_once_issued() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;  -- a draft is still being written
  END IF;

  IF NEW.number         IS DISTINCT FROM OLD.number
     OR NEW.issued_on   IS DISTINCT FROM OLD.issued_on
     OR NEW.due_on      IS DISTINCT FROM OLD.due_on
     OR NEW.bill_to_name IS DISTINCT FROM OLD.bill_to_name
     OR NEW.bill_to_email IS DISTINCT FROM OLD.bill_to_email
     OR NEW.bill_to_address IS DISTINCT FROM OLD.bill_to_address
     OR NEW.currency    IS DISTINCT FROM OLD.currency
     OR NEW.vat_bp      IS DISTINCT FROM OLD.vat_bp
     OR NEW.lines       IS DISTINCT FROM OLD.lines
     OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
     OR NEW.vat_cents   IS DISTINCT FROM OLD.vat_cents
     OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
     OR NEW.notes       IS DISTINCT FROM OLD.notes
  THEN
    RAISE EXCEPTION
      'invoice % has been issued: void it and raise a new one instead of editing it', OLD.number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_no_edit_after_issue ON invoices;
CREATE TRIGGER invoices_no_edit_after_issue
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_freeze_once_issued();

-- A gap in the numbering reads as a document somebody removed. Void instead.
CREATE OR REPLACE FUNCTION invoices_are_never_deleted() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'invoice % cannot be deleted: set its status to void so the number stays in sequence', OLD.number;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_no_delete ON invoices;
CREATE TRIGGER invoices_no_delete
  BEFORE DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_are_never_deleted();

COMMENT ON TABLE invoices IS
  'Invoices, in minor units. Frozen once issued; voided rather than deleted.';
COMMENT ON COLUMN invoices.lines IS
  'Snapshot of the document: [{desc, amount_cents}]. Not child rows, so an '
  'issued invoice cannot be altered a line at a time.';
COMMENT ON COLUMN invoices.number IS
  'SNZ-YYYY-NNN. Unique for ever; quoted by the payer.';
