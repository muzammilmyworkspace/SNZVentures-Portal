-- ---------------------------------------------------------------------------
-- APPLIED: the stage after Ready to apply.
--
-- An application moves Under review -> Ready to apply -> Applied. Applied
-- means staff have submitted it to the universities; what comes back from
-- them is tracked on the case.
--
-- ADD VALUE is allowed inside a transaction on PostgreSQL 12 and later, as
-- long as nothing in the same transaction uses the new value, and nothing
-- here does.
-- ---------------------------------------------------------------------------

ALTER TYPE intake_status ADD VALUE IF NOT EXISTS 'applied';
