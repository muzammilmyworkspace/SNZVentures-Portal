-- ---------------------------------------------------------------------------
-- THE CHECKLIST OUTLIVES THE APPLICATION.
--
-- The ticks were kept inside intake_forms.data, alongside the answers. That
-- made them part of the application, and the application locks the moment it
-- is submitted — so the checklist became unreachable at precisely the point it
-- starts to matter. Attestation stamps, the Apostille, the police certificate
-- and the whole visa list all happen AFTER the file goes in.
--
-- One row per person per item. Ticking inserts, unticking deletes, and the
-- primary key makes a double tap idempotent rather than a duplicate.
--
-- `ticked_at` is kept because staff are asked "when did you get your MOFA
-- stamp" and a date the applicant recorded themselves is a better answer than
-- asking them to remember.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS checklist_ticks (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The item's id from lib/application/checklist.ts. Deliberately not a
  -- foreign key: the list is code, it will gain and lose items over time, and
  -- a tick against an item that has since been reworded is still a record of
  -- what somebody did.
  item_id    TEXT NOT NULL,
  ticked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS checklist_ticks_user_idx ON checklist_ticks (user_id);

ALTER TABLE checklist_ticks ENABLE ROW LEVEL SECURITY;

-- GUARDED, because `anon` and `authenticated` exist only on Supabase. See the
-- block in 002 for the reasoning in full.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON checklist_ticks FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;

COMMENT ON TABLE checklist_ticks IS
  'An applicant''s own record of which document requirements they have met. '
  'Deliberately separate from intake_forms: the checklist spans the admission '
  'AND visa stages, and must stay usable long after the application locks.';
