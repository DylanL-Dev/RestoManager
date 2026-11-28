-- =====================================================================
-- RM-OPS ENGINE — PROPOSITION SQL (GitHub #265 / #266 / #268)
-- NE PAS APPLIQUER : ni Supabase DEV ni PROD sans autorisation écrite
-- distincte du propriétaire. Testée uniquement sur PostgreSQL local isolé
-- (tests/postgres/rm-ops-engine.cjs --with-proposals) par-dessus l'export
-- DEV du 10/11/2026. Aucune donnée existante n'est modifiée.
--
-- Contenu (additif, rien n'est supprimé ni remplacé) :
--  1. public.placement_events : journal auteur des placements (lecture
--     Restaurant de l'établissement uniquement, écriture via RPC seulement).
--  2. public.apply_smart_placement_v4 : v3 DEV + occupation réelle en cas
--     d'installation anticipée/tardive, même salle par défaut, mode
--     « réaffecter sans installer », journal, codes `detail` explicites.
--  3. public.seat_with_release_v1 : « les clients précédents sont partis ? »
--     libération constatée + installation dans une seule transaction.
--  4. public.move_seated_party_v1 : déplacement physique constaté d'un
--     client déjà installé.
--  5. public.seat_reservation_v1 : installation sur la table affectée avec
--     vérification de cette table sous verrou (course entre deux pupitres).
-- La v3 reste en place : l'interface actuelle continue de fonctionner.
-- =====================================================================
begin;

create table if not exists public.placement_events(
 id bigint generated always as identity primary key,
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 reservation_id uuid not null references public.reservations(id) on delete cascade,
 actor_id uuid not null,
 action text not null check (action in ('seat','swap_seat','reassign','release_then_seat','released_by_reuse','move_seated')),
 from_tables uuid[] not null default '{}',
 to_tables uuid[] not null default '{}',
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists placement_events_restaurant_time on public.placement_events(restaurant_id,created_at desc);
create index if not exists placement_events_reservation on public.placement_events(reservation_id);
alter table public.placement_events enable row level security;
alter table public.placement_events force row level security;
-- Convention RM-012 : les RPC d'écriture s'exécutent sous resto_service_writer (ni superutilisateur,
-- ni BYPASSRLS) ; le journal est en RLS forcée avec une politique d'ajout explicite pour ce rôle.
revoke all on public.placement_events from public,anon,authenticated,resto_service_writer;
grant select on public.placement_events to authenticated,resto_service_writer;
grant insert on public.placement_events to resto_service_writer;
drop policy if exists placement_events_read on public.placement_events;
create policy placement_events_read on public.placement_events for select to authenticated,resto_service_writer
 using(restaurant_id=(select private.staff_restaurant()) and (select private.current_staff_role())='fb_admin');
drop policy if exists placement_events_append on public.placement_events;
create policy placement_events_append on public.placement_events for insert to resto_service_writer
 with check(restaurant_id=(select private.staff_restaurant()) and actor_id=(select auth.uid()) and (select private.current_staff_role())='fb_admin');

-- Intervalle d'occupation réel d'une réservation installée maintenant.
create or replace function private.rm_ops_seat_span(p_starts timestamptz,p_ends timestamptz,p_now timestamptz)
returns tstzrange language sql immutable set search_path='' as $$
 select case when abs(extract(epoch from (p_now-p_starts)))<=12*3600
  then tstzrange(least(p_starts,p_now),greatest(p_starts,p_now)+(p_ends-p_starts),'[)')
  else tstzrange(p_starts,p_ends,'[)') end
$$;
revoke all on function private.rm_ops_seat_span(timestamptz,timestamptz,timestamptz) from public,anon,authenticated;

create or replace function public.apply_smart_placement_v4(
 p_target_reservation_id uuid,p_changes jsonb,p_seat boolean default true,p_allow_room_change boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_restaurant uuid := private.staff_restaurant();
 v_entry record;
 v_res public.reservations%rowtype;
 v_target public.reservations%rowtype;
 v_current_table uuid;
 v_table uuid;
 v_seats integer;
 v_count integer := 0;
 v_time timestamptz := clock_timestamp();
 v_span tstzrange;
 v_from_room uuid;
 v_to_room uuid;
begin
 perform private.lock_restaurant_mutation_v1();
 if (select auth.uid()) is null or private.current_staff_role() is distinct from 'fb_admin' or v_restaurant is null then
  raise exception 'Placement réservé à l’équipe du restaurant.' using errcode='42501',detail='FORBIDDEN';
 end if;
 if p_target_reservation_id is null or p_seat is null or p_allow_room_change is null or jsonb_typeof(p_changes) is distinct from 'array'
   or jsonb_array_length(p_changes) not between 1 and 8 then
  raise exception 'Réorganisation invalide.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 if (select count(distinct (e->>'id')) from jsonb_array_elements(p_changes) e) <> jsonb_array_length(p_changes)
   or (select count(*) from jsonb_array_elements(p_changes) e where e->>'id'=p_target_reservation_id::text) <> 1 then
  raise exception 'Réservations incohérentes.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('smart-placement:'||v_restaurant::text,0));
 perform 1 from public.reservations r
  where r.restaurant_id=v_restaurant and r.id in (select (e->>'id')::uuid from jsonb_array_elements(p_changes) e)
  order by r.id for update;
 for v_table in
  select distinct tbl from (
   select (e->>'from_table')::uuid tbl from jsonb_array_elements(p_changes) e
   union all select (e->>'to_table')::uuid tbl from jsonb_array_elements(p_changes) e) q order by tbl
 loop
  if v_table is null then raise exception 'Table manquante.' using errcode='22023',detail='INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 end loop;
 select * into v_target from public.reservations where id=p_target_reservation_id and restaurant_id=v_restaurant;
 if not found then raise exception 'Réservation introuvable dans cet établissement.' using errcode='42501',detail='FORBIDDEN'; end if;
 -- Occupation réelle de la cible : à partir de maintenant si on l'installe maintenant.
 v_span := case when p_seat then private.rm_ops_seat_span(v_target.starts_at,v_target.ends_at,v_time)
                else tstzrange(v_target.starts_at,v_target.ends_at,'[)') end;
 for v_entry in
  select x.* from jsonb_to_recordset(p_changes) as x(id uuid,from_table uuid,to_table uuid,expected_status text) order by id
 loop
  v_count := v_count + 1;
  if v_entry.id is null or v_entry.from_table is null or v_entry.to_table is null
    or v_entry.expected_status is null or v_entry.from_table=v_entry.to_table then
   raise exception 'Modification de table invalide.' using errcode='22023',detail='INVALID_INPUT';
  end if;
  select * into v_res from public.reservations where id=v_entry.id and restaurant_id=v_restaurant;
  if not found then raise exception 'Réservation introuvable dans cet établissement.' using errcode='42501',detail='FORBIDDEN'; end if;
  if v_res.status is distinct from v_entry.expected_status
     or v_res.status not in ('reserved','confirmed','late','arrived')
     or (v_entry.id<>p_target_reservation_id and v_res.status='arrived')
     or (not p_seat and v_res.status='arrived')
     or v_res.walkin_type is not null then
   raise exception 'Une réservation a changé. Actualisez avant de confirmer.' using errcode='40001',detail='STALE_VERSION';
  end if;
  select count(*),(array_agg(table_id))[1] into v_seats,v_current_table
   from public.reservation_tables where reservation_id=v_entry.id and restaurant_id=v_restaurant;
  if v_seats<>1 or v_current_table is distinct from v_entry.from_table then
   raise exception 'L’attribution a changé ou contient une fusion. Actualisez.' using errcode='40001',detail='STALE_VERSION';
  end if;
  select t.seats,t.room_id into v_seats,v_to_room from public.restaurant_tables t
   where t.id=v_entry.to_table and t.restaurant_id=v_restaurant and t.active
    and exists(select 1 from public.restaurant_rooms m where m.id=t.room_id and m.restaurant_id=v_restaurant and m.active);
  if not found or v_seats<v_res.party_size then
   raise exception 'Table désactivée ou capacité insuffisante.' using errcode='22023',detail='INVALID_INPUT';
  end if;
  -- Même salle par défaut pour les réservations déplacées par le moteur (la cible choisit librement).
  select t.room_id into v_from_room from public.restaurant_tables t where t.id=v_entry.from_table and t.restaurant_id=v_restaurant;
  if v_entry.id<>p_target_reservation_id and not p_allow_room_change and v_from_room is distinct from v_to_room then
   raise exception 'Ce déplacement change un client de salle.' using errcode='22023',detail='ROOM_CHANGE_REQUIRED';
  end if;
  if exists(select 1 from public.table_holds h
   where h.table_id=v_entry.to_table and h.expires_at>v_time
     and tstzrange(h.starts_at,h.ends_at,'[)') && case when v_entry.id=p_target_reservation_id then v_span else tstzrange(v_res.starts_at,v_res.ends_at,'[)') end) then
   raise exception 'Une table est maintenue pendant une réservation en cours.' using errcode='23P01',detail='HOLD_CONFLICT';
  end if;
  if exists(
   select 1 from public.reservations other
    join public.reservation_tables other_rt on other_rt.reservation_id=other.id
    left join lateral (select (e->>'to_table')::uuid new_table from jsonb_array_elements(p_changes) e where e->>'id'=other.id::text) moved on true
   where other.restaurant_id=v_restaurant and other.id<>v_res.id and other.status='seated'
     and coalesce(moved.new_table,other_rt.table_id)=v_entry.to_table) then
   raise exception 'Table occupée par un client installé.' using errcode='23P01',detail='TARGET_OCCUPIED';
  end if;
  if exists(
   select 1 from public.reservations other
    join public.reservation_tables other_rt on other_rt.reservation_id=other.id
    left join lateral (select (e->>'to_table')::uuid new_table from jsonb_array_elements(p_changes) e where e->>'id'=other.id::text) moved on true
   where other.restaurant_id=v_restaurant and other.id<>v_res.id
     and other.status in ('reserved','confirmed','late','arrived')
     and coalesce(moved.new_table,other_rt.table_id)=v_entry.to_table
     and tstzrange(other.starts_at,other.ends_at,'[)') &&
         case when other.id=p_target_reservation_id then v_span
              when v_entry.id=p_target_reservation_id then v_span
              else tstzrange(v_res.starts_at,v_res.ends_at,'[)') end) then
   raise exception 'Conflit de table détecté. Aucune modification enregistrée.' using errcode='23P01',detail='TABLE_CONFLICT';
  end if;
 end loop;
 if v_count<>jsonb_array_length(p_changes) then
  raise exception 'Réorganisation incomplète.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 for v_entry in select x.* from jsonb_to_recordset(p_changes) as x(id uuid,from_table uuid,to_table uuid,expected_status text)
 loop
  update public.reservation_tables set table_id=v_entry.to_table
   where restaurant_id=v_restaurant and reservation_id=v_entry.id and table_id=v_entry.from_table;
  if not found then raise exception 'Attribution modifiée entre-temps.' using errcode='40001',detail='STALE_VERSION'; end if;
  insert into public.placement_events(restaurant_id,reservation_id,actor_id,action,from_tables,to_tables,details)
  values(v_restaurant,v_entry.id,auth.uid(),
   case when v_entry.id<>p_target_reservation_id then 'reassign' when p_seat then 'swap_seat' else 'reassign' end,
   array[v_entry.from_table],array[v_entry.to_table],
   jsonb_build_object('target',p_target_reservation_id,'operation_size',v_count,'seat',p_seat));
 end loop;
 if p_seat then
  update public.reservations set status='seated',seated_at=v_time,updated_at=v_time
   where id=p_target_reservation_id and restaurant_id=v_restaurant and status in ('reserved','confirmed','late','arrived');
  if not found then raise exception 'Installation impossible, statut modifié.' using errcode='40001',detail='STALE_VERSION'; end if;
 end if;
 return jsonb_build_object('changed',v_count,'seated',p_seat,'seated_at',case when p_seat then v_time end);
end
$function$;
revoke all on function public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean) from public,anon;
grant execute on function public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean) to authenticated;

-- « Les clients précédents sont partis ? » : libération constatée + installation, une transaction.
create or replace function public.seat_with_release_v1(
 p_reservation_id uuid,p_expected_status text,p_table uuid,p_release_ids uuid[],p_allow_room_change boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_restaurant uuid := private.staff_restaurant();
 v_time timestamptz := clock_timestamp();
 v_target public.reservations%rowtype;
 v_current uuid;
 v_count integer;
 v_released integer := 0;
 v_id uuid;
begin
 perform private.lock_restaurant_mutation_v1();
 if (select auth.uid()) is null or private.current_staff_role() is distinct from 'fb_admin' or v_restaurant is null then
  raise exception 'Action réservée à l’équipe du restaurant.' using errcode='42501',detail='FORBIDDEN';
 end if;
 if p_reservation_id is null or p_table is null or p_expected_status is null
   or p_release_ids is null or cardinality(p_release_ids) not between 1 and 3
   or array_position(p_release_ids,null) is not null or p_reservation_id=any(p_release_ids) then
  raise exception 'Demande invalide.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('smart-placement:'||v_restaurant::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_table::text,0));
 perform 1 from public.reservations where restaurant_id=v_restaurant and (id=p_reservation_id or id=any(p_release_ids)) order by id for update;
 select * into v_target from public.reservations where id=p_reservation_id and restaurant_id=v_restaurant;
 if not found then raise exception 'Réservation introuvable dans cet établissement.' using errcode='42501',detail='FORBIDDEN'; end if;
 if v_target.status is distinct from p_expected_status or v_target.status not in ('reserved','confirmed','late','arrived') then
  raise exception 'La réservation a changé. Actualisez.' using errcode='40001',detail='STALE_VERSION';
 end if;
 -- Chaque client à libérer doit être installé, du même établissement, et occuper exactement cette table.
 if (select count(*) from public.reservations r
      where r.id=any(p_release_ids) and r.restaurant_id=v_restaurant and r.status='seated'
        and exists(select 1 from public.reservation_tables t where t.reservation_id=r.id and t.table_id=p_table)) <> cardinality(p_release_ids) then
  raise exception 'Un client à libérer n’est plus installé à cette table.' using errcode='40001',detail='STALE_VERSION';
 end if;
 -- Aucun autre client installé ne doit rester sur la table (jamais de libération implicite).
 if exists(select 1 from public.reservations r join public.reservation_tables t on t.reservation_id=r.id
   where t.table_id=p_table and r.restaurant_id=v_restaurant and r.status='seated' and r.id<>all(p_release_ids)) then
  raise exception 'Un autre client est installé à cette table.' using errcode='23P01',detail='TARGET_OCCUPIED';
 end if;
 foreach v_id in array p_release_ids loop
  update public.reservations set status='released',released_at=v_time,updated_at=v_time
   where id=v_id and restaurant_id=v_restaurant and status='seated';
  if not found then raise exception 'Libération impossible.' using errcode='40001',detail='STALE_VERSION'; end if;
  v_released := v_released+1;
  insert into public.placement_events(restaurant_id,reservation_id,actor_id,action,from_tables,details)
  values(v_restaurant,v_id,auth.uid(),'released_by_reuse',array[p_table],jsonb_build_object('reused_for',p_reservation_id));
 end loop;
 select count(*),(array_agg(table_id))[1] into v_count,v_current from public.reservation_tables
  where reservation_id=p_reservation_id and restaurant_id=v_restaurant;
 if v_count=1 and v_current=p_table then
  if exists(select 1 from public.reservations o join public.reservation_tables t on t.reservation_id=o.id
    where t.table_id=p_table and o.id<>p_reservation_id and o.restaurant_id=v_restaurant
      and o.status in ('reserved','confirmed','late','arrived')
      and tstzrange(o.starts_at,o.ends_at,'[)') && private.rm_ops_seat_span(v_target.starts_at,v_target.ends_at,v_time)) then
   raise exception 'Conflit de table détecté.' using errcode='23P01',detail='TABLE_CONFLICT';
  end if;
  update public.reservations set status='seated',seated_at=v_time,updated_at=v_time where id=p_reservation_id;
  insert into public.placement_events(restaurant_id,reservation_id,actor_id,action,to_tables,details)
  values(v_restaurant,p_reservation_id,auth.uid(),'release_then_seat',array[p_table],jsonb_build_object('released',p_release_ids));
 elsif v_count=1 then
  perform public.apply_smart_placement_v4(p_reservation_id,
   jsonb_build_array(jsonb_build_object('id',p_reservation_id,'from_table',v_current,'to_table',p_table,'expected_status',v_target.status)),
   true,p_allow_room_change);
  -- Journal en ajout seul : un événement supplémentaire, jamais de modification d'une ligne existante.
  insert into public.placement_events(restaurant_id,reservation_id,actor_id,action,from_tables,to_tables,details)
  values(v_restaurant,p_reservation_id,auth.uid(),'release_then_seat',array[v_current],array[p_table],jsonb_build_object('released',p_release_ids));
 else
  raise exception 'Fusion : utilisez le mode complet.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 return jsonb_build_object('released',v_released,'seated_at',v_time);
end
$function$;
revoke all on function public.seat_with_release_v1(uuid,text,uuid,uuid[],boolean) from public,anon;
grant execute on function public.seat_with_release_v1(uuid,text,uuid,uuid[],boolean) to authenticated;

-- Déplacement physique constaté d'un client déjà installé (heure d'installation conservée).
create or replace function public.move_seated_party_v1(p_reservation_id uuid,p_from_table uuid,p_to_table uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_restaurant uuid := private.staff_restaurant();
 v_time timestamptz := clock_timestamp();
 v_res public.reservations%rowtype;
 v_count integer;
 v_current uuid;
 v_seats integer;
 v_span tstzrange;
begin
 perform private.lock_restaurant_mutation_v1();
 if (select auth.uid()) is null or private.current_staff_role() is distinct from 'fb_admin' or v_restaurant is null then
  raise exception 'Action réservée à l’équipe du restaurant.' using errcode='42501',detail='FORBIDDEN';
 end if;
 if p_reservation_id is null or p_from_table is null or p_to_table is null or p_from_table=p_to_table then
  raise exception 'Demande invalide.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('smart-placement:'||v_restaurant::text,0));
 perform pg_advisory_xact_lock(hashtextextended(least(p_from_table,p_to_table)::text,0));
 perform pg_advisory_xact_lock(hashtextextended(greatest(p_from_table,p_to_table)::text,0));
 select * into v_res from public.reservations where id=p_reservation_id and restaurant_id=v_restaurant for update;
 if not found then raise exception 'Réservation introuvable dans cet établissement.' using errcode='42501',detail='FORBIDDEN'; end if;
 if v_res.status<>'seated' then raise exception 'Le client n’est plus installé.' using errcode='40001',detail='STALE_VERSION'; end if;
 select count(*),(array_agg(table_id))[1] into v_count,v_current from public.reservation_tables where reservation_id=p_reservation_id;
 if v_count<>1 or v_current<>p_from_table then raise exception 'L’attribution a changé ou contient une fusion.' using errcode='40001',detail='STALE_VERSION'; end if;
 select t.seats into v_seats from public.restaurant_tables t where t.id=p_to_table and t.restaurant_id=v_restaurant and t.active
  and exists(select 1 from public.restaurant_rooms m where m.id=t.room_id and m.restaurant_id=v_restaurant and m.active);
 if not found or v_seats<v_res.party_size then raise exception 'Table désactivée ou capacité insuffisante.' using errcode='22023',detail='INVALID_INPUT'; end if;
 if exists(select 1 from public.reservations o join public.reservation_tables t on t.reservation_id=o.id
   where t.table_id=p_to_table and o.restaurant_id=v_restaurant and o.status='seated') then
  raise exception 'Table occupée par un client installé.' using errcode='23P01',detail='TARGET_OCCUPIED';
 end if;
 -- Occupation restante : de maintenant jusqu'à la fin estimée (au moins 30 min).
 v_span := tstzrange(v_time,greatest(coalesce(v_res.seated_at,v_res.starts_at)+(v_res.ends_at-v_res.starts_at),v_time+interval '30 minutes'),'[)');
 if exists(select 1 from public.table_holds h where h.table_id=p_to_table and h.expires_at>v_time and tstzrange(h.starts_at,h.ends_at,'[)') && v_span) then
  raise exception 'Une table est maintenue.' using errcode='23P01',detail='HOLD_CONFLICT';
 end if;
 if exists(select 1 from public.reservations o join public.reservation_tables t on t.reservation_id=o.id
   where t.table_id=p_to_table and o.restaurant_id=v_restaurant and o.status in ('reserved','confirmed','late','arrived')
     and tstzrange(o.starts_at,o.ends_at,'[)') && v_span) then
  raise exception 'Table prévue pour un autre client.' using errcode='23P01',detail='TABLE_CONFLICT';
 end if;
 update public.reservation_tables set table_id=p_to_table where reservation_id=p_reservation_id and table_id=p_from_table;
 insert into public.placement_events(restaurant_id,reservation_id,actor_id,action,from_tables,to_tables)
 values(v_restaurant,p_reservation_id,auth.uid(),'move_seated',array[p_from_table],array[p_to_table]);
 return jsonb_build_object('moved_at',v_time);
end
$function$;
revoke all on function public.move_seated_party_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.move_seated_party_v1(uuid,uuid,uuid) to authenticated;

-- Installation sur la table affectée, en VÉRIFIANT cette table sous verrou (course 214/215 entre deux
-- pupitres : change_reservation_status_v3 installe sur la table courante, quelle qu'elle soit).
create or replace function public.seat_reservation_v1(p_reservation_id uuid,p_expected_status text,p_table uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_restaurant uuid := private.staff_restaurant();
 v_time timestamptz := clock_timestamp();
 v_res public.reservations%rowtype;
 v_count integer;
 v_current uuid;
begin
 perform private.lock_restaurant_mutation_v1();
 if (select auth.uid()) is null or private.current_staff_role() is distinct from 'fb_admin' or v_restaurant is null then
  raise exception 'Action réservée à l’équipe du restaurant.' using errcode='42501',detail='FORBIDDEN';
 end if;
 if p_reservation_id is null or p_expected_status is null or p_table is null then
  raise exception 'Demande invalide.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('smart-placement:'||v_restaurant::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_table::text,0));
 select * into v_res from public.reservations where id=p_reservation_id and restaurant_id=v_restaurant for update;
 if not found then raise exception 'Réservation introuvable dans cet établissement.' using errcode='42501',detail='FORBIDDEN'; end if;
 if v_res.status is distinct from p_expected_status or v_res.status not in ('reserved','confirmed','late','arrived') then
  raise exception 'La réservation a changé. Actualisez.' using errcode='40001',detail='STALE_VERSION';
 end if;
 select count(*),(array_agg(table_id))[1] into v_count,v_current from public.reservation_tables
  where reservation_id=p_reservation_id and restaurant_id=v_restaurant;
 if v_count<>1 or v_current is distinct from p_table then
  raise exception 'L’attribution a changé. Actualisez.' using errcode='40001',detail='STALE_VERSION';
 end if;
 if not exists(select 1 from public.restaurant_tables t where t.id=p_table and t.restaurant_id=v_restaurant and t.active
   and exists(select 1 from public.restaurant_rooms m where m.id=t.room_id and m.restaurant_id=v_restaurant and m.active)) then
  raise exception 'Table désactivée.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 if exists(select 1 from public.reservations o join public.reservation_tables t on t.reservation_id=o.id
   where t.table_id=p_table and o.id<>p_reservation_id and o.restaurant_id=v_restaurant and o.status='seated') then
  raise exception 'Table occupée par un client installé.' using errcode='23P01',detail='TARGET_OCCUPIED';
 end if;
 if exists(select 1 from public.reservations o join public.reservation_tables t on t.reservation_id=o.id
   where t.table_id=p_table and o.id<>p_reservation_id and o.restaurant_id=v_restaurant
     and o.status in ('reserved','confirmed','late','arrived')
     and tstzrange(o.starts_at,o.ends_at,'[)') && private.rm_ops_seat_span(v_res.starts_at,v_res.ends_at,v_time)) then
  raise exception 'Table encore prévue pour un autre client.' using errcode='23P01',detail='TABLE_CONFLICT';
 end if;
 update public.reservations set status='seated',seated_at=v_time,updated_at=v_time where id=p_reservation_id;
 insert into public.placement_events(restaurant_id,reservation_id,actor_id,action,to_tables)
 values(v_restaurant,p_reservation_id,auth.uid(),'seat',array[p_table]);
 return jsonb_build_object('seated_at',v_time);
end
$function$;
revoke all on function public.seat_reservation_v1(uuid,text,uuid) from public,anon;
grant execute on function public.seat_reservation_v1(uuid,text,uuid) to authenticated;

-- Propriétaire des fonctions : resto_service_writer (comme install_walkin_group_v3 et RM-012) ;
-- l'appel imbriqué seat_with_release_v1 → apply_smart_placement_v4 s'exécute donc sous ce rôle.
do $ownership$
declare
 had_private boolean:=has_schema_privilege('resto_service_writer','private','CREATE');
 had_public boolean:=has_schema_privilege('resto_service_writer','public','CREATE');
begin
 if not had_private then grant create on schema private to resto_service_writer;end if;
 if not had_public then grant create on schema public to resto_service_writer;end if;
 alter function private.rm_ops_seat_span(timestamptz,timestamptz,timestamptz) owner to resto_service_writer;
 alter function public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean) owner to resto_service_writer;
 alter function public.seat_with_release_v1(uuid,text,uuid,uuid[],boolean) owner to resto_service_writer;
 alter function public.move_seated_party_v1(uuid,uuid,uuid) owner to resto_service_writer;
 alter function public.seat_reservation_v1(uuid,text,uuid) owner to resto_service_writer;
 if not had_private then revoke create on schema private from resto_service_writer;end if;
 if not had_public then revoke create on schema public from resto_service_writer;end if;
end
$ownership$;
grant execute on function private.rm_ops_seat_span(timestamptz,timestamptz,timestamptz) to resto_service_writer;
grant execute on function public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean) to resto_service_writer;

notify pgrst,'reload schema';
commit;
