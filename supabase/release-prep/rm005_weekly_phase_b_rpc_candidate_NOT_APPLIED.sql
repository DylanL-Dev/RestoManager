-- RM-005 PHASE B — WEEKLY-AWARE RPC CANDIDATE (NOT APPROVED, NEVER APPLIED TO PROD).
-- To be rehearsed ONLY after Phase A on an isolated, representative PROD schema.
-- No SQL in this file has been executed on the live service.
-- Baseline function hashes were read from Supabase PROD on 2026-11-14.
-- DO NOT copy DEV functions wholesale: patch only six existing PROD clocks.
-- Do not change role guards, occupancy, concurrency, owner, security-definer
-- attributes, signatures, last-booking rule, duration or business hours.
-- Refuse to run on changed RPC definitions or missing Phase A columns.
BEGIN;
DO $rm005_precondition$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='restaurant_hours'
        AND column_name IN ('weekly_schedule','saturday_lunch_closed','sunday_lunch_closed'))<>3 THEN
    RAISE EXCEPTION 'RM-005 Phase A missing; abort Phase B';
  END IF;
  IF EXISTS (SELECT 1 FROM public.restaurant_hours WHERE weekly_schedule IS NULL) THEN
    RAISE EXCEPTION 'RM-005 schedules incomplete; abort Phase B';
  END IF;
  IF to_regprocedure('private.restaurant_service_open_at_v1(uuid,timestamp with time zone)') IS NOT NULL THEN
    RAISE EXCEPTION 'RM-005 helper already exists; refuse unreviewed replay';
  END IF;
END $rm005_precondition$;

-- Extracted from the RM-005 DEV helper; tested separately on synthetic PG17.
CREATE FUNCTION private.restaurant_service_open_at_v1(p_restaurant uuid, p_starts_at timestamptz)
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

-- DEV-verified grant fixes the dedicated writer role; browser roles remain denied.
-- RM-005: private helper is called from SECURITY DEFINER RPCs owned by resto_service_writer.
-- PostgreSQL requires an explicit function EXECUTE grant for that internal role.
-- Keep the helper inaccessible to ordinary browser roles and keep its schema private.
REVOKE ALL ON FUNCTION private.restaurant_service_open_at_v1(uuid,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.restaurant_service_open_at_v1(uuid,timestamptz)
  TO resto_service_writer;
-- No grants on schema private and no change to public RPC authorization.

-- Owner + SECURITY DEFINER baseline and exact function hashes verified before replacement.

-- private.install_walkin_v3 / PROD pg_get_functiondef MD5 478f71977a87c62e1b6776c769160978
DO $rm005_patch_0$
DECLARE
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_oid:=to_regprocedure($sig0$private.install_walkin_v3(uuid,integer,text,text)$sig0$);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'RM-005: expected function private.install_walkin_v3 missing'; END IF;
  SELECT pg_get_functiondef(v_oid) INTO v_def;
  IF md5(v_def) <> '478f71977a87c62e1b6776c769160978' THEN RAISE EXCEPTION 'RM-005: private.install_walkin_v3 definition drift, abort'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'resto_service_writer'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'RM-005: private.install_walkin_v3 owner/security/privileges drift, abort';
  END IF;
  v_old:=$old_m0_0$if not ((h.lunch_enabled and local_time between h.lunch_start and h.lunch_end)
      or (h.dinner_enabled and local_time between h.dinner_start and h.dinner_end)) then$old_m0_0$;
  v_new:=$new_m0_0$if not private.restaurant_service_open_at_v1(h.restaurant_id,stamp) then$new_m0_0$;
  IF (length(v_def)-length(replace(v_def,v_old,''))) <> length(v_old) THEN
    RAISE EXCEPTION 'RM-005: private.install_walkin_v3 clock/tenant anchor mismatch';
  END IF;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old_m0_1$select * into strict h from public.restaurant_hours where id=1 for share;$old_m0_1$;
  v_new:=$new_m0_1$select * into strict h from public.restaurant_hours where id=1 and restaurant_id=private.staff_restaurant() for share;$new_m0_1$;
  IF (length(v_def)-length(replace(v_def,v_old,''))) <> length(v_old) THEN
    RAISE EXCEPTION 'RM-005: private.install_walkin_v3 clock/tenant anchor mismatch';
  END IF;
  v_def:=replace(v_def,v_old,v_new);
  EXECUTE v_def;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'resto_service_writer'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'RM-005: private.install_walkin_v3 changed owner/security/privileges';
  END IF;
END $rm005_patch_0$;

-- public.booking_draft_v3 / PROD pg_get_functiondef MD5 27fd30e7a1751dcce495b957ba518375
DO $rm005_patch_1$
DECLARE
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_oid:=to_regprocedure($sig1$public.booking_draft_v3(uuid,text,timestamptz,timestamptz,integer,uuid[],text,text,text)$sig1$);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'RM-005: expected function public.booking_draft_v3 missing'; END IF;
  SELECT pg_get_functiondef(v_oid) INTO v_def;
  IF md5(v_def) <> '27fd30e7a1751dcce495b957ba518375' THEN RAISE EXCEPTION 'RM-005: public.booking_draft_v3 definition drift, abort'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'resto_service_writer'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RM-005: public.booking_draft_v3 owner/security/privileges drift, abort';
  END IF;
  v_old:=$old_m1_0$not exists(select 1 from public.restaurant_hours h where h.id=1 and
    ((h.lunch_enabled and (p_start at time zone 'Europe/Paris')::time between h.lunch_start and h.lunch_end)
    or (h.dinner_enabled and (p_start at time zone 'Europe/Paris')::time between h.dinner_start and h.dinner_end)))$old_m1_0$;
  v_new:=$new_m1_0$not private.restaurant_service_open_at_v1(private.staff_restaurant(),p_start)$new_m1_0$;
  IF (length(v_def)-length(replace(v_def,v_old,''))) <> length(v_old) THEN
    RAISE EXCEPTION 'RM-005: public.booking_draft_v3 clock/tenant anchor mismatch';
  END IF;
  v_def:=replace(v_def,v_old,v_new);
  EXECUTE v_def;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'resto_service_writer'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RM-005: public.booking_draft_v3 changed owner/security/privileges';
  END IF;
END $rm005_patch_1$;

-- public.install_walkin_group_v3 / PROD pg_get_functiondef MD5 acee84610fb8420b9dba6f1942a62d44
DO $rm005_patch_2$
DECLARE
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_oid:=to_regprocedure($sig2$public.install_walkin_group_v3(uuid[],integer,text,text)$sig2$);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'RM-005: expected function public.install_walkin_group_v3 missing'; END IF;
  SELECT pg_get_functiondef(v_oid) INTO v_def;
  IF md5(v_def) <> 'acee84610fb8420b9dba6f1942a62d44' THEN RAISE EXCEPTION 'RM-005: public.install_walkin_group_v3 definition drift, abort'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'resto_service_writer'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RM-005: public.install_walkin_group_v3 owner/security/privileges drift, abort';
  END IF;
  v_old:=$old_m2_0$if not ((h.lunch_enabled and local_time between h.lunch_start and h.lunch_end)
      or (h.dinner_enabled and local_time between h.dinner_start and h.dinner_end)) then$old_m2_0$;
  v_new:=$new_m2_0$if not private.restaurant_service_open_at_v1(h.restaurant_id,stamp) then$new_m2_0$;
  IF (length(v_def)-length(replace(v_def,v_old,''))) <> length(v_old) THEN
    RAISE EXCEPTION 'RM-005: public.install_walkin_group_v3 clock/tenant anchor mismatch';
  END IF;
  v_def:=replace(v_def,v_old,v_new);
  EXECUTE v_def;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'resto_service_writer'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RM-005: public.install_walkin_group_v3 changed owner/security/privileges';
  END IF;
END $rm005_patch_2$;

-- public.install_walkin_group_v4 / PROD pg_get_functiondef MD5 ad2462b3184e637fa1ed27ad59a1b6d3
DO $rm005_patch_3$
DECLARE
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_oid:=to_regprocedure($sig3$public.install_walkin_group_v4(uuid[],integer,text,text,boolean)$sig3$);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'RM-005: expected function public.install_walkin_group_v4 missing'; END IF;
  SELECT pg_get_functiondef(v_oid) INTO v_def;
  IF md5(v_def) <> 'ad2462b3184e637fa1ed27ad59a1b6d3' THEN RAISE EXCEPTION 'RM-005: public.install_walkin_group_v4 definition drift, abort'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'postgres'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RM-005: public.install_walkin_group_v4 owner/security/privileges drift, abort';
  END IF;
  v_old:=$old_m3_0$if not ((h.lunch_enabled and local_time between h.lunch_start and h.lunch_end)
      or (h.dinner_enabled and local_time between h.dinner_start and h.dinner_end)) then$old_m3_0$;
  v_new:=$new_m3_0$if not private.restaurant_service_open_at_v1(h.restaurant_id,stamp) then$new_m3_0$;
  IF (length(v_def)-length(replace(v_def,v_old,''))) <> length(v_old) THEN
    RAISE EXCEPTION 'RM-005: public.install_walkin_group_v4 clock/tenant anchor mismatch';
  END IF;
  v_def:=replace(v_def,v_old,v_new);
  EXECUTE v_def;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'postgres'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RM-005: public.install_walkin_group_v4 changed owner/security/privileges';
  END IF;
END $rm005_patch_3$;

-- public.reception_booking_v3 / PROD pg_get_functiondef MD5 2c2a26f4502a64c9e0abff57cb2799ac
DO $rm005_patch_4$
DECLARE
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_oid:=to_regprocedure($sig4$public.reception_booking_v3(uuid,text,text,integer,timestamptz,timestamptz,text)$sig4$);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'RM-005: expected function public.reception_booking_v3 missing'; END IF;
  SELECT pg_get_functiondef(v_oid) INTO v_def;
  IF md5(v_def) <> '2c2a26f4502a64c9e0abff57cb2799ac' THEN RAISE EXCEPTION 'RM-005: public.reception_booking_v3 definition drift, abort'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'resto_service_writer'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RM-005: public.reception_booking_v3 owner/security/privileges drift, abort';
  END IF;
  v_old:=$old_m4_0$not exists(
    select 1 from public.restaurant_hours h where h.id=1 and
     ((h.lunch_enabled and (p_start at time zone 'Europe/Paris')::time between h.lunch_start and h.lunch_end)
     or (h.dinner_enabled and (p_start at time zone 'Europe/Paris')::time between h.dinner_start and h.dinner_end))
   )$old_m4_0$;
  v_new:=$new_m4_0$not private.restaurant_service_open_at_v1(private.staff_restaurant(),p_start)$new_m4_0$;
  IF (length(v_def)-length(replace(v_def,v_old,''))) <> length(v_old) THEN
    RAISE EXCEPTION 'RM-005: public.reception_booking_v3 clock/tenant anchor mismatch';
  END IF;
  v_def:=replace(v_def,v_old,v_new);
  EXECUTE v_def;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'resto_service_writer'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RM-005: public.reception_booking_v3 changed owner/security/privileges';
  END IF;
END $rm005_patch_4$;

-- public.reception_update_reservation_v4 / PROD pg_get_functiondef MD5 6bf11a586b46b4eb68c9a656eefda59a
DO $rm005_patch_5$
DECLARE
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_oid:=to_regprocedure($sig5$public.reception_update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,text)$sig5$);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'RM-005: expected function public.reception_update_reservation_v4 missing'; END IF;
  SELECT pg_get_functiondef(v_oid) INTO v_def;
  IF md5(v_def) <> '6bf11a586b46b4eb68c9a656eefda59a' THEN RAISE EXCEPTION 'RM-005: public.reception_update_reservation_v4 definition drift, abort'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'resto_service_writer'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RM-005: public.reception_update_reservation_v4 owner/security/privileges drift, abort';
  END IF;
  v_old:=$old_m5_0$not exists(
  select 1 from public.restaurant_hours h where h.id=1 and
  ((h.lunch_enabled and (p_starts_at at time zone 'Europe/Paris')::time between h.lunch_start and h.lunch_end)
   or (h.dinner_enabled and (p_starts_at at time zone 'Europe/Paris')::time between h.dinner_start and h.dinner_end))
 )$old_m5_0$;
  v_new:=$new_m5_0$not private.restaurant_service_open_at_v1(private.staff_restaurant(),p_starts_at)$new_m5_0$;
  IF (length(v_def)-length(replace(v_def,v_old,''))) <> length(v_old) THEN
    RAISE EXCEPTION 'RM-005: public.reception_update_reservation_v4 clock/tenant anchor mismatch';
  END IF;
  v_def:=replace(v_def,v_old,v_new);
  EXECUTE v_def;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'resto_service_writer'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM true
     OR has_function_privilege('authenticated',v_oid,'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RM-005: public.reception_update_reservation_v4 changed owner/security/privileges';
  END IF;
END $rm005_patch_5$;

-- No table rows are intentionally changed by Phase B. Transaction is atomic.
COMMIT;
