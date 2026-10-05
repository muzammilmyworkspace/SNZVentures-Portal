-- ---------------------------------------------------------------------------
-- APPLICATIONS MOVED ONLY BECAUSE THEIR CASE WAS COMPLETED GO TO COMPLETED.
--
-- 026 put them under Applied, the last stage there was. A completed case
-- means a finished file, which is what the new Completed stage is for. Only
-- the ones 026 moved (still Applied, with its note in their history) are
-- touched; anything staff marked Applied themselves stays where it is.
-- ---------------------------------------------------------------------------

WITH moved AS (
  UPDATE intake_forms f
     SET status = 'completed', updated_at = now()
   WHERE f.status = 'applied'
     AND EXISTS (
       SELECT 1 FROM status_history h
        WHERE h.entity = 'application' AND h.entity_id = f.id
          AND h.note = 'Moved to Applied because its case was already completed.'
     )
     AND NOT EXISTS (
       SELECT 1 FROM status_history h
        WHERE h.entity = 'application' AND h.entity_id = f.id
          AND h.actor_id IS NOT NULL AND h.to_status = 'applied'
     )
  RETURNING f.id, f.user_id
)
INSERT INTO status_history (entity, entity_id, subject_id, from_status, to_status, note, internal)
SELECT 'application', id, user_id, 'applied', 'completed',
       'Moved to Completed because its case was already completed.', TRUE
  FROM moved;
