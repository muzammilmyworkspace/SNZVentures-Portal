-- ---------------------------------------------------------------------------
-- WHAT AN EMPLOYEE MAY OPEN.
--
-- An employee is an admin account. Until now every admin could open every
-- admin page. An employee added from the Employees page is given a list of
-- the areas they may use (enquiries, fees, applications, users, consultants,
-- employees, invoices); the sidebar shows only those and each page and its
-- actions refuse the rest.
--
-- NULL means no restriction, which is what every existing admin keeps, so
-- nobody loses access by this migration. A super admin is never restricted.
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT[];

-- The student's name on a consultant's invite, so the email can greet them
-- and the sign-up form opens with it filled in.
ALTER TABLE student_invites ADD COLUMN IF NOT EXISTS name TEXT;
