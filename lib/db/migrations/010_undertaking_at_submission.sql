-- ---------------------------------------------------------------------------
-- THE UNDERTAKING MOVES TO WHERE IT MEANS SOMETHING.
--
-- Form B was signed at REGISTRATION. It says "all documents and information
-- provided by me are genuine and accurate" — and at sign-up there are no
-- documents and no information, so the sentence had nothing to refer to at the
-- moment it was signed. It is now the last section of the application, taken
-- on the completed file, and no application submits without it.
--
-- Existing rows are NOT deleted. History is the entire point of this table: a
-- consent is worth something only if you can say what was agreed and when, and
-- erasing an agreement somebody genuinely gave would be the one unforgivable
-- thing to do to a consent record.
--
-- They are RE-KINDED instead. `student_undertaking_signup` says exactly what
-- those rows are: an acceptance taken at sign-up, against the same text, before
-- there was an application. The gate looks for `student_undertaking`, so these
-- no longer satisfy it — which is the point. Everyone signs once, on the file
-- they are actually submitting.
--
-- The unique constraint is (user_id, kind, version), so re-kinding cannot
-- collide with a later signature at the same version.
-- ---------------------------------------------------------------------------

UPDATE consents
   SET kind = 'student_undertaking_signup'
 WHERE kind = 'student_undertaking'
   AND NOT EXISTS (
     SELECT 1 FROM intake_forms f
      WHERE f.user_id = consents.user_id
        AND f.pathway = 'study'
        AND f.status <> 'draft'
   );

COMMENT ON COLUMN consents.kind IS
  'student_undertaking = signed with a completed application, which is what '
  'authorises us to submit it. student_undertaking_signup = the historical '
  'acceptance taken at registration, kept as a record and no longer sufficient.';
