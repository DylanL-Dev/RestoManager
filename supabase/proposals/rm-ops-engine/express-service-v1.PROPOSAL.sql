-- Candidate DEV. Requires the placement v4 and hardened quick release proposals.
-- Apply only to a disposable test database until separate approval.
begin;

do $prerequisites$
begin
 if to_regprocedure('public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean)') is null
 or to_regprocedure('public.seat_reservation_v1(uuid,text,uuid)') is null
 or to_regprocedure('public.quick_release_v1(uuid,uuid,uuid[],boolean)') is null then
  raise exception 'Les propositions placement v4 et libération v1 sont requises.';
 end if;
 if to_regprocedure('private.restaurant_service_open_at_v1(uuid,timestamptz)') is null
 or not coalesce(has_function_privilege('resto_service_writer',
  to_regprocedure('private.restaurant_service_open_at_v1(uuid,timestamptz)'), 'EXECUTE'),false) then
  raise exception 'Le passage doit disposer du calendrier hebdomadaire et de ses droits.';
 end if;
end
$prerequisites$;

create or replace function private.lock_express_service_v1(p_revision text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare venue uuid;
begin
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then
  raise exception 'Action réservée à l’équipe du restaurant.' using errcode='42501',detail='FORBIDDEN';
 end if;
 venue:=private.lock_restaurant_mutation_v1();
 if p_revision is null or p_revision is distinct from (private.rm012_sync_api()->>'revision') then
  raise exception 'Le service a changé. Vérifiez la nouvelle proposition.' using errcode='40001',detail='STALE_VERSION';
 end if;
 return venue;
end $$;

create or replace function private.express_seat_v1(p_revision text,p_reservation_id uuid,p_expected_status text,p_table uuid,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 venue uuid:=private.lock_express_service_v1(p_revision);
 target public.reservations%rowtype;
 moves integer;
 first_move jsonb;
 other_move jsonb;
begin
 select * into target from public.reservations where restaurant_id=venue and id=p_reservation_id for update;
 if not found then
  raise exception 'Réservation indisponible.' using errcode='42501',detail='FORBIDDEN';
 end if;
 if target.status is distinct from p_expected_status or target.walkin_type is not null then
  raise exception 'La réservation a changé.' using errcode='40001',detail='STALE_VERSION';
 end if;
 if (target.starts_at at time zone 'Europe/Paris')::date<>(clock_timestamp() at time zone 'Europe/Paris')::date then
  raise exception 'La réservation doit appartenir au service du jour.' using errcode='22023',detail='OUTSIDE_SERVICE';
 end if;
 if p_table is null or jsonb_typeof(p_changes) is distinct from 'array' then
  raise exception 'Placement invalide.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 moves:=jsonb_array_length(p_changes);
 if moves=0 then
  perform pg_advisory_xact_lock(hashtextextended(p_table::text,0));
  if exists(select 1 from public.table_holds
   where restaurant_id=venue and table_id=p_table and expires_at>clock_timestamp()
   and tstzrange(starts_at,ends_at,'[)')&&private.rm_ops_seat_span(target.starts_at,target.ends_at,clock_timestamp())) then
   raise exception 'Cette table est maintenue.' using errcode='23P01',detail='HOLD_CONFLICT';
  end if;
  return public.seat_reservation_v1(p_reservation_id,p_expected_status,p_table);
 end if;
 first_move:=p_changes->0;
 other_move:=p_changes->1;
 if moves>2 or (first_move->>'id') is distinct from p_reservation_id::text
  or (first_move->>'expected_status') is distinct from p_expected_status
  or (first_move->>'to_table') is distinct from p_table::text
  or (moves=2 and (other_move->>'from_table') is distinct from (first_move->>'to_table')) then
  raise exception 'Permutation incohérente.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 return public.apply_smart_placement_v4(p_reservation_id,p_changes,true,false);
end $$;

create or replace function private.express_walkin_v1(p_revision text,p_table uuid,p_guests integer,p_type text,p_room text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 venue uuid:=private.lock_express_service_v1(p_revision);
 room text:=nullif(btrim(p_room),'');
begin
 if p_guests is null or p_guests<1 or p_type is null or p_type not in ('hotel','exterieur')
 or (p_type='hotel' and room is not null and room !~ '^[0-9]{1,6}[A-Za-z]?$') then
  raise exception 'Couverts ou numéro de chambre invalide.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 if not exists(select 1 from public.restaurant_tables t join public.restaurant_rooms m on m.id=t.room_id
  where t.id=p_table and t.restaurant_id=venue and m.restaurant_id=venue and t.active and m.active) then
  raise exception 'Table indisponible.' using errcode='42501',detail='FORBIDDEN';
 end if;
 return public.install_walkin_group_v3(array[p_table],p_guests,
  case when p_type='hotel' then coalesce(room,'Client de passage') else 'Client de passage' end,p_type);
end $$;

do $ownership$
declare had_create boolean:=has_schema_privilege('resto_service_writer','private','CREATE');
begin
 if not had_create then grant create on schema private to resto_service_writer;end if;
 alter function private.lock_express_service_v1(text) owner to resto_service_writer;
 alter function private.express_seat_v1(text,uuid,text,uuid,jsonb) owner to resto_service_writer;
 alter function private.express_walkin_v1(text,uuid,integer,text,text) owner to resto_service_writer;
 if not had_create then revoke create on schema private from resto_service_writer;end if;
end
$ownership$;

revoke all on function private.lock_express_service_v1(text) from public,anon,authenticated;
revoke all on function private.express_seat_v1(text,uuid,text,uuid,jsonb) from public,anon;
revoke all on function private.express_walkin_v1(text,uuid,integer,text,text) from public,anon;
grant execute on function private.express_seat_v1(text,uuid,text,uuid,jsonb),
 private.express_walkin_v1(text,uuid,integer,text,text) to authenticated;

create or replace function public.express_seat_v1(p_revision text,p_reservation_id uuid,p_expected_status text,p_table uuid,p_changes jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.express_seat_v1($1,$2,$3,$4,$5);
$$;
create or replace function public.express_walkin_v1(p_revision text,p_table uuid,p_guests integer,p_type text,p_room text)
returns uuid language sql security invoker set search_path='' as $$
 select private.express_walkin_v1($1,$2,$3,$4,$5);
$$;
revoke all on function public.express_seat_v1(text,uuid,text,uuid,jsonb),
 public.express_walkin_v1(text,uuid,integer,text,text) from public,anon;
grant execute on function public.express_seat_v1(text,uuid,text,uuid,jsonb),
 public.express_walkin_v1(text,uuid,integer,text,text) to authenticated;

-- Express callers must go through the revision-checked endpoints. The engine
-- primitives remain available to their owner and for the internal audit path.
revoke execute on function public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean),
 public.seat_reservation_v1(uuid,text,uuid),public.seat_with_release_v1(uuid,text,uuid,uuid[],boolean),
 public.move_seated_party_v1(uuid,uuid,uuid) from authenticated;

create or replace function public.service_sync_state_v1()
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_set(jsonb_set(state,'{capabilities,quick_release}','1'::jsonb),
  '{capabilities,express_service}','1'::jsonb)
 from (select private.rm012_sync_api() as state) snapshot;
$$;
notify pgrst,'reload schema';
commit;
