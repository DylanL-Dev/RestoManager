-- B3 DEV candidate. Requires the already active B2 and #292 definitions.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';

do $prerequisites$
begin
 if to_regprocedure('private.lock_express_service_v1(text)') is null
 or to_regprocedure('public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean)') is null
 or to_regprocedure('public.quick_release_v1(uuid,uuid,uuid[],boolean)') is null
 or not exists (
  select 1 from pg_proc where oid=to_regprocedure('private.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text)')
   and strpos(prosrc,'and not coalesce(v_role=')>0
   and strpos(prosrc,'where r.restaurant_id=private.staff_restaurant() and lower(btrim(r.hotel_room))')>0
 ) then
  raise exception 'Le lot B2 et le correctif chambre #292 doivent déjà être actifs.';
 end if;
 if (select count(*) from pg_proc where oid in (
   to_regprocedure('private.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text)'),
   to_regprocedure('public.confirm_reservation_v2(text,text,integer,timestamptz,timestamptz,uuid[],uuid,text)')
  ) and strpos(prosrc,'cardinality(p_table_ids) not between 1 and 4')>0)<>2 then
  raise exception 'Le contrôle natif des groupes de quatre tables doit déjà être actif.';
 end if;
end
$prerequisites$;

create table if not exists private.express_occupant_confirmation (
 restaurant_id uuid not null,
 actor_id uuid not null,
 token uuid not null default gen_random_uuid(),
 revision text not null,
 service_date date not null,
 room text not null,
 guests integer not null,
 tables uuid[] not null,
 conflicting_reservation uuid not null,
 expires_at timestamptz not null,
 primary key(restaurant_id,actor_id)
);
alter table private.express_occupant_confirmation enable row level security;
alter table private.express_occupant_confirmation force row level security;
revoke all on private.express_occupant_confirmation from public,anon,authenticated,service_role,resto_service_writer;
grant select,insert,update,delete on private.express_occupant_confirmation to resto_service_writer;
drop policy if exists own_confirmation on private.express_occupant_confirmation;
create policy own_confirmation on private.express_occupant_confirmation to resto_service_writer
 using(restaurant_id=private.staff_restaurant() and actor_id=auth.uid())
 with check(restaurant_id=private.staff_restaurant() and actor_id=auth.uid() and private.current_staff_role()='fb_admin');

-- Called under the venue lock. Use the native fusion graph, then check every
-- member against the entire period, including a physically occupied table.
create or replace function private.express_check_tables_v2(
 p_venue uuid,p_tables uuid[],p_guests integer,p_span tstzrange,p_now timestamptz,p_exclude uuid
) returns void language plpgsql security invoker set search_path='' as $$
declare
 table_id uuid;
 found_tables integer;
 seats integer;
begin
 if p_tables is null or cardinality(p_tables) not between 1 and 4 or array_position(p_tables,null) is not null
 or (select count(distinct t) from unnest(p_tables) t)<>cardinality(p_tables)
 or p_guests is null or p_guests<1 then
  raise exception 'Sélection de tables invalide.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 for table_id in select t from unnest(p_tables) t order by t loop
  perform pg_advisory_xact_lock(hashtextextended(table_id::text,0));
 end loop;
 select count(*),sum(t.seats) into found_tables,seats from public.restaurant_tables t
 join public.restaurant_rooms m on m.id=t.room_id and m.restaurant_id=p_venue and m.active
 where t.id=any(p_tables) and t.restaurant_id=p_venue and t.active;
 if found_tables<>cardinality(p_tables) then
  raise exception 'Une table ou sa salle est indisponible.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 if seats<p_guests or private.check_fusion_selection(p_tables) is distinct from true then
  raise exception 'Fusion non autorisée ou capacité insuffisante.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 if exists(select 1 from public.table_holds h where h.restaurant_id=p_venue
  and h.table_id=any(p_tables) and h.expires_at>p_now and tstzrange(h.starts_at,h.ends_at,'[)')&&p_span) then
  raise exception 'Une table est maintenue.' using errcode='23P01',detail='HOLD_CONFLICT';
 end if;
 if exists(select 1 from public.reservation_tables a join public.reservations r
  on r.id=a.reservation_id and r.restaurant_id=p_venue where a.restaurant_id=p_venue
  and a.table_id=any(p_tables) and r.id is distinct from p_exclude
  and (r.status='seated' or (r.status in ('reserved','confirmed','late','arrived') and tstzrange(r.starts_at,r.ends_at,'[)')&&p_span))) then
  raise exception 'Une table est occupée ou prévue sur ce créneau.' using errcode='23P01',detail='TABLE_CONFLICT';
 end if;
end $$;

create or replace function private.express_seat_v2(
 p_revision text,p_reservation_id uuid,p_expected_status text,p_version uuid,p_tables uuid[],p_changes jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 venue uuid:=private.lock_express_service_v1(p_revision);
 target public.reservations%rowtype;
 stamp timestamptz:=clock_timestamp();
 assigned uuid[];
 moves integer;
 reachable integer;
begin
 select * into target from public.reservations where restaurant_id=venue and id=p_reservation_id for update;
 if not found then raise exception 'Réservation indisponible.' using errcode='42501',detail='FORBIDDEN'; end if;
 if target.edit_version is distinct from p_version or target.status is distinct from p_expected_status
 or target.status not in ('reserved','confirmed','late','arrived') or target.walkin_type is not null then
  raise exception 'La réservation a changé.' using errcode='40001',detail='STALE_VERSION';
 end if;
 if (target.starts_at at time zone 'Europe/Paris')::date<>(stamp at time zone 'Europe/Paris')::date
 or abs(extract(epoch from (target.starts_at-stamp)))>21600 then
  raise exception 'La réservation est hors du service.' using errcode='22023',detail='OUTSIDE_SERVICE';
 end if;
 if jsonb_typeof(p_changes) is distinct from 'array' then
  raise exception 'Placement invalide.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 moves:=jsonb_array_length(p_changes);
 if moves=0 then
  select array_agg(a.table_id order by a.table_id) into assigned from public.reservation_tables a
   where a.restaurant_id=venue and a.reservation_id=target.id;
  if assigned is null or assigned is distinct from array(select t from unnest(p_tables) t order by t) then
   raise exception 'L’attribution prévue a changé.' using errcode='40001',detail='STALE_VERSION';
  end if;
  perform private.express_check_tables_v2(venue,assigned,target.party_size,
   private.rm_ops_seat_span(target.starts_at,target.ends_at,stamp),stamp,target.id);
  update public.reservations set status='seated',seated_at=stamp,updated_at=stamp
   where id=target.id and restaurant_id=venue;
  insert into public.placement_events(restaurant_id,reservation_id,actor_id,action,to_tables)
   values(venue,target.id,auth.uid(),'seat',assigned);
  return jsonb_build_object('seated_at',stamp);
 end if;

 if moves>8 or cardinality(p_tables) is distinct from 1
 or (p_changes->0->>'id') is distinct from target.id::text
 or (p_changes->0->>'to_table') is distinct from p_tables[1]::text then
  raise exception 'Permutation incohérente.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 -- Reachability depends on the original table *and* an overlapping interval.
 -- Moving an unrelated reservation on the same table at another time is refused.
 with recursive plan as (
  select j.*,case when r.id=target.id then private.rm_ops_seat_span(r.starts_at,r.ends_at,stamp)
   else tstzrange(r.starts_at,r.ends_at,'[)') end as span
  from jsonb_to_recordset(p_changes) j(id uuid,from_table uuid,to_table uuid,expected_status text,expected_version uuid)
  join public.reservations r on r.id=j.id and r.restaurant_id=venue
   and r.status=j.expected_status and r.edit_version=j.expected_version
 ), connected(id) as (
  select id from plan where id=target.id
  union
  select child.id from connected c join plan parent on parent.id=c.id
   join plan child on child.from_table=parent.to_table and child.span&&parent.span
 )
 select count(*) into reachable from connected;
 if reachable<>moves then
  raise exception 'Plan périmé ou déplacements indépendants de la cible.' using errcode='40001',detail='STALE_VERSION';
 end if;
 return public.apply_smart_placement_v4(target.id,p_changes,true,false);
end $$;

create or replace function private.express_walkin_v2(
 p_revision text,p_tables uuid[],p_guests integer,p_type text,p_room text,p_confirmation uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 venue uuid:=private.lock_express_service_v1(p_revision);
 stamp timestamptz:=statement_timestamp();
 local_service_date date:=(stamp at time zone 'Europe/Paris')::date;
 finish timestamptz;
 booking uuid;
 room_key text:=nullif(lower(btrim(p_room)),'');
 chosen_tables uuid[]:=array(select t from unnest(p_tables) t order by t);
 conflict_id uuid;
 conflicts integer;
 receipt uuid;
 reason text;
begin
 if p_type is null or p_type not in ('hotel','exterieur')
 or (room_key is not null and (p_type<>'hotel' or room_key !~ '^[0-9]{1,6}[a-z]?$')) then
  raise exception 'Type de client ou numéro de chambre invalide.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 select stamp+make_interval(mins=>duration) into strict finish from public.restaurant_hours where id=1 and restaurant_id=venue for share;
 if private.restaurant_service_open_at_v1(venue,stamp) is distinct from true then
  raise exception 'Service fermé à cette heure.' using errcode='22023',detail='OUTSIDE_SERVICE';
 end if;
 perform private.express_check_tables_v2(venue,chosen_tables,p_guests,tstzrange(stamp,finish,'[)'),stamp,null);
 if p_confirmation is not null then
  select c.conflicting_reservation into conflict_id from private.express_occupant_confirmation c
  where c.restaurant_id=venue and c.actor_id=auth.uid() and c.token=p_confirmation and c.revision=p_revision
   and c.service_date=local_service_date
   and c.room=room_key and c.guests=p_guests and c.tables=chosen_tables and c.expires_at>clock_timestamp();
  if not found then
   raise exception 'Confirmation expirée ou contexte modifié.' using errcode='40001',detail='STALE_VERSION';
  end if;
 end if;

 begin
  -- Even with a receipt, the original protection is checked again before
  -- allowing one intentional exception through the historical v4 routine.
  booking:=public.install_walkin_group_v4(chosen_tables,p_guests,coalesce(room_key,'Client de passage'),p_type,false);
  if p_confirmation is not null then
   raise exception 'Le conflit de chambre a changé.' using errcode='40001',detail='STALE_VERSION';
  end if;
 exception when exclusion_violation then
  get stacked diagnostics reason=pg_exception_detail;
  if reason is distinct from 'ROOM_CONFLICT' or room_key is null or p_type<>'hotel' then raise; end if;
  select count(*),(array_agg(r.id))[1] into conflicts,receipt from public.reservations r
  where r.restaurant_id=venue and lower(btrim(r.hotel_room))=room_key
   and r.status in ('reserved','confirmed','late','arrived','seated')
   and r.starts_at<finish and r.ends_at>stamp;
  if conflicts<>1 then
   raise exception 'Le deuxième occupant ne peut plus être confirmé.' using errcode='23P01',detail='ROOM_LIMIT';
  end if;
  if p_confirmation is null then
   insert into private.express_occupant_confirmation as c(restaurant_id,actor_id,revision,service_date,room,guests,tables,conflicting_reservation,expires_at)
    values(venue,auth.uid(),p_revision,local_service_date,room_key,p_guests,chosen_tables,receipt,clock_timestamp()+interval '60 seconds')
    on conflict(restaurant_id,actor_id) do update set token=gen_random_uuid(),revision=excluded.revision,service_date=excluded.service_date,room=excluded.room,
     guests=excluded.guests,tables=excluded.tables,conflicting_reservation=excluded.conflicting_reservation,expires_at=excluded.expires_at
    returning c.token into p_confirmation;
   return jsonb_build_object('status','room_conflict','token',p_confirmation,'reservation_id',receipt,'revision',p_revision);
  end if;
  if receipt is distinct from conflict_id then
   raise exception 'Le dossier de la chambre a changé.' using errcode='40001',detail='STALE_VERSION';
  end if;
  booking:=public.install_walkin_group_v4(chosen_tables,p_guests,room_key,p_type,true);
 end;
 delete from private.express_occupant_confirmation where restaurant_id=venue and actor_id=auth.uid();
 insert into public.placement_events(restaurant_id,reservation_id,actor_id,action,to_tables,details)
 values(venue,booking,auth.uid(),'seat',chosen_tables,jsonb_build_object('walk_in',p_type,'second_occupant',conflict_id is not null));
 return jsonb_build_object('status','seated','reservation_id',booking);
end $$;

do $ownership$
declare had_create boolean:=has_schema_privilege('resto_service_writer','private','CREATE');
begin
 if not had_create then grant create on schema private to resto_service_writer; end if;
 alter function private.express_check_tables_v2(uuid,uuid[],integer,tstzrange,timestamptz,uuid) owner to resto_service_writer;
 alter function private.express_seat_v2(text,uuid,text,uuid,uuid[],jsonb) owner to resto_service_writer;
 alter function private.express_walkin_v2(text,uuid[],integer,text,text,uuid) owner to resto_service_writer;
 if not had_create then revoke create on schema private from resto_service_writer; end if;
end
$ownership$;
revoke all on function private.express_check_tables_v2(uuid,uuid[],integer,tstzrange,timestamptz,uuid)
 from public,anon,authenticated,service_role;

create or replace function public.express_seat_v2(p_revision text,p_reservation_id uuid,p_expected_status text,p_version uuid,p_tables uuid[],p_changes jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.express_seat_v2($1,$2,$3,$4,$5,$6);
$$;
create or replace function public.express_walkin_v2(p_revision text,p_tables uuid[],p_guests integer,p_type text,p_room text,p_confirmation uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.express_walkin_v2($1,$2,$3,$4,$5,$6);
$$;
revoke all on function public.express_seat_v2(text,uuid,text,uuid,uuid[],jsonb),
 public.express_walkin_v2(text,uuid[],integer,text,text,uuid),
 private.express_seat_v2(text,uuid,text,uuid,uuid[],jsonb),
 private.express_walkin_v2(text,uuid[],integer,text,text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.express_seat_v2(text,uuid,text,uuid,uuid[],jsonb),
 public.express_walkin_v2(text,uuid[],integer,text,text,uuid),
 private.express_seat_v2(text,uuid,text,uuid,uuid[],jsonb),
 private.express_walkin_v2(text,uuid[],integer,text,text,uuid)
 to authenticated;

create or replace function public.service_sync_state_v1()
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_set(jsonb_set(jsonb_set(state,'{capabilities,quick_release}','1'::jsonb),
  '{capabilities,express_service}','1'::jsonb),'{capabilities,express_service_v2}','1'::jsonb)
 from (select private.rm012_sync_api() as state) snapshot;
$$;
notify pgrst,'reload schema';
commit;
