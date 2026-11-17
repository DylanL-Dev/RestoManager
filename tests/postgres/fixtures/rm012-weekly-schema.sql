-- RM-JOHN-02 — seven independently configurable service days, DEV ONLY.
-- Preserve all existing reservations and current opening times.
ALTER TABLE public.restaurant_hours ADD COLUMN IF NOT EXISTS weekly_schedule jsonb;

-- Initialise once from the current restaurant-specific hours and weekend closures.
UPDATE public.restaurant_hours h
SET weekly_schedule = (
 SELECT jsonb_object_agg(d.day_key,
   jsonb_build_object(
     'lunch',jsonb_build_object('enabled',h.lunch_enabled AND NOT ((d.n=6 AND h.saturday_lunch_closed) OR (d.n=7 AND h.sunday_lunch_closed)),'start',to_char(h.lunch_start,'HH24:MI'),'end',to_char(h.lunch_end,'HH24:MI')),
     'dinner',jsonb_build_object('enabled',h.dinner_enabled,'start',to_char(h.dinner_start,'HH24:MI'),'end',to_char(h.dinner_end,'HH24:MI'))
   ))
 FROM (VALUES (1,'monday'),(2,'tuesday'),(3,'wednesday'),(4,'thursday'),(5,'friday'),(6,'saturday'),(7,'sunday')) AS d(n,day_key)
)
WHERE h.weekly_schedule IS NULL;

-- Validate the complete configuration on every write: no partially configured days.
CREATE OR REPLACE FUNCTION private.validate_restaurant_weekly_schedule()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,private AS $$
DECLARE d text; service text; part jsonb; open_at text; close_at text; next_end time;
BEGIN
 IF NEW.weekly_schedule IS NULL THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.weekly_schedule) <> 'object'
   OR (SELECT count(*) FROM jsonb_object_keys(NEW.weekly_schedule)) <> 7 THEN
   RAISE EXCEPTION 'Le planning doit contenir exactement les sept jours.' USING ERRCODE='23514';
 END IF;
 FOREACH d IN ARRAY ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] LOOP
   IF NOT NEW.weekly_schedule ? d THEN RAISE EXCEPTION 'Jour manquant dans le planning : %',d USING ERRCODE='23514'; END IF;
   FOREACH service IN ARRAY ARRAY['lunch','dinner'] LOOP
     part := NEW.weekly_schedule -> d -> service;
     IF jsonb_typeof(part) <> 'object'
        OR jsonb_typeof(part->'enabled') <> 'boolean'
        OR jsonb_typeof(part->'start') <> 'string'
        OR jsonb_typeof(part->'end') <> 'string' THEN
       RAISE EXCEPTION 'Planning invalide : % / %',d,service USING ERRCODE='23514';
     END IF;
     open_at := part->>'start'; close_at := part->>'end';
     IF open_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR close_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR open_at >= close_at THEN
       RAISE EXCEPTION 'Heures incorrectes : % / %',d,service USING ERRCODE='23514';
     END IF;
   END LOOP;
   IF (NEW.weekly_schedule->d->'lunch'->>'enabled')::boolean
      AND (NEW.weekly_schedule->d->'dinner'->>'enabled')::boolean
      AND NEW.weekly_schedule->d->'lunch'->>'end' >= NEW.weekly_schedule->d->'dinner'->>'start' THEN
     RAISE EXCEPTION 'Les services se chevauchent pour %',d USING ERRCODE='23514';
   END IF;
 END LOOP;
 RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS validate_restaurant_weekly_schedule ON public.restaurant_hours;
CREATE TRIGGER validate_restaurant_weekly_schedule
BEFORE INSERT OR UPDATE OF weekly_schedule ON public.restaurant_hours
FOR EACH ROW EXECUTE FUNCTION private.validate_restaurant_weekly_schedule();

CREATE OR REPLACE FUNCTION private.reject_closed_weekly_service()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,private AS $$
DECLARE local_start timestamp; day_key text; hh jsonb; allowed boolean; part jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW.starts_at IS NOT DISTINCT FROM OLD.starts_at
   AND NEW.restaurant_id IS NOT DISTINCT FROM OLD.restaurant_id THEN RETURN NEW; END IF;
 local_start:= NEW.starts_at AT TIME ZONE 'Europe/Paris';
 day_key:=(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[EXTRACT(ISODOW FROM local_start)::integer];
 SELECT weekly_schedule->day_key INTO hh FROM public.restaurant_hours WHERE restaurant_id=NEW.restaurant_id;
 IF hh IS NULL THEN RAISE EXCEPTION 'Planning hebdomadaire du restaurant indisponible.' USING ERRCODE='23514'; END IF;
 allowed:=false;
 FOREACH part IN ARRAY ARRAY[hh->'lunch',hh->'dinner'] LOOP
   IF (part->>'enabled')::boolean AND (local_start::time >= (part->>'start')::time)
      AND (local_start::time <= (part->>'end')::time) THEN allowed:=true;EXIT; END IF;
 END LOOP;
 IF NOT allowed THEN
   RAISE EXCEPTION 'Aucun service ouvert le % à % : choisissez un autre créneau.',day_key,to_char(local_start,'HH24:MI')
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS reject_closed_weekend_lunch ON public.reservations;
DROP TRIGGER IF EXISTS reject_closed_weekly_service ON public.reservations;
CREATE TRIGGER reject_closed_weekly_service
BEFORE INSERT OR UPDATE OF starts_at,restaurant_id ON public.reservations
FOR EACH ROW EXECUTE FUNCTION private.reject_closed_weekly_service();
