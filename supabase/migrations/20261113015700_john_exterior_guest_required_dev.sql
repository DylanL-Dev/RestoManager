-- RM-JOHN-05 (DEV ONLY): a named external guest is required on new reservations.
-- Existing reservations and hotel guests remain intact.
CREATE OR REPLACE FUNCTION private.require_named_exterior_guest()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,private AS $$
DECLARE ext boolean;
BEGIN
 ext := position('[RESTOMANAGER:EXTERIEUR]' in coalesce(NEW.notes,''))>0;
 IF ext AND (
    TG_OP='INSERT'
    OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
    OR NEW.notes IS DISTINCT FROM OLD.notes
 ) THEN
   IF btrim(coalesce(NEW.guest_name,''))=''
      OR lower(btrim(NEW.guest_name)) IN ('client extérieur','client exterieur','sans nom','anonyme') THEN
      RAISE EXCEPTION 'Le nom du client extérieur est obligatoire.'
        USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS require_named_exterior_guest ON public.reservations;
CREATE TRIGGER require_named_exterior_guest BEFORE INSERT OR UPDATE OF guest_name,notes
 ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.require_named_exterior_guest();
