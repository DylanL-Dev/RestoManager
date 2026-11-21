-- RM-005 PHASE B full-RPC patch rehearsal: PostgreSQL 17 isolated schema, NO PROD CONNECTION.
DO $assert$
DECLARE
  proc record;
  expected_owner text;
  has_clock_guard boolean;
  n integer := 0;
BEGIN
  IF to_regprocedure('private.restaurant_service_open_at_v1(uuid,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Weekly helper absent after Phase B';
  END IF;
  IF has_function_privilege('authenticated','private.restaurant_service_open_at_v1(uuid,timestamptz)','EXECUTE')
    OR has_function_privilege('anon','private.restaurant_service_open_at_v1(uuid,timestamptz)','EXECUTE')
    OR NOT has_function_privilege('resto_service_writer','private.restaurant_service_open_at_v1(uuid,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'Invalid private helper permissions';
  END IF;
  FOR proc IN
    SELECT nsp.nspname||'.'||p.proname AS fname, p.oid,
     pg_get_userbyid(p.proowner) AS owner,
     p.prosecdef AS definer,
     pg_get_functiondef(p.oid) AS ddl
    FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid=p.pronamespace
    WHERE nsp.nspname||'.'||p.proname IN (
      'private.install_walkin_v3','public.booking_draft_v3',
      'public.install_walkin_group_v3','public.install_walkin_group_v4',
      'public.reception_booking_v3','public.reception_update_reservation_v4')
  LOOP
    n := n + 1;
    expected_owner := CASE WHEN proc.fname='public.install_walkin_group_v4'
      THEN 'postgres' ELSE 'resto_service_writer' END;
    IF proc.owner IS DISTINCT FROM expected_owner OR proc.definer IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Owner/definer changed for %',proc.fname;
    END IF;
    IF position('private.restaurant_service_open_at_v1(' IN proc.ddl)=0 THEN
      RAISE EXCEPTION 'No weekly helper guard in %',proc.fname;
    END IF;
    IF proc.fname='private.install_walkin_v3' AND
       position('restaurant_id=private.staff_restaurant() for share' IN proc.ddl)=0 THEN
      RAISE EXCEPTION 'Tenant scoping missing for private walk-in';
    END IF;
    IF proc.fname LIKE 'public.%'
      AND NOT has_function_privilege('authenticated',proc.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Authenticated RPC privilege lost for %',proc.fname;
    END IF;
    IF proc.fname='private.install_walkin_v3'
       AND has_function_privilege('authenticated',proc.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Private install walkin mistakenly exposed to browser';
    END IF;
  END LOOP;
  IF n<>6 THEN RAISE EXCEPTION 'Expected exactly six patched RPCs, got %',n; END IF;
  IF to_regprocedure('public.reception_update_reservation_with_table_v1(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text)') IS NOT NULL THEN
    RAISE EXCEPTION 'DEV-only reception table mutation RPC was unexpectedly introduced';
  END IF;
END $assert$;

SELECT 'RM-005 Phase B complete PROD-RPC DDL substitution PASS (isolated data-free PG17)' AS test_result;
