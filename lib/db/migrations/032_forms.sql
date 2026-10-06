-- ---------------------------------------------------------------------------
-- FORMS THE SUPER ADMIN CAN CHANGE.
--
-- consent_templates: the consent students sign, as typed text and/or an
-- uploaded document. Every save is a new version and old rows are never
-- edited, so a signature keeps pointing at the words that person read. At
-- most one is current; none current means the built-in wording is used.
--
-- form_definitions: the application form, as the whole definition in JSON.
-- No row means the form as written in code.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consent_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version     INTEGER NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  body        TEXT,
  file_key    TEXT,
  file_name   TEXT,
  file_type   TEXT,
  file_provider TEXT,
  is_current  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (body IS NOT NULL OR file_key IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS consent_templates_one_current
  ON consent_templates (is_current) WHERE is_current;

CREATE TABLE IF NOT EXISTS form_definitions (
  pathway     TEXT PRIMARY KEY CHECK (pathway IN ('study', 'career', 'business')),
  definition  JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
