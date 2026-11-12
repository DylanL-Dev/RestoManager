-- RM-005 DEV: PostgreSQL does not expose min(uuid); select one row deterministically.
DO $rm005$
DECLARE ddl text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT ddl FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='create_fusion_chain_v1';
 IF position('SELECT min(t.room_id) INTO v_room' in ddl)=0 THEN
  RAISE EXCEPTION 'Unexpected fusion chain implementation; refusing patch';
 END IF;
 ddl:=replace(ddl,'SELECT min(t.room_id) INTO v_room','SELECT t.room_id INTO v_room');
 ddl:=replace(ddl,'AND t.active AND r.active;','AND t.active AND r.active ORDER BY t.id LIMIT 1;');
 EXECUTE ddl;
END $rm005$;
