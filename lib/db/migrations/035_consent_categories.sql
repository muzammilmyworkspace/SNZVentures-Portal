-- ---------------------------------------------------------------------------
-- CONSENTS BY CATEGORY, WITH DRAFTS.
--
-- category
--   student             SnZ Ventures <-> student. Signed at the end of the
--                       application (kind student_undertaking).
--   consultant          SnZ Ventures <-> consultant. Signed by each
--                       consultant at sign-in (kind consultant_agreement).
--   consultant_student  A consultant <-> their own students. Written by the
--                       consultant (owner_id); their students agree to it
--                       before submitting the application (kind
--                       consultant_student).
--
-- status: a draft can be edited and is never shown; publishing makes it the
-- one in use (is_current) for its category and owner. A published version is
-- never edited: "edit" copies it into a new draft, so every signature keeps
-- pointing at the words that person read.
-- ---------------------------------------------------------------------------

ALTER TABLE consent_templates
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'student'
    CHECK (category IN ('student', 'consultant', 'consultant_student')),
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published')),
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE consent_templates SET published_at = created_at
 WHERE status = 'published' AND published_at IS NULL;

-- One in use per category and owner, instead of one overall.
DROP INDEX IF EXISTS consent_templates_one_current;
CREATE UNIQUE INDEX IF NOT EXISTS consent_templates_current_each
  ON consent_templates (category, COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_current;

CREATE INDEX IF NOT EXISTS consent_templates_owner_idx
  ON consent_templates (category, owner_id, version DESC);
