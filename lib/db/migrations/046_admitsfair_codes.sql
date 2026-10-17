-- ---------------------------------------------------------------------------
-- SNZ VENTURES IS NOW ADMITSFAIR: the codes people read and type.
--
-- Consultant codes (typed by students at sign-up) and case references (quoted
-- on the phone and in messages) were made with an SNZ- prefix by the database
-- (migrations 024 and 003). From now on they are made with AF-, and the ones
-- already given are renamed the same way, so nothing on screen says SNZ.
--
-- A code printed before the change (SNZ-HIN482 on a flyer) keeps working: the
-- portal looks a code up by the part after the prefix (lib/db/repos/invites).
--
-- Invoice numbers are NOT touched here. An issued invoice is a legal document
-- and is never renumbered (the trigger from 017 refuses it anyway); new tax
-- invoices are numbered AF-YYYY-NNN by the application.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION new_consultant_code(person_name TEXT) RETURNS TEXT AS $$
DECLARE
  stem TEXT := upper(left(regexp_replace(coalesce(person_name, ''), '[^A-Za-z]', '', 'g'), 3));
  candidate TEXT;
BEGIN
  IF length(stem) < 3 THEN stem := rpad(stem, 3, 'X'); END IF;
  LOOP
    candidate := 'AF-' || stem || lpad((floor(random() * 900) + 100)::int::text, 3, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM users
       WHERE upper(consultant_code) IN (candidate, 'SNZ-' || substr(candidate, 4))
    );
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_case_reference() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference IS NULL THEN
    NEW.reference := 'AF-' || to_char(now(), 'YYYY') || '-' ||
                     lpad(nextval('case_reference_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE users
   SET consultant_code = 'AF-' || substr(consultant_code, 5)
 WHERE upper(consultant_code) LIKE 'SNZ-%';

UPDATE cases
   SET reference = 'AF-' || substr(reference, 5)
 WHERE reference LIKE 'SNZ-%';
