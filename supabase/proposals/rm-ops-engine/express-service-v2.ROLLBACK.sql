-- DEV only, after B3. Restore B2 capabilities and disable both v2 entry points.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
revoke all on function public.express_seat_v2(text,uuid,text,uuid,uuid[],jsonb),
 public.express_walkin_v2(text,uuid[],integer,text,text,uuid),
 private.express_seat_v2(text,uuid,text,uuid,uuid[],jsonb),
 private.express_walkin_v2(text,uuid[],integer,text,text,uuid)
 from public,anon,authenticated,service_role;
create or replace function public.service_sync_state_v1()
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_set(jsonb_set(state,'{capabilities,quick_release}','1'::jsonb),
  '{capabilities,express_service}','1'::jsonb)
 from (select private.rm012_sync_api() as state) snapshot;
$$;
delete from private.express_occupant_confirmation;
notify pgrst,'reload schema';
commit;
