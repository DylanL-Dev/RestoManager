-- RM-005 / DEV ONLY
-- The hotel-room override is valid only inside the dedicated, F&B-guarded
-- installation RPC, not when an arbitrary caller forwards an audit note.
do $rm005$
declare
 ddl text;
 patched text;
 previous text;
begin
 select pg_get_functiondef(p.oid) into strict ddl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname='confirm_reservation';
 previous := 'v_role=''fb_admin'' and p_notes=''[RM:WALKIN_SEPARATE_OCCUPANT_V1]''';
 if (length(ddl)-length(replace(ddl,previous,'')))<>length(previous) then
   raise exception 'Unexpected second-occupant guard in private.confirm_reservation';
 end if;
 patched:=replace(ddl,previous,previous||
   ' and current_setting(''restomanager.second_occupant_confirmed'',true)=''yes''');
 execute patched;

 select pg_get_functiondef(p.oid) into strict ddl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='install_walkin_group_v4';
 previous:='booking:=public.confirm_reservation_v3(';
 if (length(ddl)-length(replace(ddl,previous,'')))<>length(previous) then
   raise exception 'Unexpected confirmation call in public.install_walkin_group_v4';
 end if;
 patched:=replace(ddl,previous,
   'if p_allow_second_occupant is true then
      perform set_config(''restomanager.second_occupant_confirmed'',''yes'',true);
    end if;
    '||previous);
 execute patched;
end $rm005$;
