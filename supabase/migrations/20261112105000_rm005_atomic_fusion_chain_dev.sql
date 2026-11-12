-- RM-005 DEV ONLY — atomic chain of 2..4 user-confirmed, physically adjoining tables.
-- No change to production. The caller orders the tables by their actual physical adjacency.
CREATE OR REPLACE FUNCTION public.create_fusion_chain_v1(p_tables uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_rid uuid;
 v_room uuid;
 v_n integer;
 v_i integer;
 v_count integer:=0;
 v_left uuid;
 v_right uuid;
BEGIN
 v_rid:=private.lock_restaurant_mutation_v1();
 IF private.current_staff_role() IS DISTINCT FROM 'fb_admin' THEN
  RAISE EXCEPTION 'Action réservée à l’équipe Restaurant.' USING errcode='42501',detail='FORBIDDEN';
 END IF;
 v_n:=coalesce(cardinality(p_tables),0);
 IF v_n NOT BETWEEN 2 AND 4 OR array_position(p_tables,null) IS NOT NULL
 OR (SELECT count(DISTINCT x) FROM unnest(p_tables) AS x)<>v_n THEN
  RAISE EXCEPTION 'Sélectionnez 2 à 4 tables différentes.' USING errcode='22023',detail='INVALID_INPUT';
 END IF;
 SELECT min(t.room_id) INTO v_room
 FROM public.restaurant_tables t
 JOIN public.restaurant_rooms r ON r.id=t.room_id
 WHERE t.id=ANY(p_tables)
 AND t.restaurant_id=v_rid AND r.restaurant_id=v_rid
 AND t.active AND r.active;
 IF v_room IS NULL OR (
  SELECT count(*) FROM public.restaurant_tables t
  JOIN public.restaurant_rooms r ON r.id=t.room_id
  WHERE t.id=ANY(p_tables) AND t.restaurant_id=v_rid AND r.restaurant_id=v_rid
  AND t.active AND r.active AND t.room_id=v_room
 )<>v_n THEN
  RAISE EXCEPTION 'Toutes les tables doivent être actives et dans une même salle.' USING errcode='22023',detail='WRONG_ROOM';
 END IF;
 -- One transaction: no partial chain if one link fails. Physical adjacency is
 -- the staff's explicitly confirmed order, not inferred from table numbers.
 FOR v_i IN 1..v_n-1 LOOP
  v_left:=least(p_tables[v_i],p_tables[v_i+1]);
  v_right:=greatest(p_tables[v_i],p_tables[v_i+1]);
  INSERT INTO public.table_fusion_links(table_a,table_b)
  SELECT v_left,v_right WHERE NOT EXISTS(
    SELECT 1 FROM public.table_fusion_links l WHERE l.table_a=v_left AND l.table_b=v_right
  );
  IF FOUND THEN v_count:=v_count+1; END IF;
 END LOOP;
 RETURN v_count;
END
$function$;
REVOKE ALL ON FUNCTION public.create_fusion_chain_v1(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_fusion_chain_v1(uuid[]) TO authenticated;
