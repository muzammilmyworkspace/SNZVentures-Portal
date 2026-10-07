-- ---------------------------------------------------------------------------
-- CONSULTANTS WHO APPLY THEMSELVES.
--
-- Somebody signs up as a consultant: they get the role 'applicant', which can
-- open nothing but their own application. They fill in their details and
-- company documents and submit. The super admin reviews it and sends them the
-- SnZ Ventures <-> consultant consent; they sign it in the portal; the super
-- admin approves, and only then does the account become a consultant
-- ('advisor', which also gives it a consultant code). Or it is rejected.
--
-- The older way stays: the super admin adds a consultant by email.
-- ---------------------------------------------------------------------------

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'applicant';

CREATE TABLE IF NOT EXISTS consultant_applications (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'submitted', 'consent_sent', 'consent_signed', 'approved', 'rejected')),
  phone              TEXT,
  address            TEXT,
  city               TEXT,
  country            TEXT,
  company_name       TEXT,
  company_registered BOOLEAN,
  registration_no    TEXT,
  website            TEXT,
  about              TEXT,
  reject_reason      TEXT,
  submitted_at       TIMESTAMPTZ,
  consent_sent_at    TIMESTAMPTZ,
  consent_signed_at  TIMESTAMPTZ,
  decided_at         TIMESTAMPTZ,
  decided_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consultant_applications_status_idx
  ON consultant_applications (status, submitted_at);
