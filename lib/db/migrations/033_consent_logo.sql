-- ---------------------------------------------------------------------------
-- A LOGO ON THE CONSENT.
--
-- Shown at the head of the consent students read and sign. Kept in the row
-- itself (it is small, capped at 512 KB by the API) so it works without file
-- storage and stays with the version it was published in.
-- ---------------------------------------------------------------------------

ALTER TABLE consent_templates
  ADD COLUMN IF NOT EXISTS logo_data BYTEA,
  ADD COLUMN IF NOT EXISTS logo_type TEXT;
