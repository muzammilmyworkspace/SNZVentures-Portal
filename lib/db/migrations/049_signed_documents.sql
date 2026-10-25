-- ---------------------------------------------------------------------------
-- SIGNED DOCUMENTS: the record a court or an embassy can be shown.
--
-- 1. consent_templates gets a fourth category, 'payment': the payment terms a
--    student accepts before choosing a plan and paying the initial fee. They
--    are edited, versioned and published like the student consent.
--
-- 2. signed_documents keeps, for every signature, the PDF made at that moment:
--    the exact words the person agreed to, followed by a certificate with who,
--    when, from which IP and device, and a SHA-256 fingerprint of the words.
--    kind = 'student_undertaking' (the consent signed with the application)
--    or 'payment_terms' (accepted before the fee). One per person, kind and
--    version, like the acceptances themselves. A copy also goes to the
--    student's folder in Google Drive (drive_synced_at).
--
-- 3. payment_plans records the browser that accepted the terms, as consents
--    already do.
-- ---------------------------------------------------------------------------

ALTER TABLE consent_templates DROP CONSTRAINT IF EXISTS consent_templates_category_check;
ALTER TABLE consent_templates
  ADD CONSTRAINT consent_templates_category_check
  CHECK (category IN ('student', 'consultant', 'consultant_student', 'payment'));

CREATE TABLE IF NOT EXISTS signed_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('student_undertaking', 'payment_terms')),
  version         TEXT NOT NULL,
  signed_name     TEXT NOT NULL,
  signed_at       TIMESTAMPTZ NOT NULL,
  ip              TEXT,
  user_agent      TEXT,
  sha256          TEXT NOT NULL,
  pdf             BYTEA NOT NULL,
  drive_synced_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT signed_documents_one_per_version UNIQUE (user_id, kind, version)
);
CREATE INDEX IF NOT EXISTS signed_documents_kind_idx ON signed_documents (kind, signed_at DESC);

ALTER TABLE payment_plans ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE signed_documents ENABLE ROW LEVEL SECURITY;

-- Supabase's API roles must not reach this table (same pattern as 023).
DO $$
DECLARE
  api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON signed_documents FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
