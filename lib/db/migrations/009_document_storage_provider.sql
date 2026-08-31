-- ---------------------------------------------------------------------------
-- WHERE A DOCUMENT ACTUALLY LIVES.
--
-- Reads used to sign URLs with whichever transport was configured AT READ TIME,
-- on the assumption that it is the one that did the writing. That holds right
-- up until the configuration changes — and then every file written under the
-- old transport becomes unreadable, silently, with the key still sitting in the
-- row looking perfectly healthy.
--
-- A stored object is not addressable without knowing which store it is in, so
-- the store is part of the address and belongs in the row.
--
-- Existing rows are backfilled to 'supabase': every upload before this
-- migration was attempted against Supabase, because that is what the transport
-- picker returned whenever the Supabase variables were set at all.
-- ---------------------------------------------------------------------------

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS storage_provider TEXT;

UPDATE documents
   SET storage_provider = 'supabase'
 WHERE storage_provider IS NULL
   AND storage_key IS NOT NULL;

COMMENT ON COLUMN documents.storage_provider IS
  'Which transport wrote this object: supabase | blob | s3. Reads sign with '
  'this, not with whatever is configured today, so changing transports does '
  'not orphan what is already stored.';
