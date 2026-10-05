-- ---------------------------------------------------------------------------
-- CONSULTATIONS: request, then a time from us.
--
-- A student or a consultant asks SnZ Ventures for a meeting (topic, how
-- they would like to meet, when suits them). Staff pick the day and time,
-- add the link or place, and confirm; the requester is notified and emailed.
-- The table has existed since 001 with nothing writing to it; these are the
-- columns that flow needs. client_id stays the requester, who may be a
-- consultant as well as a client.
-- ---------------------------------------------------------------------------

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS topic        TEXT,
  ADD COLUMN IF NOT EXISTS mode         TEXT CHECK (mode IN ('video', 'phone', 'office')),
  ADD COLUMN IF NOT EXISTS preferred    TEXT,
  ADD COLUMN IF NOT EXISTS meeting_link TEXT,
  ADD COLUMN IF NOT EXISTS staff_note   TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_status_idx ON appointments (status, created_at DESC);
