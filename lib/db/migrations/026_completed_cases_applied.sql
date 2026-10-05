-- ---------------------------------------------------------------------------
-- APPLICATIONS WHOSE CASE IS ALREADY COMPLETED GO TO APPLIED.
--
-- Before the pipeline existed, finished work was recorded by completing the
-- case, and the application itself stayed at "submitted" for ever. Those
-- files showed up under Review applications as if nobody had read them.
--
-- Every application whose case is completed (linked, or the same student
-- and pathway when the case was opened by hand), and which is still in
-- review or ready, moves to applied, with a line in its history saying why.
-- Anything sent back to the student (returned) is left alone.
-- ---------------------------------------------------------------------------

WITH moved AS (
  UPDATE intake_forms f
     SET status = 'applied', updated_at = now()
    FROM cases c
   WHERE (c.id = f.case_id
          -- A case opened by hand is not linked; match it by student and pathway.
          OR (f.case_id IS NULL AND c.client_id = f.user_id AND c.pathway::text = f.pathway))
     AND c.status = 'completed'
     AND f.status IN ('submitted', 'under_review', 'accepted')
  RETURNING f.id, f.user_id
)
INSERT INTO status_history (entity, entity_id, subject_id, from_status, to_status, note, internal)
SELECT 'application', id, user_id, NULL, 'applied',
       'Moved to Applied because its case was already completed.', TRUE
  FROM moved;
