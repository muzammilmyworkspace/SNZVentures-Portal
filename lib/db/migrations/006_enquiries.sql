-- ---------------------------------------------------------------------------
-- 006 — Somewhere for public enquiries to live.
--
-- ADDITIVE. One new table, nothing dropped or rewritten.
--
-- WHY THIS EXISTS
-- The contact form emailed the enquiry and stored nothing. With no mail
-- transport configured it returned 503 and wrote a line to the server console,
-- so every enquiry submitted was lost — on the primary conversion path of the
-- whole marketing site. Even once mail works, a provider outage or a bounced
-- address would silently swallow a lead, and nobody would ever know a person
-- had tried to get in touch.
--
-- The enquiry is now written here FIRST and emailed second. Delivery becomes a
-- convenience rather than the only copy: if the email fails, the enquiry is
-- still on the file and staff can see it in the portal.
--
-- `delivered` records whether the email actually went out, so a queue of
-- undelivered enquiries is visible rather than assumed empty.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS enquiries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pathway           TEXT NOT NULL CHECK (pathway IN ('study','career','business','general')),
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  preferred_contact TEXT,
  notes             TEXT,
  -- The remaining answers, which differ per pathway. Kept as JSON rather than
  -- forty nullable columns for questions that change with the form.
  answers           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- FALSE until the email is confirmed sent. An enquiry that never reached an
  -- inbox needs to be findable, not merely absent.
  delivered         BOOLEAN NOT NULL DEFAULT FALSE,
  -- Set when a staff member has actually dealt with it.
  handled_at        TIMESTAMPTZ,
  ip                TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Newest first is the only order anyone reads this in; undelivered first is the
-- queue that actually needs working through.
CREATE INDEX IF NOT EXISTS enquiries_created_idx ON enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS enquiries_pending_idx ON enquiries (handled_at, created_at DESC);

-- ------------------------------------------------------------------ RLS ----
-- Same posture as every other table: enabled, with no policy, so the published
-- anon key can do nothing at all. The application connects as the table owner
-- and authorises in code. See 002 for the reasoning in full.
--
-- This one matters more than most: the rows hold a member of the public's name,
-- email, phone number and whatever they chose to tell us.
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON enquiries FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
