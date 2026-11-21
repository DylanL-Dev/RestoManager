-- RM-005 DEV ONLY. Tenant-scoped restaurant hours for walk-in installation.
-- Both restaurant types can legitimately have restaurant_hours.id=1 in the shared database.
-- Preserve existing locks, role checks, time windows and existing booking RPCs.
do $rm005$
declare spec record;
  definition text;
  old_clause text:='from public.restaurant_hours where id=1 for share';
  new_clause text:='from public.restaurant_hours where id=1 and restaurant_id=private.staff_restaurant() for share';
begin
 for spec in select p.oid,p.proname
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('install_walkin_group_v3','install_walkin_group_v4')
 loop
  definition:=pg_get_functiondef(spec.oid);
  if length(definition)-length(replace(definition,old_clause,''))<>length(old_clause) then
   raise exception 'Unexpected restaurant hours lookup for %',spec.proname;
  end if;
  execute replace(definition,old_clause,new_clause);
 end loop;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('install_walkin_group_v3','install_walkin_group_v4'))<>2 then
  raise exception 'Expected both walk-in functions';
 end if;
end $rm005$;
