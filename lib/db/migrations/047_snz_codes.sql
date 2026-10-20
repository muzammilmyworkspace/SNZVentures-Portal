-- ---------------------------------------------------------------------------
-- THIS PORTAL IS SNZ VENTURES AGAIN: codes go back to SNZ-.
--
-- 046 renamed consultant codes and case references to AF- when the portal was
-- rebranded. AdmitsFair now runs its own portal on its own database, and this
-- one stays SnZ Ventures, so the codes are made with SNZ- again and the ones
-- 046 renamed are renamed back.
--
-- 046 itself is left as it was: it has been applied, and its checksum is
-- recorded. Invoice numbers are NOT touched, for the same reason as in 046.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION new_consultant_code(person_name TEXT) RETURNS TEXT AS $$
DECLARE
  stem TEXT := upper(left(regexp_replace(coalesce(person_name, ''), '[^A-Za-z]', '', 'g'), 3));
  candidate TEXT;
BEGIN
  IF length(stem) < 3 THEN stem := rpad(stem, 3, 'X'); END IF;
  LOOP
    candidate := 'SNZ-' || stem || lpad((floor(random() * 900) + 100)::int::text, 3, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM users
       WHERE upper(consultant_code) IN (candidate, 'AF-' || substr(candidate, 5))
    );
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_case_reference() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference IS NULL THEN
    NEW.reference := 'SNZ-' || to_char(now(), 'YYYY') || '-' ||
                     lpad(nextval('case_reference_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE users
   SET consultant_code = 'SNZ-' || substr(consultant_code, 4)
 WHERE upper(consultant_code) LIKE 'AF-%';

UPDATE cases
   SET reference = 'SNZ-' || substr(reference, 4)
 WHERE reference LIKE 'AF-%';
