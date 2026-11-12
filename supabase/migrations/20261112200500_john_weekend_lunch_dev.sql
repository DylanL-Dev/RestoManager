-- RM-JOHN-01: restaurant-specific Saturday/Sunday lunch closures.
-- Already applied to Supabase DEV exclusively on 2026-11-12.
-- NEVER copy DEV reservations, rooms or hours into PROD.
ALTER TABLE public.restaurant_hours
 ADD COLUMN IF NOT EXISTS saturday_lunch_closed boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS sunday_lunch_closed boolean NOT NULL DEFAULT false;

UPDATE public.restaurant_hours h
SET saturday_lunch_closed=true,sunday_lunch_closed=true
FROM public.restaurants r
WHERE h.restaurant_id=r.id
 AND r.name='À l’Épicerie — Mercure Rouen Centre Champ-de-Mars';

CREATE OR REPLACE FUNCTION private.reject_closed_weekend_lunch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog,public,private
AS $$
DECLARE local_start timestamp; weekday integer; hh record;
BEGIN
 IF TG_OP='UPDATE' AND NEW.starts_at IS NOT DISTINCT FROM OLD.starts_at
   AND NEW.restaurant_id IS NOT DISTINCT FROM OLD.restaurant_id THEN RETURN NEW; END IF;
 local_start := NEW.starts_at AT TIME ZONE 'Europe/Paris';
 weekday := EXTRACT(ISODOW FROM local_start)::integer;
 IF weekday NOT IN (6,7) THEN RETURN NEW; END IF;
 SELECT h.lunch_start,h.lunch_end,h.saturday_lunch_closed,h.sunday_lunch_closed
 INTO hh FROM public.restaurant_hours h WHERE h.restaurant_id=NEW.restaurant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Horaires du restaurant introuvables' USING ERRCODE='23514'; END IF;
 IF ((weekday=6 AND hh.saturday_lunch_closed) OR (weekday=7 AND hh.sunday_lunch_closed))
   AND local_start::time >= hh.lunch_start AND local_start::time <= hh.lunch_end THEN
   RAISE EXCEPTION 'Le restaurant est fermé le % midi : choisissez un service ouvert.',
      CASE WHEN weekday=6 THEN 'samedi' ELSE 'dimanche' END USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_closed_weekend_lunch ON public.reservations;
CREATE TRIGGER reject_closed_weekend_lunch
BEFORE INSERT OR UPDATE OF starts_at,restaurant_id ON public.reservations
FOR EACH ROW EXECUTE FUNCTION private.reject_closed_weekend_lunch();
