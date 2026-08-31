-- ---------------------------------------------------------------------------
-- 008 — The declarant's own details, on the declaration.
--
-- ADDITIVE. Columns added to a table 007 created; nothing rewritten, nothing
-- dropped.
--
-- WHY THIS IS A SEPARATE MIGRATION AND NOT AN EDIT TO 007
-- 007 may already be applied. Migrations are checksummed, so changing one that
-- has run turns the next deploy into a hard failure — correctly, because the
-- database and the file would no longer agree. A second migration is right
-- whether or not the first one has been applied anywhere.
--
-- WHAT WAS MISSING
-- Form A opens with the signatory's identity, and its declaration reads
-- "I, <name>, holder of passport <no.>, a national of <nationality> residing at
-- <city>, confirm that I have applied to <institution>". Without these the
-- document cannot state who signed it, which is most of what makes it a
-- declaration rather than a form.
--
-- WHY THEY ARE COPIED HERE RATHER THAN JOINED FROM `profiles`
-- This is a signed legal record. It has to say what the person declared ON THE
-- DAY — a profile is a living row that they can edit afterwards, and a document
-- whose facts change after signing is evidence of nothing. The profile is where
-- the current truth lives; this is where the declared truth stays.
-- ---------------------------------------------------------------------------

ALTER TABLE fee_submissions
  ADD COLUMN IF NOT EXISTS declarant_name        TEXT,
  ADD COLUMN IF NOT EXISTS declarant_father      TEXT,
  ADD COLUMN IF NOT EXISTS declarant_passport    TEXT,
  ADD COLUMN IF NOT EXISTS declarant_nationality TEXT,
  ADD COLUMN IF NOT EXISTS declarant_dob         DATE,
  ADD COLUMN IF NOT EXISTS declarant_email       TEXT,
  ADD COLUMN IF NOT EXISTS declarant_phone       TEXT,
  ADD COLUMN IF NOT EXISTS declarant_city        TEXT,
  ADD COLUMN IF NOT EXISTS declarant_address     TEXT;

COMMENT ON COLUMN fee_submissions.declarant_name IS
  'Identity AS DECLARED at signing. Deliberately a copy, not a join to '
  'profiles: a signed document must keep saying what it said on the day.';
