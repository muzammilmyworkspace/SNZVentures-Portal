-- ---------------------------------------------------------------------------
-- A DRAFT INVOICE CAN BE DELETED.
--
-- A draft has not been sent to anybody, so removing it hides nothing from a
-- customer. Once issued (sent, paid or void) the rule from 017 still holds:
-- never deleted, voided instead, so the number stays in sequence.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION invoices_are_never_deleted() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'invoice % cannot be deleted: set its status to void so the number stays in sequence', OLD.number;
END;
$$ LANGUAGE plpgsql;
