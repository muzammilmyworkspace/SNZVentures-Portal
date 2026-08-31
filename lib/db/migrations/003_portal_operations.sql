-- ---------------------------------------------------------------------------
-- 003 — Operational layer for the client portal.
--
-- Everything here is ADDITIVE. No column is dropped, no type is renamed, no
-- existing row is rewritten. 001 and 002 are already applied to production and
-- must stay exactly as they are.
--
-- A deliberate non-change: the `professional` value in the user_role enum is
-- displayed as "Job Seeker" in the interface, but the STORED value keeps its
-- original name. Renaming an enum label that 17 tables and a set of RLS-guarded
-- policies depend on is a destructive operation with no functional benefit —
-- the label belongs in the presentation layer, and that is where it lives.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- new enums ----
DO $$ BEGIN
  CREATE TYPE intake_status AS ENUM ('draft','submitted','under_review','accepted','returned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE auth_provider AS ENUM ('password','google');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------- federated sign-in ----
-- Google sign-in, prepared but not yet credentialled.
--
-- password_hash becomes NULLABLE because an account created through an OAuth
-- provider genuinely HAS no password. The alternative — generating a random
-- hash nobody holds — would leave an account that looks password-capable,
-- silently fails "forgot password", and lies to anyone reading the table.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider  auth_provider NOT NULL DEFAULT 'password',
  ADD COLUMN IF NOT EXISTS oauth_subject  TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url     TEXT;

-- One provider identity maps to exactly one account. Partial, so the many
-- password accounts with a NULL subject do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_subject_key
  ON users (auth_provider, oauth_subject)
  WHERE oauth_subject IS NOT NULL;

-- An account must be reachable by SOMETHING. Without this, a bug that clears
-- password_hash on a password account produces a row that can never sign in
-- again and cannot be recovered.
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_has_credential CHECK (
    password_hash IS NOT NULL OR oauth_subject IS NOT NULL
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------ case references ----
-- A human-quotable request ID (SNZ-2026-0007). Staff and clients need to name
-- a case in an email or on the phone; a UUID is unusable for that.
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS cases_reference_key
  ON cases (reference) WHERE reference IS NOT NULL;

-- Monotonic per-year counter. A sequence rather than max()+1 because two
-- concurrent inserts under max()+1 produce the same reference.
CREATE SEQUENCE IF NOT EXISTS case_reference_seq;

CREATE OR REPLACE FUNCTION assign_case_reference() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference IS NULL THEN
    NEW.reference := 'SNZ-' || to_char(now(), 'YYYY') || '-' ||
                     lpad(nextval('case_reference_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_reference_trigger ON cases;
CREATE TRIGGER cases_reference_trigger
  BEFORE INSERT ON cases
  FOR EACH ROW EXECUTE FUNCTION assign_case_reference();

-- Backfill anything that predates the trigger.
UPDATE cases
   SET reference = 'SNZ-' || to_char(created_at, 'YYYY') || '-' ||
                   lpad(nextval('case_reference_seq')::text, 4, '0')
 WHERE reference IS NULL;

-- ------------------------------------------------------- status history ----
-- The journey, kept as an append-only trail so both sides can see how a case
-- reached its current state (§34). Polymorphic on purpose: cases, applications
-- and documents all move through statuses and all deserve the same treatment,
-- and three near-identical tables would drift apart within a month.
CREATE TABLE IF NOT EXISTS status_history (
  id           BIGSERIAL PRIMARY KEY,
  entity       TEXT NOT NULL CHECK (entity IN ('case','application','document')),
  entity_id    UUID NOT NULL,
  -- Denormalised so a client's own history can be scoped without joining out
  -- to three different parent tables on every read.
  subject_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  note         TEXT,
  -- TRUE keeps the entry out of every client-facing query. Used for internal
  -- transitions a client should not be shown.
  internal     BOOLEAN NOT NULL DEFAULT FALSE,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS status_history_entity_idx
  ON status_history (entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS status_history_subject_idx
  ON status_history (subject_id, created_at DESC);

-- --------------------------------------------------------- admin notes ----
-- Staff-only annotations (§16, §18–20). NOTHING in this table may ever reach a
-- client response. It is separated from `status_history.note` for exactly that
-- reason: one table is shown to clients, this one never is, so the boundary is
-- structural rather than a filter someone has to remember to apply.
CREATE TABLE IF NOT EXISTS admin_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id     UUID REFERENCES cases(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_notes_subject_idx
  ON admin_notes (subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_notes_case_idx ON admin_notes (case_id);

-- ------------------------------------------------------- intake forms ----
-- The multi-step admission / career / business intakes (§8, §12, §14).
--
-- One row per user per pathway, with the answers in JSONB. The alternative —
-- a wide column per question — turns every wording change into a migration,
-- and these forms are expected to change as the business learns what to ask.
-- The typed profile tables from 001 stay exactly as they are and remain the
-- home of the small set of fields the rest of the app actually queries on.
CREATE TABLE IF NOT EXISTS intake_forms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pathway       TEXT NOT NULL CHECK (pathway IN ('study','career','business')),
  case_id       UUID REFERENCES cases(id) ON DELETE SET NULL,
  status        intake_status NOT NULL DEFAULT 'draft',
  -- Highest step the user has completed. Lets "Save & continue" resume exactly
  -- where they stopped instead of restarting a nine-step form.
  step          SMALLINT NOT NULL DEFAULT 0,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One live intake per pathway per user. A second "draft" would silently
  -- fork the answers and nobody would know which one staff were reading.
  CONSTRAINT intake_unique_per_pathway UNIQUE (user_id, pathway)
);
CREATE INDEX IF NOT EXISTS intake_forms_status_idx ON intake_forms (status, updated_at DESC);

-- ------------------------------------------- notification preferences ----
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_email    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_messages BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_status   BOOLEAN NOT NULL DEFAULT TRUE;
-- Avatar lives on `users`, not here: an OAuth sign-in supplies it at
-- authentication time, before a profile row necessarily exists.

-- Categorises a notification so the bell can group and the preferences above
-- can actually suppress something. Existing rows default to 'general'.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'general';

-- --------------------------------------------------- conversation state ----
-- Staff need "waiting on us" vs "waiting on them" without opening every thread.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at      TIMESTAMPTZ;

-- ---------------------------------------------------------------- RLS ----
-- Same posture as 002: RLS on, no policies, so the Supabase `anon` key sees
-- nothing. Repeated here because a new table does NOT inherit it.
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_forms   ENABLE ROW LEVEL SECURITY;

-- 002 set ALTER DEFAULT PRIVILEGES, so these tables should already be
-- ungranted. Re-revoking costs nothing and means the hardening does not
-- silently depend on that earlier statement having worked.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
