-- ---------------------------------------------------------------------------
-- 005 — Student consent, and a case for every submitted enquiry.
--
-- ADDITIVE. One new table, one new column, nothing dropped or rewritten.
-- 001–004 are applied to production and stay exactly as they are.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- consents ----
-- A consent is only worth something if you can say WHAT was agreed, by whom,
-- and when. A boolean column on `users` would record that somebody once ticked
-- a box, against wording that may since have changed — which proves nothing.
--
-- So each row keeps the VERSION of the text that was on screen, the name the
-- person typed as their signature, and the address and browser it came from.
-- Together those are what makes the record worth keeping.
--
-- The row is NOT deleted if the consent is superseded: a new version is a new
-- row. History is the point.
CREATE TABLE IF NOT EXISTS consents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Room for other undertakings later without a second table.
  kind        TEXT NOT NULL DEFAULT 'student_undertaking',
  version     TEXT NOT NULL,
  -- Typed by the applicant as their signature, exactly as the paper form asks.
  signed_name TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip          TEXT,
  user_agent  TEXT,
  -- One acceptance per person per version. Re-submitting the same version is
  -- not a second agreement, and a duplicate would only make the record harder
  -- to read later.
  CONSTRAINT consents_unique_per_version UNIQUE (user_id, kind, version)
);
CREATE INDEX IF NOT EXISTS consents_user_idx ON consents (user_id, accepted_at DESC);

-- ---------------------------------------------------- case for an enquiry ----
-- Submitting the admission form used to create an intake_forms row and nothing
-- else. Staff saw it under Requests, but there was no case — so the documents
-- someone uploaded, the consent they signed and the answers they gave were
-- three unrelated things on three screens, and "open this applicant's file"
-- was not an action anyone could take.
--
-- `intake_forms.case_id` already existed and was never populated. The
-- application now opens a case at submission and fills it in, which is what
-- makes one enquiry one thing.
--
-- Nothing here backfills existing rows: there are none submitted in production,
-- and inventing cases for records that never had them would put rows in front
-- of staff that no one ever actually opened.

-- Reference numbers already come from the sequence added in 003.

-- ------------------------------------------------------------------ RLS ----
-- Same posture as every other table: enabled, with no policy. The published
-- anon key can therefore do nothing at all; the application connects as the
-- table owner and authorises in code. See 002 for the reasoning in full.
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

-- GUARDED, because `anon` and `authenticated` exist only on Supabase. A bare
-- REVOKE naming them aborts the whole migration on any database that does not
-- have those roles — which is every fresh one, including the throwaway database
-- `npm run db:verify` builds to check these files still apply cleanly. That is
-- exactly how this was caught: the migration ran fine against production and
-- failed the moment it met a database that was not Supabase.
--
-- Same shape as the block in 002 and 003; see 002 for the reasoning in full.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON consents FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
