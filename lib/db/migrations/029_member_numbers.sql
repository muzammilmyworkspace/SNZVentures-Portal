-- ---------------------------------------------------------------------------
-- A SHORT ID FOR EVERY PERSON ON THE PORTAL.
--
-- A UUID cannot be read out on the phone. Every account gets a number, in
-- the order people joined, shown with a prefix by what they are:
-- STU-0012 for a student (or other client), CON-0003 for a consultant,
-- EMP-0001 for an employee (admin). The prefix is worked out when shown,
-- so changing someone's role does not change their number.
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS users_member_no_seq;
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_no BIGINT;

-- Existing accounts, oldest first.
UPDATE users u SET member_no = n.rn
  FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM users WHERE member_no IS NULL) n
 WHERE u.id = n.id;

SELECT setval('users_member_no_seq', GREATEST((SELECT COALESCE(max(member_no), 0) FROM users), 1));
ALTER TABLE users ALTER COLUMN member_no SET DEFAULT nextval('users_member_no_seq');
CREATE UNIQUE INDEX IF NOT EXISTS users_member_no_key ON users (member_no);
