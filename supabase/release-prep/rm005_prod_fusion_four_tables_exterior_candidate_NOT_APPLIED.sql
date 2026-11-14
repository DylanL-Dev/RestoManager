-- RM-005 PHASE C — FUSION 4 TABLES, EXTERIOR NAME, RLS (NON EXECUTÉ).
-- SYNTHETIC TEST ONLY, REQUIRES APPROVED BACKUP/ROLLBACK AND EXPLICIT GO FOR PROD.
-- Depends on Phase A and B for complete RM-005 feature activation.
-- Four table logic is additive: no existing reservation or table row is changed.
BEGIN;
DO $baseline$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.table_fusion_links'::regclass) THEN
    RAISE EXCEPTION 'RM-005: fusion RLS not enabled';
  END IF;
  IF to_regprocedure('public.create_fusion_chain_v1(uuid[])') IS NOT NULL
    OR to_regprocedure('private.require_named_exterior_guest()') IS NOT NULL THEN
    RAISE EXCEPTION 'RM-005: fusion or guest trigger already deployed; abort repeat';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='table_fusion_links')<>4 THEN
    RAISE EXCEPTION 'RM-005: unexpected fusion policy count';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='table_fusion_links'
       AND policyname='same_restaurant' AND cmd='ALL') THEN
    RAISE EXCEPTION 'RM-005: expected old fusion RLS missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='table_fusion_links'
       AND policyname='writer_access' AND cmd='ALL' AND roles @> ARRAY['resto_service_writer']::name[]) THEN
    RAISE EXCEPTION 'RM-005: dedicated writer policy missing';
  END IF;
END $baseline$;

-- Avoid permissive policy OR letting Reception edit another role's fusion links.
DROP POLICY same_restaurant ON public.table_fusion_links;
CREATE POLICY same_restaurant ON public.table_fusion_links
 FOR SELECT TO authenticated, resto_service_writer
 USING (restaurant_id = (SELECT private.staff_restaurant()));
DROP POLICY "fb manage fusion links" ON public.table_fusion_links;
CREATE POLICY "fb manage fusion links" ON public.table_fusion_links
 FOR ALL TO authenticated
 USING (private.current_staff_role()='fb_admin'
        AND restaurant_id=(SELECT private.staff_restaurant()))
 WITH CHECK (private.current_staff_role()='fb_admin'
             AND restaurant_id=(SELECT private.staff_restaurant()));
DROP POLICY "staff read fusion links" ON public.table_fusion_links;
CREATE POLICY "staff read fusion links" ON public.table_fusion_links
 FOR SELECT TO authenticated
 USING (private.current_staff_role() IN ('reception','fb_admin')
        AND restaurant_id=(SELECT private.staff_restaurant()));
-- No change to technical writer_access.

-- Four tables maximum, preserving body of existing PROD RPC exactly.

DO $rm005_c_0$
DECLARE o oid; source text; guard text:='not between 1 and 3';
BEGIN
 o:=to_regprocedure('private.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text)');
 IF o IS NULL THEN RAISE EXCEPTION 'Missing PROD RPC private.confirm_reservation'; END IF;
 source:=pg_get_functiondef(o);
 IF md5(source) <> '850b37f44bef5ac258651b196e0953ef' THEN
   RAISE EXCEPTION 'PROD RPC baseline drift for private.confirm_reservation';
 END IF;
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=o)<>'resto_service_writer'
 OR (SELECT prosecdef FROM pg_proc WHERE oid=o) IS DISTINCT FROM true
 OR has_function_privilege('authenticated',o,'EXECUTE') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'PROD RPC owner/definer/permissions drift private.confirm_reservation'; END IF;
 IF (length(source)-length(replace(source,guard,'')))<>length(guard)
 THEN RAISE EXCEPTION 'Four-table cardinality guard not found exactly once in private.confirm_reservation'; END IF;
 EXECUTE replace(source,guard,'not between 1 and 4');
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=o)<>'resto_service_writer'
 OR (SELECT prosecdef FROM pg_proc WHERE oid=o) IS DISTINCT FROM true
 OR has_function_privilege('authenticated',o,'EXECUTE') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'PROD RPC rights changed unexpectedly private.confirm_reservation'; END IF;
END $rm005_c_0$;

DO $rm005_c_1$
DECLARE o oid; source text; guard text:='not between 1 and 3';
BEGIN
 o:=to_regprocedure('public.confirm_reservation_v2(text,text,integer,timestamptz,timestamptz,uuid[],uuid,text)');
 IF o IS NULL THEN RAISE EXCEPTION 'Missing PROD RPC public.confirm_reservation_v2'; END IF;
 source:=pg_get_functiondef(o);
 IF md5(source) <> '881914972ad2ed1ceb942e8d01a57804' THEN
   RAISE EXCEPTION 'PROD RPC baseline drift for public.confirm_reservation_v2';
 END IF;
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=o)<>'resto_service_writer'
 OR (SELECT prosecdef FROM pg_proc WHERE oid=o) IS DISTINCT FROM true
 OR has_function_privilege('authenticated',o,'EXECUTE') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'PROD RPC owner/definer/permissions drift public.confirm_reservation_v2'; END IF;
 IF (length(source)-length(replace(source,guard,'')))<>length(guard)
 THEN RAISE EXCEPTION 'Four-table cardinality guard not found exactly once in public.confirm_reservation_v2'; END IF;
 EXECUTE replace(source,guard,'not between 1 and 4');
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=o)<>'resto_service_writer'
 OR (SELECT prosecdef FROM pg_proc WHERE oid=o) IS DISTINCT FROM true
 OR has_function_privilege('authenticated',o,'EXECUTE') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'PROD RPC rights changed unexpectedly public.confirm_reservation_v2'; END IF;
END $rm005_c_1$;

DO $rm005_c_2$
DECLARE o oid; source text; guard text:='not between 1 and 3';
BEGIN
 o:=to_regprocedure('public.install_walkin_group_v3(uuid[],integer,text,text)');
 IF o IS NULL THEN RAISE EXCEPTION 'Missing PROD RPC public.install_walkin_group_v3'; END IF;
 source:=pg_get_functiondef(o);
 
 IF md5(source) <> 'acee84610fb8420b9dba6f1942a62d44'
   AND (position('private.restaurant_service_open_at_v1(' IN source)=0
       OR position('restaurant_id=private.staff_restaurant() for share' IN source)=0)
 THEN
   RAISE EXCEPTION 'Drift or RM-005 Phase B missing for public.install_walkin_group_v3';
 END IF;
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=o)<>'resto_service_writer'
 OR (SELECT prosecdef FROM pg_proc WHERE oid=o) IS DISTINCT FROM true
 OR has_function_privilege('authenticated',o,'EXECUTE') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'PROD RPC owner/definer/permissions drift public.install_walkin_group_v3'; END IF;
 IF (length(source)-length(replace(source,guard,'')))<>length(guard)
 THEN RAISE EXCEPTION 'Four-table cardinality guard not found exactly once in public.install_walkin_group_v3'; END IF;
 EXECUTE replace(source,guard,'not between 1 and 4');
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=o)<>'resto_service_writer'
 OR (SELECT prosecdef FROM pg_proc WHERE oid=o) IS DISTINCT FROM true
 OR has_function_privilege('authenticated',o,'EXECUTE') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'PROD RPC rights changed unexpectedly public.install_walkin_group_v3'; END IF;
END $rm005_c_2$;

DO $rm005_c_3$
DECLARE o oid; source text; guard text:='not between 1 and 3';
BEGIN
 o:=to_regprocedure('public.install_walkin_group_v4(uuid[],integer,text,text,boolean)');
 IF o IS NULL THEN RAISE EXCEPTION 'Missing PROD RPC public.install_walkin_group_v4'; END IF;
 source:=pg_get_functiondef(o);
 IF md5(source) <> 'ad2462b3184e637fa1ed27ad59a1b6d3' THEN
   RAISE EXCEPTION 'PROD RPC baseline drift for public.install_walkin_group_v4';
 END IF;
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=o)<>'postgres'
 OR (SELECT prosecdef FROM pg_proc WHERE oid=o) IS DISTINCT FROM true
 OR has_function_privilege('authenticated',o,'EXECUTE') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'PROD RPC owner/definer/permissions drift public.install_walkin_group_v4'; END IF;
 IF (length(source)-length(replace(source,guard,'')))<>length(guard)
 THEN RAISE EXCEPTION 'Four-table cardinality guard not found exactly once in public.install_walkin_group_v4'; END IF;
 EXECUTE replace(source,guard,'not between 1 and 4');
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=o)<>'postgres'
 OR (SELECT prosecdef FROM pg_proc WHERE oid=o) IS DISTINCT FROM true
 OR has_function_privilege('authenticated',o,'EXECUTE') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'PROD RPC rights changed unexpectedly public.install_walkin_group_v4'; END IF;
END $rm005_c_3$;

-- Create explicit 2..4 chain; PROD requires restaurant_id column on fusion links.
-- This is missing from the DEV-only draft and is mandatory for live schema.
CREATE FUNCTION public.create_fusion_chain_v1(p_tables uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $rm005_fusion$
DECLARE
 v_rid uuid; v_room uuid; v_n integer; v_i integer; v_count integer:=0;
 v_left uuid; v_right uuid;
BEGIN
 v_rid:=private.lock_restaurant_mutation_v1();
 IF private.current_staff_role() IS DISTINCT FROM 'fb_admin' THEN
   RAISE EXCEPTION 'Action réservée au Restaurant.' USING errcode='42501',detail='FORBIDDEN';
 END IF;
 v_n:=coalesce(cardinality(p_tables),0);
 IF v_n NOT BETWEEN 2 AND 4
    OR array_position(p_tables,null) IS NOT NULL
    OR (SELECT count(DISTINCT x) FROM unnest(p_tables) AS x)<>v_n THEN
   RAISE EXCEPTION 'Sélectionnez 2 à 4 tables différentes.'
     USING errcode='22023',detail='INVALID_INPUT';
 END IF;
 SELECT t.room_id INTO v_room
 FROM public.restaurant_tables t JOIN public.restaurant_rooms r ON r.id=t.room_id
 WHERE t.id=ANY(p_tables) AND t.restaurant_id=v_rid
   AND r.restaurant_id=v_rid AND t.active AND r.active
 ORDER BY t.id LIMIT 1;
 IF v_room IS NULL OR (
   SELECT count(*) FROM public.restaurant_tables t
     JOIN public.restaurant_rooms r ON r.id=t.room_id
   WHERE t.id=ANY(p_tables) AND t.restaurant_id=v_rid
     AND r.restaurant_id=v_rid AND t.room_id=v_room AND t.active AND r.active
 )<>v_n THEN
   RAISE EXCEPTION 'Toutes les tables doivent être actives dans une même salle.'
     USING errcode='22023',detail='WRONG_ROOM';
 END IF;
 FOR v_i IN 1..v_n-1 LOOP
   v_left:=least(p_tables[v_i],p_tables[v_i+1]);
   v_right:=greatest(p_tables[v_i],p_tables[v_i+1]);
   INSERT INTO public.table_fusion_links(restaurant_id,table_a,table_b)
     VALUES (v_rid,v_left,v_right)
     ON CONFLICT (table_a,table_b) DO NOTHING;
   IF FOUND THEN v_count:=v_count+1; END IF;
 END LOOP;
 RETURN v_count;
END $rm005_fusion$;
ALTER FUNCTION public.create_fusion_chain_v1(uuid[]) OWNER TO resto_service_writer;
REVOKE ALL ON FUNCTION public.create_fusion_chain_v1(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_fusion_chain_v1(uuid[]) TO authenticated;

-- Exterior guests need a genuine name on new/edited reservations; no data rewrite.
CREATE FUNCTION private.require_named_exterior_guest()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,private
AS $rm005_exterior$
DECLARE v_ext boolean;
BEGIN
 v_ext:=position('[RESTOMANAGER:EXTERIEUR]' in coalesce(NEW.notes,''))>0;
 IF v_ext AND (
    TG_OP='INSERT'
    OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
    OR NEW.notes IS DISTINCT FROM OLD.notes
 ) THEN
   IF btrim(coalesce(NEW.guest_name,''))=''
      OR lower(btrim(NEW.guest_name)) IN (
         'client extérieur','client exterieur','sans nom','anonyme') THEN
      RAISE EXCEPTION 'Le nom du client extérieur est obligatoire.'
        USING errcode='23514';
   END IF;
 END IF;
 RETURN NEW;
END $rm005_exterior$;
REVOKE ALL ON FUNCTION private.require_named_exterior_guest() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER require_named_exterior_guest
 BEFORE INSERT OR UPDATE OF guest_name,notes ON public.reservations
 FOR EACH ROW EXECUTE FUNCTION private.require_named_exterior_guest();

DO $verify$
BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
 AND tablename='table_fusion_links' AND cmd='ALL'
 AND roles @> ARRAY['authenticated']::name[])<>1 THEN
    RAISE EXCEPTION 'RM-005 expected exactly one authenticated ALL fusion policy for FB admin';
 END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
 AND tablename='table_fusion_links' AND policyname='same_restaurant' AND cmd='ALL')<>0 THEN
    RAISE EXCEPTION 'RM-005 old permissive fusion policy remains';
 END IF;
END $verify$;
COMMIT;
