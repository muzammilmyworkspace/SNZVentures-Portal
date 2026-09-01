-- ---------------------------------------------------------------------------
-- LETTING A STUDENT TAKE BACK A RECEIPT WE HAVE NOT LOOKED AT YET.
--
-- Reported by a student: they sent the wrong slip and there was no way to send
-- another. The form refused, correctly, because one live submission per person
-- is what stops two contradictory declarations existing at once — but the only
-- way out was to wait for staff to reject it, which turns a thirty-second fix
-- into a day.
--
-- WITHDRAWN, NOT DELETED. This row carries a signature, a declared amount and
-- the address the person was at when they signed. It is a financial
-- declaration, and deleting one because it was superseded destroys the record
-- that it was ever made. A withdrawal is itself a fact worth keeping: staff
-- looking at three attempts should be able to see there were three.
--
-- The partial unique index is already `WHERE status IN ('submitted','verified')`,
-- so a withdrawn row drops out of it on its own and the next submission is
-- accepted with no further change.
-- ---------------------------------------------------------------------------

ALTER TYPE fee_status ADD VALUE IF NOT EXISTS 'withdrawn';

COMMENT ON TYPE fee_status IS
  'submitted = with us to check. verified = accepted, opens the portal. '
  'rejected = we returned it, with a reason. withdrawn = the student took it '
  'back before we had looked, and sent another.';
