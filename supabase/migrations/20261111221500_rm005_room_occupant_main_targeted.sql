-- Targeted RM-005 HOTFIX — production deployment only after audited GitHub release checks.
-- The existing V3 role, table holds, time checks and 3-table limit remain unchanged.
-- Backup GitHub branch: backup/main-before-room-occupants-20261111
DO $rm005$
DECLARE
  original_v3 text;
  next_v3 text;
  next_v4 text;
  original_private text;
  old_hours text := 'from public.restaurant_hours where id=1 for share';
  new_hours text := 'from public.restaurant_hours where id=1 and restaurant_id=private.staff_restaurant() for share';
  header_v3 text := 'public.install_walkin_group_v3(p_tables uuid[], p_guests integer, p_name text, p_type text)';
  header_v4 text := 'public.install_walkin_group_v4(p_tables uuid[], p_guests integer, p_name text, p_type text, p_allow_second_occupant boolean DEFAULT false)';
  room_guard text := 'if v_room is not null and exists (';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO STRICT original_v3
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
   WHERE n.nspname='public' AND p.proname='install_walkin_group_v3';
  SELECT pg_get_functiondef(p.oid) INTO STRICT original_private
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
   WHERE n.nspname='private' AND p.proname='confirm_reservation';

  IF length(original_v3)-length(replace(original_v3,old_hours,''))<>length(old_hours)
     OR position(header_v3 in original_v3)=0
     OR position('token,null);' in original_v3)=0
     OR position('room:=btrim(p_name); end if;' in original_v3)=0
     OR position('cardinality(p_tables) not between 1 and 3' in original_v3)=0 THEN
    RAISE EXCEPTION 'RM-005: unexpected production walk-in V3 definition';
  END IF;
  IF length(original_private)-length(replace(original_private,room_guard,''))<>length(room_guard)
     OR position('cardinality(p_table_ids) not between 1 and 3' in original_private)=0 THEN
    RAISE EXCEPTION 'RM-005: unexpected production private reservation guard';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
            WHERE n.nspname='public' AND p.proname='install_walkin_group_v4') THEN
    RAISE EXCEPTION 'RM-005: V4 already exists, refusing overwrite';
  END IF;

  -- Keep the normal V3 operation but scope hours by the active establishment.
  next_v3:=replace(original_v3,old_hours,new_hours);
  EXECUTE next_v3;

  -- Create a *separate* operation for a second occupant of an already booked room.
  next_v4:=replace(next_v3,header_v3,header_v4);
  next_v4:=replace(next_v4,'token,null);',
    'token,case when p_allow_second_occupant is true then ''[RM:WALKIN_SEPARATE_OCCUPANT_V1]'' else null end);');
  next_v4:=replace(next_v4,'room:=btrim(p_name); end if;',
    'room:=btrim(p_name); end if;
     if p_allow_second_occupant is true and (p_type<>''hotel'' or room is null) then
       raise exception ''Confirmation du deuxième occupant réservée à une chambre d’hôtel identifiée.''
         using errcode=''22023'',detail=''ROOM_REQUIRED'';
     end if;');
  next_v4:=replace(next_v4,'booking:=public.confirm_reservation_v3(',
    'if p_allow_second_occupant is true then
       perform set_config(''restomanager.second_occupant_confirmed'',''yes'',true);
     end if;
     booking:=public.confirm_reservation_v3(');
  IF next_v4=next_v3 OR position('restomanager.second_occupant_confirmed' in next_v4)=0 THEN
    RAISE EXCEPTION 'RM-005: failed to build V4';
  END IF;
  EXECUTE next_v4;

  -- Only the dedicated V4 RPC can enable the duplicate-room exception.
  -- The normal reservation flow, Reception role, table conflicts and holds remain enforced.
  EXECUTE replace(original_private,room_guard,
    'if v_room is not null and not (
      v_role=''fb_admin''
      and p_notes=''[RM:WALKIN_SEPARATE_OCCUPANT_V1]''
      and current_setting(''restomanager.second_occupant_confirmed'',true)=''yes''
    ) and exists (');
END $rm005$;

REVOKE ALL ON FUNCTION public.install_walkin_group_v4(uuid[],integer,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.install_walkin_group_v4(uuid[],integer,text,text,boolean) TO authenticated;
