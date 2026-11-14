-- RM-005 Phase C isolated PostgreSQL 17: full PROD-shaped SQL, NO LIVE DATA.
DO $guards$
DECLARE cnt int;
BEGIN
 SELECT count(*) INTO cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname,p.proname) IN (
 ('private','confirm_reservation'),('public','confirm_reservation_v2'),
 ('public','install_walkin_group_v3'),('public','install_walkin_group_v4'))
 AND position('not between 1 and 4' IN pg_get_functiondef(p.oid))>0
 AND position('not between 1 and 3' IN pg_get_functiondef(p.oid))=0;
 IF cnt<>4 THEN RAISE EXCEPTION 'Four-table guards not applied to all four RPCs: %',cnt; END IF;
 IF EXISTS (SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename='table_fusion_links'
   AND policyname='same_restaurant' AND cmd='ALL') THEN
   RAISE EXCEPTION 'Unsafe permissive RLS remained';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
  AND tablename='table_fusion_links' AND policyname='fb manage fusion links'
  AND cmd='ALL' AND qual LIKE '%restaurant_id%') THEN
  RAISE EXCEPTION 'FB admin policy missing tenant control';
 END IF;
 IF to_regprocedure('public.create_fusion_chain_v1(uuid[])') IS NULL
 OR to_regprocedure('private.require_named_exterior_guest()') IS NULL THEN
  RAISE EXCEPTION 'Missing Phase C RPC or trigger';
 END IF;
END $guards$;

-- The authorized restaurant can create four linked tables atomically.
SELECT set_config('app.test_restaurant','10000000-0000-4000-8000-000000000001',false);
SELECT set_config('app.test_role','fb_admin',false);
SET ROLE authenticated;
DO $restaurant$
DECLARE result integer;
BEGIN
 SELECT public.create_fusion_chain_v1(ARRAY[
   '40000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003',
   '40000000-0000-4000-8000-000000000004'
 ]::uuid[]) INTO result;
 IF result<>3 THEN RAISE EXCEPTION 'Four table fusion expected three links, got %',result;END IF;
 SELECT public.create_fusion_chain_v1(ARRAY[
   '40000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003',
   '40000000-0000-4000-8000-000000000004'
 ]::uuid[]) INTO result;
 IF result<>0 THEN RAISE EXCEPTION 'Duplicate fusion must be idempotent, got %',result;END IF;
END $restaurant$;
DO $isolation$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  PERFORM public.create_fusion_chain_v1(ARRAY[
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000005'
  ]::uuid[]);
 EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cross-room fusion was accepted'; END IF;
 rejected:=false;
 BEGIN
  PERFORM public.create_fusion_chain_v1(ARRAY[
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000006'
  ]::uuid[]);
 EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cross-restaurant fusion was accepted'; END IF;
 rejected:=false;
 BEGIN
  PERFORM public.create_fusion_chain_v1(ARRAY[
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000005'
  ]::uuid[]);
 EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Five-table fusion was accepted'; END IF;
END $isolation$;

-- Reception can read only their restaurant but cannot create fusion links.
SELECT set_config('app.test_role','reception',false);
DO $reception$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  PERFORM public.create_fusion_chain_v1(ARRAY[
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002'
  ]::uuid[]);
 EXCEPTION WHEN SQLSTATE '42501' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Reception can call admin fusion RPC'; END IF;
 rejected:=false;
 BEGIN
  INSERT INTO public.table_fusion_links(restaurant_id,table_a,table_b)
  VALUES ('10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003')
  ON CONFLICT DO NOTHING;
 EXCEPTION WHEN SQLSTATE '42501' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Reception can write fusion links directly'; END IF;
END $reception$;
RESET ROLE;

-- Client extérieur without a genuine name is rejected, old hotel client stays optional.
DO $guest$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  INSERT INTO public.reservations(id,guest_name,notes)
   VALUES ('90000000-0000-4000-8000-000000000001','client extérieur','[RESTOMANAGER:EXTERIEUR]');
 EXCEPTION WHEN SQLSTATE '23514' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Unnamed external guest accepted'; END IF;
 INSERT INTO public.reservations(id,guest_name,notes)
  VALUES ('90000000-0000-4000-8000-000000000002','Client Test','[RESTOMANAGER:EXTERIEUR]');
 INSERT INTO public.reservations(id,guest_name,notes)
  VALUES ('90000000-0000-4000-8000-000000000003',null,'[RESTOMANAGER:HOTEL]');
 rejected:=false;
 BEGIN
  UPDATE public.reservations SET guest_name='sans nom'
   WHERE id='90000000-0000-4000-8000-000000000002';
 EXCEPTION WHEN SQLSTATE '23514' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Blank external rename accepted'; END IF;
 IF (SELECT count(*) FROM public.reservations)<>2 THEN
  RAISE EXCEPTION 'Guest-name trigger altered other reservations';
 END IF;
END $guest$;
SELECT 'RM-005 Phase C 4-table fusion, tenant/room/RLS, external name PASS' AS result;
