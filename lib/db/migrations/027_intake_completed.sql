-- ---------------------------------------------------------------------------
-- COMPLETED: the last stage of the student pipeline, after Applied.
--
-- Applied means the universities have the application; Completed means the
-- file is finished. Its own migration because a new enum value cannot be
-- used in the transaction that adds it (028 uses it).
-- ---------------------------------------------------------------------------

ALTER TYPE intake_status ADD VALUE IF NOT EXISTS 'completed';
