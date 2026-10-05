-- ---------------------------------------------------------------------------
-- WHERE AN ENQUIRY CAME FROM, AND THE WHATSAPP CHATS THAT NEVER FILLED A FORM.
--
-- An enquiry recorded who and what, never how they found us. "Did that come
-- from the Facebook ad or from Google" could only be answered by asking the
-- student. The website now sends, with each form:
--
--   source    google / facebook / instagram / whatsapp / … / direct / other,
--             derived from the UTM source or the referrer
--   page      the path the form was filled on
--   landing   the first page of the visit (first touch)
--   referrer  the referring host, not the full URL
--   utm       utm_source, utm_medium, utm_campaign, utm_content, utm_term
--
-- whatsapp_at is set when the visitor presses "Send on WhatsApp" after the
-- form, so staff know the same person may also be in the WhatsApp inbox.
--
-- whatsapp_clicks records every press of a WhatsApp link on the site. Most
-- people who message on WhatsApp never fill the form, and until now nothing
-- counted them. No name or message is known at that point — only where the
-- button was, which page, and where the visitor came from.
--
-- Additive only. Every existing enquiry keeps NULLs and reads "Not recorded".
-- ---------------------------------------------------------------------------

ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS source      TEXT,
  ADD COLUMN IF NOT EXISTS page        TEXT,
  ADD COLUMN IF NOT EXISTS landing     TEXT,
  ADD COLUMN IF NOT EXISTS referrer    TEXT,
  ADD COLUMN IF NOT EXISTS utm         JSONB,
  ADD COLUMN IF NOT EXISTS whatsapp_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS whatsapp_clicks (
  id          BIGSERIAL PRIMARY KEY,
  placement   TEXT,
  page        TEXT,
  landing     TEXT,
  source      TEXT,
  referrer    TEXT,
  utm         JSONB,
  enquiry_id  UUID REFERENCES enquiries(id) ON DELETE SET NULL,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_clicks_created_idx ON whatsapp_clicks (created_at DESC);

-- Same posture as every table since 002: RLS on, no policies, so the Supabase
-- REST roles see nothing.
ALTER TABLE whatsapp_clicks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON whatsapp_clicks FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON SEQUENCE whatsapp_clicks_id_seq FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
