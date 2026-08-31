-- =============================================================================
-- SNZ VENTURES — PRODUCTION SCHEMA (001)
--
-- PostgreSQL 13+. Requires NO extensions: gen_random_uuid() has been in core
-- since PG13. That matters on managed providers (Neon, Supabase, RDS) where
-- the application role often lacks the rights to CREATE EXTENSION, so needing
-- pgcrypto would make this migration fail for reasons unrelated to the schema.
-- =============================================================================

-- ---------------------------------------------------------------- enums ----
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM
    ('student','professional','business','advisor','admin','super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active','suspended','pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE case_status AS ENUM
    ('new','assessment','in_progress','documents_required','under_review',
     'awaiting_client','completed','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE case_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_status AS ENUM
    ('required','uploaded','pending_review','approved','rejected','needs_update');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('open','in_progress','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM
    ('requested','confirmed','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM
    ('draft','submitted','under_review','awaiting_response','accepted','rejected','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------- users ----
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'student',
  status          user_status NOT NULL DEFAULT 'active',
  password_hash   TEXT NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness: emails are compared lowercased everywhere.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);
CREATE INDEX IF NOT EXISTS users_created_idx ON users (created_at DESC);

-- Single-use tokens for verification and password reset.
CREATE TABLE IF NOT EXISTS user_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('email_verify','password_reset')),
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_tokens_hash_key ON user_tokens (token_hash);
CREATE INDEX IF NOT EXISTS user_tokens_user_idx ON user_tokens (user_id, kind);

-- ------------------------------------------------------------- profiles ----
-- Shared contact block; pathway specifics live in the typed tables below.
CREATE TABLE IF NOT EXISTS profiles (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone        TEXT,
  nationality  TEXT,
  country      TEXT,
  city         TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level            TEXT,
  field_of_study   TEXT,
  destination      TEXT,
  intake           TEXT,
  scholarship      TEXT,
  budget           TEXT,
  language_level   TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS professional_profiles (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT,
  experience_years   TEXT,
  industry           TEXT,
  skills             TEXT,
  destination        TEXT,
  relocation         TEXT,
  language_level     TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_profiles (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name    TEXT,
  industry         TEXT,
  current_location TEXT,
  target_country   TEXT,
  objective        TEXT,
  company_type     TEXT,
  stage            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------ staff assignment ----
CREATE TABLE IF NOT EXISTS staff_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  advisor_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_assignment_unique UNIQUE (client_id, advisor_id)
);
CREATE INDEX IF NOT EXISTS staff_assignments_advisor_idx ON staff_assignments (advisor_id);
CREATE INDEX IF NOT EXISTS staff_assignments_client_idx ON staff_assignments (client_id);

-- ---------------------------------------------------------------- cases ----
CREATE TABLE IF NOT EXISTS cases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  advisor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  pathway      TEXT NOT NULL CHECK (pathway IN ('study','career','business')),
  title        TEXT NOT NULL,
  country      TEXT,
  status       case_status NOT NULL DEFAULT 'new',
  priority     case_priority NOT NULL DEFAULT 'normal',
  stage_index  SMALLINT NOT NULL DEFAULT 0,
  next_action  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cases_client_idx ON cases (client_id);
CREATE INDEX IF NOT EXISTS cases_advisor_idx ON cases (advisor_id);
CREATE INDEX IF NOT EXISTS cases_status_idx ON cases (status);
CREATE INDEX IF NOT EXISTS cases_updated_idx ON cases (updated_at DESC);

-- --------------------------------------------------------- opportunities ----
CREATE TABLE IF NOT EXISTS opportunities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN ('role','programme','scholarship')),
  title         TEXT NOT NULL,
  organisation  TEXT NOT NULL,
  country       TEXT NOT NULL,
  location      TEXT,
  employment    TEXT,
  industry      TEXT,
  summary       TEXT,
  requirements  TEXT[],
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunities_published_idx ON opportunities (is_published, country);

-- ---------------------------------------------------------- applications ----
CREATE TABLE IF NOT EXISTS applications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID REFERENCES cases(id) ON DELETE CASCADE,
  client_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  organisation   TEXT,
  country        TEXT,
  status         application_status NOT NULL DEFAULT 'draft',
  next_action    TEXT,
  submitted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_client_idx ON applications (client_id);
CREATE INDEX IF NOT EXISTS applications_case_idx ON applications (case_id);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications (status);

-- ------------------------------------------------------------ documents ----
-- storage_key is a private object-store path. It is NEVER a public URL;
-- downloads are always brokered through a short-lived signed link.
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id       UUID REFERENCES cases(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  status        document_status NOT NULL DEFAULT 'required',
  storage_key   TEXT,
  mime_type     TEXT,
  size_bytes    BIGINT,
  reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents (owner_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status);
CREATE INDEX IF NOT EXISTS documents_case_idx ON documents (case_id);

-- ---------------------------------------------------------------- tasks ----
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id      UUID REFERENCES cases(id) ON DELETE CASCADE,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  detail       TEXT,
  status       task_status NOT NULL DEFAULT 'open',
  priority     case_priority NOT NULL DEFAULT 'normal',
  due_at       TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks (assignee_id, status);
CREATE INDEX IF NOT EXISTS tasks_case_idx ON tasks (case_id);

-- --------------------------------------------------------- appointments ----
CREATE TABLE IF NOT EXISTS appointments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  advisor_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  case_id     UUID REFERENCES cases(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,
  starts_at   TIMESTAMPTZ,
  duration_minutes SMALLINT DEFAULT 30,
  status      appointment_status NOT NULL DEFAULT 'requested',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_client_idx ON appointments (client_id);
CREATE INDEX IF NOT EXISTS appointments_advisor_idx ON appointments (advisor_id);
CREATE INDEX IF NOT EXISTS appointments_starts_idx ON appointments (starts_at);

-- -------------------------------------------------------------- messaging ----
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id     UUID REFERENCES cases(id) ON DELETE SET NULL,
  subject     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_client_idx ON conversations (client_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body             TEXT NOT NULL,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_unread_idx ON messages (conversation_id) WHERE read_at IS NULL;

-- -------------------------------------------------------- notifications ----
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  href        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- ----------------------------------------------------------- audit logs ----
-- Append-only. Never store credentials, tokens or secrets in `meta`.
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  entity       TEXT,
  entity_id    TEXT,
  meta         JSONB,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);
