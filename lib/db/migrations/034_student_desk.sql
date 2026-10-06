-- ---------------------------------------------------------------------------
-- THE STUDENT DESK ("Admin" employees).
--
-- An Admin is added by the super admin with a name and email, gets a
-- sign-in and a first password by email, and on first sign-in adds their
-- photo and details and chooses their own password. Until they have,
-- must_onboard keeps them on that one screen.
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_onboard BOOLEAN NOT NULL DEFAULT FALSE;
