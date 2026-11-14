-- RM-005 ISOLATED POSTGRES SQL assertions. Runs on synthetic data only.
DO $assert$
DECLARE
  p record;
  weekday text;
BEGIN
  IF (SELECT count(*) FROM public.restaurant_hours) <> 2 THEN
    RAISE EXCEPTION 'The candidate changed the number of existing restaurants';
  END IF;

  FOR p IN SELECT * FROM public.restaurant_hours LOOP
    IF p.weekly_schedule IS NULL OR
       (SELECT count(*) FROM jsonb_object_keys(p.weekly_schedule))<>7 THEN
      RAISE EXCEPTION 'Expected a complete seven-day calendar';
    END IF;
    FOREACH weekday IN ARRAY ARRAY[
      'monday','tuesday','wednesday','thursday','friday','saturday','sunday'
    ] LOOP
      IF (p.weekly_schedule -> weekday -> 'lunch' ->> 'enabled')::boolean
             IS DISTINCT FROM p.lunch_enabled OR
         (p.weekly_schedule -> weekday -> 'dinner' ->> 'enabled')::boolean
             IS DISTINCT FROM p.dinner_enabled OR
         (p.weekly_schedule -> weekday -> 'lunch' ->> 'start')
             IS DISTINCT FROM to_char(p.lunch_start,'HH24:MI') OR
         (p.weekly_schedule -> weekday -> 'lunch' ->> 'end')
             IS DISTINCT FROM to_char(p.lunch_end,'HH24:MI') OR
         (p.weekly_schedule -> weekday -> 'dinner' ->> 'start')
             IS DISTINCT FROM to_char(p.dinner_start,'HH24:MI') OR
         (p.weekly_schedule -> weekday -> 'dinner' ->> 'end')
             IS DISTINCT FROM to_char(p.dinner_end,'HH24:MI') THEN
        RAISE EXCEPTION 'Schedule changed existing business hours for day %',weekday;
      END IF;
    END LOOP;
  END LOOP;

  IF (SELECT duration FROM public.restaurant_hours
      WHERE restaurant_id='10000000-0000-4000-8000-000000000001')<>60 OR
     (SELECT duration FROM public.restaurant_hours
      WHERE restaurant_id='10000000-0000-4000-8000-000000000002')<>90 THEN
    RAISE EXCEPTION 'Duration changed unexpectedly';
  END IF;
END
$assert$;

-- A brand-new restaurant hours row must receive a valid seven-day calendar.
INSERT INTO public.restaurant_hours
  (id,lunch_enabled,lunch_start,lunch_end,dinner_enabled,dinner_start,dinner_end,duration,restaurant_id)
VALUES
  (1,false,'12:00','14:30',false,'19:00','21:30',90,
   '10000000-0000-4000-8000-000000000003');

DO $new_restaurant$
BEGIN
  IF (SELECT count(*) FROM public.restaurant_hours h
      CROSS JOIN LATERAL jsonb_object_keys(h.weekly_schedule) AS d(day_key)
      WHERE h.restaurant_id='10000000-0000-4000-8000-000000000003') <> 7 THEN
    RAISE EXCEPTION 'A new restaurant has a missing or incomplete calendar';
  END IF;
  IF (SELECT weekly_schedule #>> '{sunday,lunch,enabled}'
      FROM public.restaurant_hours
      WHERE restaurant_id='10000000-0000-4000-8000-000000000003') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'A new closed restaurant was opened on Sunday';
  END IF;
END
$new_restaurant$;

-- The new validator must reject incomplete schedule JSON at the SQL level.
DO $invalid$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    UPDATE public.restaurant_hours
    SET weekly_schedule = '{"monday":{"lunch":{"enabled":true,"start":"12:00","end":"14:30"}}}'::jsonb
    WHERE restaurant_id='10000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'An invalid schedule was incorrectly accepted';
  END IF;
END
$invalid$;

-- Success marker, no production secrets or real reservation data used.
SELECT 'RM-005 weekly phase A isolated PostgreSQL test PASS' AS test_result;
