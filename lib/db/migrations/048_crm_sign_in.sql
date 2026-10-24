-- ---------------------------------------------------------------------------
-- SIGN-IN FROM THE CRM ("Open portal").
--
-- A sales agent signed in to crm.admitsfair.com opens the portal with one
-- click. The CRM sends a short-lived ticket signed with CRM_PORTAL_SECRET; the
-- portal accepts each ticket once. This table remembers the tickets already
-- used, so a copied ticket cannot sign anybody in a second time. Rows older
-- than a day are useless (a ticket lives two minutes) and are pruned on use.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_sign_in_tickets (
  nonce    TEXT PRIMARY KEY,
  user_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  used_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm_sign_in_tickets ENABLE ROW LEVEL SECURITY;

-- Supabase's API roles must not reach this table (same pattern as 023).
DO $$
DECLARE
  api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON crm_sign_in_tickets FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
