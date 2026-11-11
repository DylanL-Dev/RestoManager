-- RM-005 DEV only: separate hotel occupants may share a room number when staff explicitly confirms.
-- Do not deploy to production until manual field validation and independent review.
do $rm005$
declare
  previous_ddl text;
  new_ddl text;
  check_count int;
begin
  select pg_get_functiondef(p.oid) into strict previous_ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='confirm_reservation';
  check_count:=(length(previous_ddl)-length(replace(previous_ddl,
    'if v_room is not null and exists (','')))/
    length('if v_room is not null and exists (');
  if check_count<>1 then raise exception 'Unexpected DEV private.confirm_reservation guard';end if;
  new_ddl:=replace(previous_ddl,
    'if v_room is not null and exists (',
    'if v_room is not null and not (v_role=''fb_admin'' and p_notes=''[RM:WALKIN_SEPARATE_OCCUPANT_V1]'') and exists (');
  execute new_ddl;

  select pg_get_functiondef(p.oid) into strict previous_ddl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='install_walkin_group_v3';
  if position('p_tables uuid[], p_guests integer, p_name text, p_type text' in previous_ddl)=0
  or position('token,null' in previous_ddl)=0
  or position('room:=btrim(p_name); end if;' in previous_ddl)=0
  then raise exception 'Unexpected DEV walk-in RPC definition'; end if;

  new_ddl:=replace(previous_ddl,
    'public.install_walkin_group_v3(p_tables uuid[], p_guests integer, p_name text, p_type text)',
    'public.install_walkin_group_v4(p_tables uuid[], p_guests integer, p_name text, p_type text, p_allow_second_occupant boolean DEFAULT false)');
  if new_ddl=previous_ddl then raise exception 'Cannot rename DEV walk-in RPC';end if;
  new_ddl:=replace(new_ddl,
    'token,null);',
    'token,case when p_allow_second_occupant is true then ''[RM:WALKIN_SEPARATE_OCCUPANT_V1]'' else null end);');
  new_ddl:=replace(new_ddl,
    'room:=btrim(p_name); end if;',
    'room:=btrim(p_name); end if;
     if p_allow_second_occupant is true and (p_type<>''hotel'' or room is null) then
       raise exception ''Confirmation du deuxième occupant réservée à une chambre d’hôtel identifiée.''
         using errcode=''22023'',detail=''ROOM_REQUIRED'';
     end if;');
  execute new_ddl;
end $rm005$;
revoke all on function public.install_walkin_group_v4(uuid[],integer,text,text,boolean) from public, anon;
grant execute on function public.install_walkin_group_v4(uuid[],integer,text,text,boolean) to authenticated;
