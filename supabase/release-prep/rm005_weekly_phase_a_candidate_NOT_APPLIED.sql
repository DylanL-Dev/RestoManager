-- RM-005 WEEKLY PHASE A - PREPARATION ONLY. NOT APPROVED / NOT APPLIED.
-- THIS FILE IS NOT UNDER supabase/migrations. DO NOT EXECUTE AGAINST PROD
-- WITHOUT A RESTORABLE BACKUP, ISOLATED RESTORE REHEARSAL, AND EXPLICIT GO.
-- In scope: add missing hours columns, initialise a neutral 7-day calendar
-- from each establishment's CURRENT PROD common hours, validate the calendar,
-- and initialise new restaurants. No reservations, auth, room, roles,
-- application RPCs or business-hour duration are changed.
-- Phase B (weekly reservation/walk-in guards and frontend) is a SEPARATE gate.

BEGIN;

DO $rm005_baseline$
DECLARE
  found_columns int;
  existing_hours int;
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid='public.restaurant_hours'::regclass AND relrowsecurity
    ) THEN
    RAISE EXCEPTION 'RM-005: RLS disabled unexpectedly; abort';
  END IF;
  SELECT count(*) INTO found_columns
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='restaurant_hours'
    AND column_name IN ('weekly_schedule','saturday_lunch_closed','sunday_lunch_closed');
  IF found_columns<>0 THEN
    RAISE EXCEPTION 'RM-005: weekly columns already exist (%); refusing partial replay',found_columns;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='restaurant_hours'
      AND policyname='same_restaurant' AND cmd='SELECT'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='restaurant_hours'
      AND policyname='same_restaurant' AND cmd='ALL'
  ) THEN
    RAISE EXCEPTION 'RM-005: role-scoped hours RLS guard missing; abort';
  END IF;
  SELECT count(*) INTO existing_hours FROM public.restaurant_hours;
  IF existing_hours=0 THEN
    RAISE EXCEPTION 'RM-005: no restaurant hours rows present; abort';
  END IF;
END
$rm005_baseline$;

ALTER TABLE public.restaurant_hours
  ADD COLUMN saturday_lunch_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN sunday_lunch_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN weekly_schedule jsonb;

-- New restaurants are initialised by private.initialize_restaurant_hours
-- with shared hours and no weekly JSON. Avoid a null weekly schedule
-- on their first day (which would block weekly-aware booking functions).
CREATE OR REPLACE FUNCTION private.rm005_seed_weekly_hours_on_insert_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $rm005$
BEGIN
  IF NEW.weekly_schedule IS NOT NULL THEN RETURN NEW; END IF;
  NEW.weekly_schedule := (
    SELECT jsonb_object_agg(d.day_key, jsonb_build_object(
      'lunch', jsonb_build_object(
        'enabled', NEW.lunch_enabled AND NOT (
          (d.n=6 AND NEW.saturday_lunch_closed)
          OR (d.n=7 AND NEW.sunday_lunch_closed)),
        'start', to_char(NEW.lunch_start,'HH24:MI'),
        'end', to_char(NEW.lunch_end,'HH24:MI')),
      'dinner', jsonb_build_object(
        'enabled', NEW.dinner_enabled,
        'start', to_char(NEW.dinner_start,'HH24:MI'),
        'end', to_char(NEW.dinner_end,'HH24:MI'))
    ))
    FROM (VALUES
      (1,'monday'),(2,'tuesday'),(3,'wednesday'),
      (4,'thursday'),(5,'friday'),(6,'saturday'),(7,'sunday')
    ) AS d(n,day_key)
  );
  RETURN NEW;
END
$rm005$;

-- BEFORE triggers of same event execute in name order:
-- rm005_seed_... fires before validate_restaurant_weekly_schedule.
CREATE TRIGGER rm005_seed_weekly_hours_on_insert
BEFORE INSERT ON public.restaurant_hours
FOR EACH ROW EXECUTE FUNCTION private.rm005_seed_weekly_hours_on_insert_v1();

-- Validation matches the tested DEV seven-day representation.
CREATE OR REPLACE FUNCTION private.validate_restaurant_weekly_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $rm005$
DECLARE
  d text;
  service text;
  part jsonb;
  open_at text;
  close_at text;
BEGIN
  IF NEW.weekly_schedule IS NULL THEN
    RAISE EXCEPTION 'Le planning hebdomadaire doit contenir sept jours.'
      USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(NEW.weekly_schedule) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.weekly_schedule)) <> 7 THEN
    RAISE EXCEPTION 'Le planning doit contenir exactement les sept jours.'
      USING ERRCODE='23514';
  END IF;
  FOREACH d IN ARRAY ARRAY[
    'monday','tuesday','wednesday','thursday','friday','saturday','sunday'
  ] LOOP
    IF NOT NEW.weekly_schedule ? d THEN
      RAISE EXCEPTION 'Jour manquant dans le planning : %',d
        USING ERRCODE='23514';
    END IF;
    FOREACH service IN ARRAY ARRAY['lunch','dinner'] LOOP
      part := NEW.weekly_schedule -> d -> service;
      IF jsonb_typeof(part) IS DISTINCT FROM 'object'
         OR jsonb_typeof(part->'enabled') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(part->'start') IS DISTINCT FROM 'string'
         OR jsonb_typeof(part->'end') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Planning invalide : % / %',d,service
          USING ERRCODE='23514';
      END IF;
      open_at := part->>'start';
      close_at := part->>'end';
      IF open_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         OR close_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         OR open_at >= close_at THEN
        RAISE EXCEPTION 'Heures incorrectes : % / %',d,service
          USING ERRCODE='23514';
      END IF;
    END LOOP;
    IF (NEW.weekly_schedule->d->'lunch'->>'enabled')::boolean
       AND (NEW.weekly_schedule->d->'dinner'->>'enabled')::boolean
       AND NEW.weekly_schedule->d->'lunch'->>'end'
           >= NEW.weekly_schedule->d->'dinner'->>'start' THEN
      RAISE EXCEPTION 'Les services se chevauchent pour %',d
        USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NEW;
END
$rm005$;

CREATE TRIGGER validate_restaurant_weekly_schedule
BEFORE INSERT OR UPDATE OF weekly_schedule
ON public.restaurant_hours
FOR EACH ROW
EXECUTE FUNCTION private.validate_restaurant_weekly_schedule();

-- Neutral seeding only: no forced Saturday/Sunday closure. Exactly mirror
-- each existing restaurant's enabled flags, hours and duration.
UPDATE public.restaurant_hours h
SET weekly_schedule = (
  SELECT jsonb_object_agg(d.day_key,jsonb_build_object(
    'lunch',jsonb_build_object(
      'enabled',h.lunch_enabled,
      'start',to_char(h.lunch_start,'HH24:MI'),
      'end',to_char(h.lunch_end,'HH24:MI')),
    'dinner',jsonb_build_object(
      'enabled',h.dinner_enabled,
      'start',to_char(h.dinner_start,'HH24:MI'),
      'end',to_char(h.dinner_end,'HH24:MI'))
  ))
  FROM (VALUES
    ('monday'),('tuesday'),('wednesday'),('thursday'),
    ('friday'),('saturday'),('sunday')
  ) AS d(day_key)
)
WHERE h.weekly_schedule IS NULL;

DO $rm005_verify$
DECLARE
  invalid_rows int;
BEGIN
  SELECT count(*) INTO invalid_rows FROM public.restaurant_hours h
  WHERE h.weekly_schedule IS NULL
     OR (SELECT count(*) FROM jsonb_object_keys(h.weekly_schedule))<>7
     OR h.weekly_schedule #>> '{saturday,lunch,enabled}'
        IS DISTINCT FROM to_jsonb(h.lunch_enabled)::text
     OR h.weekly_schedule #>> '{sunday,lunch,enabled}'
        IS DISTINCT FROM to_jsonb(h.lunch_enabled)::text;
  IF invalid_rows<>0 THEN
    RAISE EXCEPTION 'RM-005: % weekly schedule rows failed neutral seeding',invalid_rows;
  END IF;
END
$rm005_verify$;

-- Nothing here enables the booking/walk-in weekly guards yet.
COMMIT;
