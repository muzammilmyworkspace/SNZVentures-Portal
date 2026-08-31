-- ---------------------------------------------------------------------------
-- GOOGLE DRIVE — one connection, for the whole business.
--
-- Not per user. This is the firm's Drive, connected once by an admin, and a
-- case exported to it is exported to the same place regardless of which member
-- of staff pressed the button. A per-user connection would scatter client
-- files across whichever advisor happened to be on shift.
--
-- THE REFRESH TOKEN IS STORED ENCRYPTED, not in the clear. It is a long-lived
-- credential to a Google account holding client passports; a database dump, a
-- backup on somebody's laptop, or a support engineer with read access should
-- not be a route to it. Encrypted with AUTH_SECRET via AES-256-GCM — see
-- lib/integrations/secret-box.ts.
--
-- ONE ROW, enforced. `id` is fixed to TRUE, so a second connection cannot be
-- created by accident and "which one is live" is never a question.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS drive_connection (
  id              BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  -- AES-256-GCM, base64. Never the raw token.
  refresh_token   TEXT NOT NULL,
  -- The Google account the files will belong to, for the admin screen to show.
  account_email   TEXT,
  -- The folder we create and own. Everything is written beneath it, and the
  -- `drive.file` scope means we can touch nothing else in their Drive.
  root_folder_id  TEXT,
  connected_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT
);

-- Where each client's folder landed, so a second export updates the same one
-- rather than making a second folder with the same name.
--
-- Keyed by the CLIENT, not by a case. "The whole case" as staff mean it is
-- everything belonging to one applicant — their answers, their documents,
-- their receipt, their signature — and that is what a university is sent.
CREATE TABLE IF NOT EXISTS drive_exports (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  folder_id   TEXT NOT NULL,
  folder_url  TEXT NOT NULL,
  exported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_count  INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE drive_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_exports ENABLE ROW LEVEL SECURITY;

-- GUARDED, because `anon` and `authenticated` exist only on Supabase. See the
-- block in 002 for the reasoning in full.
DO $$
DECLARE
  api_role text;
  tbl      text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['drive_connection', 'drive_exports'] LOOP
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I', tbl, api_role);
      END IF;
    END LOOP;
  END LOOP;
END
$$;

COMMENT ON TABLE drive_connection IS
  'The single Google Drive the firm exports client cases to. One row by '
  'construction. The refresh token is encrypted at rest.';
