-- RM-005 synthetic PostgreSQL 17 only. Identical helper to DEV plus strictly scoped writer grant.
CREATE OR REPLACE FUNCTION private.restaurant_service_open_at_v1(p_restaurant uuid, p_starts_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO ''
AS $rm_weekly$
DECLARE
  h public.restaurant_hours;
  local_start timestamp;
  weekday_key text;
  day_plan jsonb;
  period_plan jsonb;
  period_name text;
  local_dow integer;
BEGIN
  IF p_restaurant IS NULL OR p_starts_at IS NULL THEN RETURN false; END IF;
  SELECT * INTO h FROM public.restaurant_hours WHERE restaurant_id=p_restaurant;
  IF NOT FOUND THEN RETURN false; END IF;
  local_start := p_starts_at AT TIME ZONE 'Europe/Paris';
  local_dow := EXTRACT(ISODOW FROM local_start)::integer;
  IF h.weekly_schedule IS NOT NULL THEN
    weekday_key := (ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[local_dow];
    day_plan := h.weekly_schedule -> weekday_key;
    IF day_plan IS NULL OR jsonb_typeof(day_plan)<>'object' THEN RETURN false; END IF;
    FOREACH period_name IN ARRAY ARRAY['lunch','dinner'] LOOP
      period_plan := day_plan -> period_name;
      IF period_plan IS NOT NULL AND coalesce((period_plan->>'enabled')::boolean,false)
         AND local_start::time >= (period_plan->>'start')::time
         AND local_start::time <= (period_plan->>'end')::time THEN RETURN true; END IF;
    END LOOP;
    RETURN false;
  END IF;
  RETURN
    (h.lunch_enabled AND NOT (
       (local_dow=6 AND h.saturday_lunch_closed)
       OR (local_dow=7 AND h.sunday_lunch_closed))
     AND local_start::time BETWEEN h.lunch_start AND h.lunch_end)
    OR (h.dinner_enabled AND local_start::time BETWEEN h.dinner_start AND h.dinner_end);
END
$rm_weekly$;
-- The helper is internal. Public SECURITY DEFINER wrappers retain their existing role checks.
REVOKE ALL ON FUNCTION private.restaurant_service_open_at_v1(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.restaurant_service_open_at_v1(uuid,timestamptz) TO resto_service_writer;
