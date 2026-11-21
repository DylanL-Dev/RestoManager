-- RM-005 Phase B WEEKLY HELPER, synthetic isolated PG17 only.
DO $rm005_helper_check$
DECLARE
  main uuid := '10000000-0000-4000-8000-000000000001';
  demo uuid := '10000000-0000-4000-8000-000000000002';
BEGIN
  IF NOT private.restaurant_service_open_at_v1(main,'2026-11-14T12:00:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Saturday lunch start should be open per baseline';
  END IF;
  IF NOT private.restaurant_service_open_at_v1(main,'2026-11-14T14:30:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Saturday lunch end must retain DEV inclusive semantics';
  END IF;
  IF private.restaurant_service_open_at_v1(main,'2026-11-14T14:31:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Lunch + 1 minute must be closed';
  END IF;
  IF private.restaurant_service_open_at_v1(main,'2026-11-14T18:59:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Before dinner should be closed';
  END IF;
  IF NOT private.restaurant_service_open_at_v1(main,'2026-11-14T19:00:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Dinner start must be open';
  END IF;
  IF private.restaurant_service_open_at_v1(main,'2026-11-14T21:31:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'After last time to book must be closed';
  END IF;
  IF private.restaurant_service_open_at_v1(demo,'2026-11-14T12:00:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Inactive demo must remain closed';
  END IF;
  IF private.restaurant_service_open_at_v1(null,'2026-11-14T12:00:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Null restaurant must remain closed';
  END IF;
  IF private.restaurant_service_open_at_v1(main,null) THEN
    RAISE EXCEPTION 'Null time must remain closed';
  END IF;
  IF NOT private.restaurant_service_open_at_v1(main,'2026-03-29T12:00:00+02'::timestamptz) THEN
    RAISE EXCEPTION 'DST forward weekend Paris lunch should be open';
  END IF;
  IF NOT private.restaurant_service_open_at_v1(main,'2026-10-25T12:00:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'DST fall back weekend Paris lunch should be open';
  END IF;
END $rm005_helper_check$;

-- Simulate a decision to close only Saturday lunch in an isolated schedule.
UPDATE public.restaurant_hours
SET weekly_schedule=jsonb_set(weekly_schedule,'{saturday,lunch,enabled}','false'::jsonb)
WHERE restaurant_id='10000000-0000-4000-8000-000000000001';

DO $rm005_weekend_check$
DECLARE
  rid uuid := '10000000-0000-4000-8000-000000000001';
BEGIN
  IF private.restaurant_service_open_at_v1(rid,'2026-11-14T12:00:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Configured Saturday lunch must now be closed';
  END IF;
  IF NOT private.restaurant_service_open_at_v1(rid,'2026-11-14T19:00:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Saturday dinner must stay open';
  END IF;
  IF NOT private.restaurant_service_open_at_v1(rid,'2026-11-15T12:00:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Sunday lunch must remain open';
  END IF;
  IF NOT private.restaurant_service_open_at_v1(rid,'2026-11-13T12:00:00+01'::timestamptz) THEN
    RAISE EXCEPTION 'Friday lunch must remain open';
  END IF;
  IF has_function_privilege('authenticated','private.restaurant_service_open_at_v1(uuid,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser role must not call internal helper';
  END IF;
  IF has_function_privilege('anon','private.restaurant_service_open_at_v1(uuid,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'Anon must not call internal helper';
  END IF;
  IF NOT has_function_privilege('resto_service_writer','private.restaurant_service_open_at_v1(uuid,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'Internal writer must call weekly helper';
  END IF;
END $rm005_weekend_check$;

SELECT 'RM-005 weekly helper clock, DST, closures and grants PASS' AS test_result;
