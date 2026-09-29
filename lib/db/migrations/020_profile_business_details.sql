-- ---------------------------------------------------------------------------
-- WHO A CONSULTANT IS, BEYOND A NAME AND A LOGIN.
--
-- `profiles` carried phone, nationality, country and city — enough to know
-- where a client is, and not enough to know who a consultant trades as or
-- where to send anything. A consultant is somebody the firm works WITH rather
-- than somebody it processes, so the details that matter for them are the ones
-- that go on a contract: the business name, a street address, a postcode.
--
-- ON `profiles` RATHER THAN A NEW `consultant_profiles` TABLE, even though the
-- pathway tables next to it set that precedent. Those hold questions that only
-- make sense for one audience — a student's intake, a business's sector. A
-- company name and a postal address are not like that: a business client has
-- both, and so does anybody self-employed. Putting them in a consultant-only
-- table would mean asking the same question twice, in two places, and later
-- having to decide which of the two answers was the real one.
--
-- EVERY COLUMN IS NULLABLE and nothing backfills. These are details somebody
-- types in later; an account is perfectly usable without them, and a NOT NULL
-- here would mean inventing a value for every row that already exists.
-- ---------------------------------------------------------------------------

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_line TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS postcode     TEXT;

COMMENT ON COLUMN profiles.company IS
  'Trading name. For a consultant, the business the firm contracts with.';
COMMENT ON COLUMN profiles.address_line IS
  'Street address as one line. Deliberately not split into house/street/etc: '
  'those fields differ by country and force a shape on addresses that do not '
  'have it. City and country already have their own columns.';
COMMENT ON COLUMN profiles.postcode IS
  'Postal code, unvalidated. Formats vary by country and a regex here would '
  'reject real addresses.';
