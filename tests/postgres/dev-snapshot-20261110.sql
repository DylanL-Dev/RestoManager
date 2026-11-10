-- TEST SNAPSHOT ONLY. DEV lykoybacslvmhtzftqsf, captured read-only 2026-11-10.
-- Definitions/RLS/ACL only: no user, reservation or password data. Never apply to a hosted project.
set check_function_bodies=off;
CREATE OR REPLACE FUNCTION private.acquire_table_hold(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := auth.uid(); v_hold uuid; v_conflict boolean;
begin
 if v_user is null or (select private.current_staff_role()) not in ('reception','fb_admin') then
  raise exception 'Accès non autorisé' using errcode='42501',detail='FORBIDDEN';
 end if;
 if p_table_id is null or p_starts_at is null or p_ends_at is null
 or p_ends_at<=p_starts_at or p_ends_at-p_starts_at>interval '6 hours'
 or p_starts_at<now()-interval '5 minutes' then
  raise exception 'Créneau invalide' using errcode='22023',detail='INVALID_INPUT';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_table_id::text,0));
 if not exists(select 1 from public.restaurant_tables t where t.id=p_table_id and t.active
   and exists(select 1 from public.restaurant_rooms m where m.id=t.room_id and m.active)) then
  raise exception 'Table indisponible' using errcode='22023',detail='INVALID_INPUT';
 end if;
 select exists(
  select 1 from public.reservation_tables rt
  join public.reservations r on r.id=rt.reservation_id
  where rt.table_id=p_table_id and r.status in ('reserved','confirmed','late','arrived','seated')
  and r.starts_at<p_ends_at and r.ends_at>p_starts_at
 ) into v_conflict;
 if v_conflict then raise exception 'Table déjà réservée' using errcode='23P01',detail='TABLE_CONFLICT'; end if;
 select h.id into v_hold from public.table_holds h
 where h.table_id=p_table_id and h.expires_at>clock_timestamp()
 and h.starts_at<p_ends_at and h.ends_at>p_starts_at
 and h.held_by=v_user
 order by h.created_at desc limit 1;
 if exists(select 1 from public.table_holds h
 where h.table_id=p_table_id and h.expires_at>clock_timestamp()
 and h.starts_at<p_ends_at and h.ends_at>p_starts_at
 and h.held_by<>v_user) then
  raise exception 'Table temporairement bloquée par un collègue' using errcode='23P01',detail='HOLD_CONFLICT';
 end if;
 if v_hold is not null then
  update public.table_holds set starts_at=p_starts_at,ends_at=p_ends_at,
  expires_at=clock_timestamp()+interval '3 minutes' where id=v_hold;
 else
  insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at)
  values(p_table_id,v_user,p_starts_at,p_ends_at,clock_timestamp()+interval '3 minutes')
  returning id into v_hold;
 end if;
 return v_hold;
end $function$
;
alter function "private"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.acquire_table_hold_v2(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 if auth.uid() is null or private.current_staff_role() not in ('reception','fb_admin') then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_owner_token is null then raise exception 'Jeton de session requis' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_table_id::text,0));
 if exists(select 1 from public.table_holds where table_id=p_table_id and expires_at>clock_timestamp()
 and starts_at<p_ends_at and ends_at>p_starts_at and (held_by is distinct from auth.uid() or owner_token is distinct from p_owner_token))
 then raise exception 'Table déjà bloquée par une autre session' using errcode='23P01'; end if;
 v_id:=private.acquire_table_hold(p_table_id,p_starts_at,p_ends_at);
 update public.table_holds set owner_token=p_owner_token where id=v_id and held_by=auth.uid();
 return v_id;
end $function$
;
alter function "private"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.bump_reservation_edit_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 new.edit_version:=gen_random_uuid();
 return new;
end $function$
;
alter function "private"."bump_reservation_edit_version"() owner to "postgres";
CREATE OR REPLACE FUNCTION private.cancel_reservation_v3(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text;
begin
 if auth.uid() is null or private.current_staff_role() not in ('reception','fb_admin') then
  raise exception 'Accès refusé' using errcode='42501';
 end if;
 select status into v_status from public.reservations where id=p_reservation_id for update;
 if not found then raise exception 'Réservation introuvable' using errcode='P0002'; end if;
 if v_status in ('completed','released','cancelled','no_show') then
  raise exception 'Cette réservation ne peut plus être annulée' using errcode='22023';
 end if;
 update public.reservations set status='cancelled',updated_at=now() where id=p_reservation_id;
 return true;
end $function$
;
alter function "private"."cancel_reservation_v3"(p_reservation_id uuid) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.change_reservation_status_v3(p_reservation_id uuid, p_expected text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_status text;
  table_key uuid;
  changed_at timestamptz := clock_timestamp();
begin
  if auth.uid() is null or coalesce(private.current_staff_role()::text,'') not in ('reception','fb_admin') then
    raise exception 'Accès refusé' using errcode='42501';
  end if;
  select status into strict current_status from public.reservations where id=p_reservation_id for update;
  if p_status is null or not (case p_status
    when 'confirmed' then p_expected in ('reserved','late')
    when 'late' then p_expected in ('reserved','confirmed')
    when 'arrived' then p_expected in ('reserved','confirmed','late')
    when 'seated' then p_expected in ('reserved','confirmed','late','arrived')
    when 'no_show' then p_expected in ('reserved','confirmed','late')
    when 'completed' then p_expected='seated'
    when 'released' then p_expected='seated'
    else false end) or p_expected is null then
    raise exception 'Ce changement de statut est impossible.';
  end if;
  if current_status=p_status then return; end if;
  if current_status is distinct from p_expected then raise exception 'La réservation a déjà changé. Actualisez sa fiche.'; end if;
  if p_status='seated' then
    for table_key in select table_id from public.reservation_tables where reservation_id=p_reservation_id order by table_id loop
      perform pg_advisory_xact_lock(hashtextextended(table_key::text,0));
      if not exists(select 1 from public.restaurant_tables where id=table_key and active) then
        raise exception 'Cette table est désactivée.';
      end if;
      if exists(select 1 from public.reservation_tables a join public.reservations r on r.id=a.reservation_id
                where a.table_id=table_key and r.id<>p_reservation_id and r.status='seated') then
        raise exception 'Cette table est encore occupée. Enregistrez d’abord le départ du client.';
      end if;
    end loop;
    if table_key is null then raise exception 'Attribuez une table avant d’installer le client.'; end if;
  end if;
  update public.reservations set status=p_status, updated_at=changed_at,
    confirmed_at=case when p_status='confirmed' then changed_at else confirmed_at end,
    arrived_at=case when p_status='arrived' then changed_at else arrived_at end,
    seated_at=case when p_status='seated' then changed_at else seated_at end,
    released_at=case when p_status in ('completed','released') then changed_at else released_at end
  where id=p_reservation_id;
end $function$
;
alter function "private"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.check_fusion_selection(p_ids uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count int;v_reached uuid[];v_next uuid[];
begin
 if cardinality(p_ids)<=1 then return true;end if;
 if exists(select 1 from public.restaurant_tables t where t.id=any(p_ids) and t.room_id is distinct from (select room_id from public.restaurant_tables where id=p_ids[1])) then return false;end if;
 v_reached:=array[p_ids[1]];
 loop
  select array_agg(distinct x) into v_next from (
   select case when l.table_a=any(v_reached) then l.table_b else l.table_a end x
   from public.table_fusion_links l where (l.table_a=any(v_reached) and l.table_b=any(p_ids))
    or (l.table_b=any(v_reached) and l.table_a=any(p_ids))
  ) q where not x=any(v_reached);
  exit when v_next is null;
  v_reached:=v_reached||v_next;
 end loop;
 return (select count(distinct x) from unnest(v_reached) x)=cardinality(p_ids);
end $function$
;
alter function "private"."check_fusion_selection"(p_ids uuid[]) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.confirm_reservation(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid := auth.uid();
 v_role text;
 v_table uuid;
 v_id uuid;
 v_count integer;
 v_seats integer;
 v_room text := nullif(btrim(p_hotel_room),'');
begin
 perform private.validate_booking_identity_v1(p_hotel_room,p_notes);
 v_role := private.current_staff_role();
 if v_user is null or v_role is null or v_role not in ('reception','fb_admin') then
  raise exception 'Accès non autorisé' using errcode='42501',detail='FORBIDDEN';
 end if;
 if p_guest_name is null or length(btrim(p_guest_name)) not between 1 and 160
 or p_party_size is null or p_party_size not between 1 and 50
 or p_starts_at is null or p_ends_at is null
 or p_ends_at <= p_starts_at or p_ends_at-p_starts_at > interval '6 hours'
 or p_starts_at < now()-interval '5 minutes'
 or p_table_ids is null or cardinality(p_table_ids) not between 1 and 3
 or array_position(p_table_ids,null) is not null then
  raise exception 'Réservation invalide' using errcode='22023',detail='INVALID_INPUT';
 end if;
 if v_room is not null and length(v_room)>40 then
  raise exception 'Numéro de chambre invalide' using errcode='22023',detail='INVALID_INPUT';
 end if;
 select count(*) into v_count from (select distinct x from unnest(p_table_ids) x) q;
 if v_count <> cardinality(p_table_ids) then
  raise exception 'Tables en double' using errcode='22023',detail='INVALID_INPUT';
 end if;
 -- Lock all table IDs in stable order: acquisition uses the same advisory lock.
 for v_table in select distinct x from unnest(p_table_ids) x order by x loop
  perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 end loop;
 -- Lock hotel-room identity to serialize duplicate-room checks.
 if v_room is not null then
  perform pg_advisory_xact_lock(hashtextextended('hotel-room:'||private.staff_restaurant()::text||':'||lower(v_room),0));
 end if;
 select count(*),coalesce(sum(seats),0) into v_count,v_seats
 from public.restaurant_tables t where t.id=any(p_table_ids) and t.active
  and exists(select 1 from public.restaurant_rooms m where m.id=t.room_id and m.active);
 if v_count <> cardinality(p_table_ids) or v_seats < p_party_size then
  raise exception 'Tables inexistantes, désactivées ou capacité insuffisante' using errcode='22023',detail='INVALID_INPUT';
 end if;
 -- Every selected table must have an unexpired hold owned by this user
 -- for exactly this booking interval.
 if exists (
  select 1 from unnest(p_table_ids) x
  where not exists(
   select 1 from public.table_holds h
   where h.table_id=x and h.held_by=v_user and h.expires_at>clock_timestamp()
   and h.starts_at=p_starts_at and h.ends_at=p_ends_at
  )
 ) then
  raise exception 'Verrouillage expiré ou absent : sélectionnez à nouveau les tables' using errcode='23P01',detail='HOLD_EXPIRED';
 end if;
 if exists (
  select 1 from public.reservation_tables rt
  join public.reservations r on r.id=rt.reservation_id
  where rt.table_id=any(p_table_ids)
  and r.status in ('reserved','confirmed','late','arrived','seated')
  and r.starts_at<p_ends_at and r.ends_at>p_starts_at
 ) or exists (
  select 1 from public.table_holds h
  where h.table_id=any(p_table_ids) and h.held_by<>v_user
  and h.expires_at>clock_timestamp()
  and h.starts_at<p_ends_at and h.ends_at>p_starts_at
 ) then
  raise exception 'Conflit de disponibilité des tables' using errcode='23P01',detail='TABLE_CONFLICT';
 end if;
 if v_room is not null and exists (
  select 1 from public.reservations r
  where lower(btrim(r.hotel_room))=lower(v_room)
  and r.status in ('reserved','confirmed','late','arrived','seated')
  and r.starts_at<p_ends_at and r.ends_at>p_starts_at
 ) then
  raise exception 'Cette chambre possède déjà une réservation sur ce créneau' using errcode='23P01',detail='ROOM_CONFLICT';
 end if;
 insert into public.reservations(guest_name,hotel_room,party_size,starts_at,ends_at,notes,created_by)
 values(btrim(p_guest_name),v_room,p_party_size,p_starts_at,p_ends_at,p_notes,v_user)
 returning id into v_id;
 insert into public.reservation_tables(reservation_id,table_id)
 select v_id,x from unnest(p_table_ids) x;
 delete from public.table_holds
 where held_by=v_user and table_id=any(p_table_ids)
 and starts_at=p_starts_at and ends_at=p_ends_at;
 return v_id;
end $function$
;
alter function "private"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.confirm_reservation_v3(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or private.current_staff_role() not in ('reception','fb_admin') then raise exception 'Accès refusé' using errcode='42501';end if;
 if p_table_ids is null or cardinality(p_table_ids) not between 1 and 20 or array_position(p_table_ids,null) is not null then raise exception 'Tables invalides' using errcode='22023';end if;
 if not private.check_fusion_selection(p_table_ids) then raise exception 'Tables non fusionnables ou salles différentes' using errcode='22023';end if;
 return public.confirm_reservation_v2(p_guest_name,p_hotel_room,p_party_size,p_starts_at,p_ends_at,p_table_ids,p_owner_token,p_notes);
end $function$
;
alter function "private"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.current_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select p.role from public.staff_profiles p where p.user_id = (select auth.uid()) and p.active = true limit 1 $function$
;
alter function "private"."current_staff_role"() owner to "postgres";
CREATE OR REPLACE FUNCTION private.guard_closed_service_reservations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_day date;new_day date;rid uuid; d date;
begin
 if tg_op='INSERT' then
  rid:=new.restaurant_id;
  new_day:=(new.starts_at at time zone 'Europe/Paris')::date;
 elsif tg_op='DELETE' then
  rid:=old.restaurant_id;
  old_day:=(old.starts_at at time zone 'Europe/Paris')::date;
 else
  rid:=old.restaurant_id;
  old_day:=(old.starts_at at time zone 'Europe/Paris')::date;
  new_day:=(new.starts_at at time zone 'Europe/Paris')::date;
  if new.restaurant_id is distinct from old.restaurant_id then
   raise exception 'Changement d’établissement non autorisé.' using errcode='23514';
  end if;
 end if;
 for d in select distinct x from unnest(array[old_day,new_day]) x where x is not null order by x loop
  perform pg_advisory_xact_lock(hashtext(rid::text),hashtext(d::text));
  if exists(select 1 from public.service_closures c where c.restaurant_id=rid and c.service_date=d) then
   raise exception 'Service du % déjà clôturé. Modification impossible.',d using errcode='23514';
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end $function$
;
alter function "private"."guard_closed_service_reservations"() owner to "postgres";
CREATE OR REPLACE FUNCTION private.guard_fusion_removal_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ids uuid[];
begin
 for ids in select array_agg(a.table_id order by a.table_id) from public.reservation_tables a
  join public.reservations r on r.id=a.reservation_id where r.status in ('reserved','confirmed','late','arrived','seated')
  and r.id in (select reservation_id from public.reservation_tables where table_id in (old.table_a,old.table_b)) group by r.id loop
  if not private.check_fusion_selection(ids) then
   raise exception 'Une réservation utilise cette fusion. Modifiez son attribution avant de séparer les tables.' using errcode='23514',detail='FUSION_IN_USE';end if;
 end loop;
 return null;
end $function$
;
alter function "private"."guard_fusion_removal_v1"() owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.guard_room_configuration_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.restaurant_id is distinct from old.restaurant_id or new.id is distinct from old.id then
  raise exception 'Identité de salle non modifiable.' using errcode='23514',detail='INVALID_INPUT';end if;
 if old.active and not new.active and exists(select 1 from public.restaurant_tables t join public.reservation_tables rt on rt.table_id=t.id
  join public.reservations r on r.id=rt.reservation_id where t.room_id=old.id
   and r.status in ('reserved','confirmed','late','arrived','seated') and (r.ends_at>clock_timestamp() or r.status='seated')) then
  raise exception 'Des réservations utilisent cette salle.' using errcode='23514',detail='ROOM_IN_USE';end if;
 return new;
end $function$
;
alter function "private"."guard_room_configuration_v1"() owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.guard_table_configuration_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare number numeric;
begin
 number:=private.table_label_number_v1(new.label);
 if exists(select 1 from public.restaurant_tables t where t.id<>new.id and
  case when t.label ~ '^(Table )?[1-9][0-9]{0,15}$' then regexp_replace(t.label,'^Table ','')::numeric end=number) then
  raise exception 'Ce numéro de table existe déjà.' using errcode='23505',detail='DUPLICATE_TABLE_NUMBER';end if;
 if tg_op='INSERT' then return new;end if;
 if new.restaurant_id is distinct from old.restaurant_id or new.id is distinct from old.id then
  raise exception 'Identité de table non modifiable.' using errcode='23514',detail='INVALID_INPUT';end if;
 if not new.active and old.active and exists(select 1 from public.reservation_tables rt join public.reservations r on r.id=rt.reservation_id
  where rt.table_id=old.id and r.status in ('reserved','confirmed','late','arrived','seated')
   and (r.ends_at>clock_timestamp() or r.status='seated')) then
  raise exception 'Des réservations utilisent encore cette table.' using errcode='23514',detail='TABLE_IN_USE';end if;
 if new.seats<old.seats and exists(select 1 from public.reservation_tables rt join public.reservations r on r.id=rt.reservation_id
  where rt.table_id=old.id and r.status in ('reserved','confirmed','late','arrived','seated')
   and r.party_size>new.seats+coalesce((select sum(t.seats) from public.reservation_tables a join public.restaurant_tables t on t.id=a.table_id
    where a.reservation_id=r.id and a.table_id<>old.id and t.active),0)) then
  raise exception 'Capacité insuffisante pour une réservation.' using errcode='23514',detail='TABLE_IN_USE';end if;
 if new.room_id is distinct from old.room_id and exists(select 1 from public.reservation_tables rt join public.reservations r on r.id=rt.reservation_id
  where rt.table_id=old.id and r.status in ('reserved','confirmed','late','arrived','seated')
   and (select count(*) from public.reservation_tables a where a.reservation_id=r.id)>1) then
  raise exception 'Une réservation utilise cette fusion. Modifiez son attribution avant de déplacer la table.' using errcode='23514',detail='FUSION_IN_USE';end if;
 return new;
end $function$
;
alter function "private"."guard_table_configuration_v1"() owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.initialize_restaurant_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.restaurant_hours(restaurant_id,id,lunch_enabled,lunch_start,lunch_end,
    dinner_enabled,dinner_start,dinner_end,duration)
  values(new.id,1,false,'12:00','14:30',false,'19:00','21:30',90);
  return new;
end $function$
;
alter function "private"."initialize_restaurant_hours"() owner to "postgres";
CREATE OR REPLACE FUNCTION private.install_walkin_v3(p_table uuid, p_guests integer, p_name text, p_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 h public.restaurant_hours;
 stamp timestamptz:=statement_timestamp();
 local_time time:=date_trunc('minute',stamp at time zone 'Europe/Paris')::time;
 finish timestamptz;
 token uuid:=gen_random_uuid();
 booking uuid;
 room text;
begin
 perform private.lock_restaurant_mutation_v1();
 if auth.uid() is null or coalesce(private.current_staff_role()::text,'') not in ('reception','fb_admin') then raise exception 'Accès refusé' using errcode='42501',detail='FORBIDDEN'; end if;
 if p_type is null or p_type not in ('hotel','exterieur') then raise exception 'Type de client invalide'; end if;
 select * into strict h from public.restaurant_hours where id=1 for share;
 if not ((h.lunch_enabled and local_time between h.lunch_start and h.lunch_end)
      or (h.dinner_enabled and local_time between h.dinner_start and h.dinner_end)) then
   raise exception 'Service fermé à cette heure. Vérifiez les horaires dans Gestion.';
 end if;
 finish:=stamp+make_interval(mins=>h.duration);
 if p_type='hotel' and btrim(p_name) ~ '^[0-9]{1,6}[A-Za-z]?$' then room:=btrim(p_name); end if;
 perform public.acquire_table_hold_v2(p_table,stamp,finish,token);
 booking:=public.confirm_reservation_v3(p_name,room,p_guests,stamp,finish,array[p_table],token,null);
 perform public.change_reservation_status_v3(booking,'reserved','seated');
 update public.reservations set walkin_type=p_type where id=booking;
 return booking;
end $function$
;
alter function "private"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.invalidate_reservation_edit_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare old_id uuid;new_id uuid;old_restaurant uuid;new_restaurant uuid;item record;
begin
 if tg_op<>'INSERT' then old_id:=old.reservation_id;old_restaurant:=old.restaurant_id;end if;
 if tg_op<>'DELETE' then new_id:=new.reservation_id;new_restaurant:=new.restaurant_id;end if;
 for item in select distinct id,rid from (values(old_id,old_restaurant),(new_id,new_restaurant)) v(id,rid)
             where id is not null order by id,rid loop
  update public.reservations set edit_version=gen_random_uuid()
   where id=item.id and restaurant_id=item.rid;
 end loop;
 return null;
end $function$
;
alter function "private"."invalidate_reservation_edit_version"() owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.invalidate_table_editors_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_reservation_id uuid;
begin
 if new.label is not distinct from old.label and new.seats is not distinct from old.seats
  and new.room_id is not distinct from old.room_id and new.active is not distinct from old.active then return null;end if;
 for v_reservation_id in select r.id from public.reservations r join public.reservation_tables a on a.reservation_id=r.id
  where a.table_id=new.id and r.status in ('reserved','confirmed','late','arrived') order by r.id loop
  update public.reservations set edit_version=gen_random_uuid() where reservations.id=v_reservation_id;
 end loop;
 return null;
end $function$
;
alter function "private"."invalidate_table_editors_v1"() owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.lock_direct_service_mutation_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 -- Administrative maintenance (without a JWT) must use its own maintenance window.
 -- Normal staff DML is serialized BEFORE PostgreSQL takes target row locks.
 if auth.uid() is not null then perform private.lock_restaurant_mutation_v1();end if;
 return null;
end $function$
;
alter function "private"."lock_direct_service_mutation_v1"() owner to "postgres";
CREATE OR REPLACE FUNCTION private.lock_restaurant_mutation_v1()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rid uuid:=private.staff_restaurant();
begin
 if auth.uid() is null or rid is null or coalesce(private.current_staff_role(),'') not in ('fb_admin','reception') then
  raise exception 'Compte non autorisé.' using errcode='42501',detail='FORBIDDEN';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('restaurant-mutation-v1:'||rid::text,0));
 return rid;
end $function$
;
alter function "private"."lock_restaurant_mutation_v1"() owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.notify_fb_on_reception_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if exists (select 1 from public.staff_profiles where user_id=new.created_by and role='reception' and active=true) then
  insert into public.fb_reservation_alerts(reservation_id,guest_name,hotel_room,party_size,starts_at)
  values(new.id,new.guest_name,new.hotel_room,new.party_size,new.starts_at)
  on conflict(reservation_id) do nothing;
 end if;
 return new;
end $function$
;
alter function "private"."notify_fb_on_reception_booking"() owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.notify_fb_on_reception_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor record; changes text[]:=array[]::text[]; kind text;
begin
 select role,restaurant_id into actor
 from public.staff_profiles
 where user_id=(select auth.uid()) and active=true;
 if actor.role is distinct from 'reception'
    or actor.restaurant_id is distinct from new.restaurant_id then
  return new;
 end if;
 if old.status is distinct from 'cancelled' and new.status='cancelled' then
  kind:='cancelled';
 elsif new.status in ('reserved','confirmed','late','arrived')
   and (
    old.guest_name is distinct from new.guest_name
    or old.hotel_room is distinct from new.hotel_room
    or old.party_size is distinct from new.party_size
    or old.starts_at is distinct from new.starts_at
    or old.ends_at is distinct from new.ends_at
    or old.notes is distinct from new.notes
   ) then
  kind:='modified';
 else
  return new;
 end if;
 if old.guest_name is distinct from new.guest_name then changes:=array_append(changes,'client'); end if;
 if old.hotel_room is distinct from new.hotel_room then changes:=array_append(changes,'chambre'); end if;
 if old.party_size is distinct from new.party_size then changes:=array_append(changes,'couverts'); end if;
 if old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at then changes:=array_append(changes,'horaire'); end if;
 if old.notes is distinct from new.notes then changes:=array_append(changes,'consignes'); end if;
 insert into public.reservation_change_alerts (
  reservation_id,restaurant_id,event_type,guest_name,hotel_room,party_size,starts_at,
  previous_guest_name,previous_hotel_room,previous_party_size,previous_starts_at,changed_fields
 ) values (
  new.id,new.restaurant_id,kind,new.guest_name,new.hotel_room,new.party_size,new.starts_at,
  old.guest_name,old.hotel_room,old.party_size,old.starts_at,changes
 );
 return new;
end;
$function$
;
alter function "private"."notify_fb_on_reception_change"() owner to "postgres";
CREATE OR REPLACE FUNCTION private.ranked_booking_sets(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(ids uuid[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
   with available as (
    select t.id,t.seats,t.label from public.restaurant_tables t join public.restaurant_rooms m on m.id=t.room_id
    where t.active and m.active and not exists(
     select from public.reservation_tables a join public.reservations r on r.id=a.reservation_id
     where a.table_id=t.id and r.id is distinct from p_reservation and r.status in ('reserved','confirmed','late','arrived','seated')
     and r.starts_at<p_end and r.ends_at>p_start)
     and not exists(select from public.table_holds h where h.table_id=t.id and h.expires_at>clock_timestamp() and h.starts_at<p_end and h.ends_at>p_start)
   ), links as (
    select f.table_a a,f.table_b b from public.table_fusion_links f
    join available a on a.id=f.table_a join available b on b.id=f.table_b
   ), adjacent as (
    select a,b from links union all select b,a from links
   ), triples as (
    select distinct array(select x from unnest(array[l.b,l.a,r.b]) x order by x) ids
    from adjacent l join adjacent r on r.a=l.a and l.b<r.b
   ), choices as (
    select array[id] ids,seats,label from available
    union all select array[least(a.id,b.id),greatest(a.id,b.id)],a.seats+b.seats,a.label
      from public.table_fusion_links f join available a on a.id=f.table_a join available b on b.id=f.table_b
    union all select tr.ids,sum(t.seats)::integer,min(t.label)
     from triples tr join available t on t.id=any(tr.ids) group by tr.ids
    union all select previous,sum(seats)::integer,min(label) from available where id=any(previous)
      having count(*)=cardinality(previous)
   )
   select ids from choices c where seats>=p_guests
   order by
     -- Preserve assignment for unchanged passenger counts; prioritize fit on count change.
     case
       when coalesce(
         (select r.party_size is distinct from p_guests
            from public.reservations r where r.id=p_reservation), false
       ) then 0
       when ids=previous then 0
       else 1
     end,
     seats,cardinality(ids),
     array(select coalesce(substring(t.label from '[0-9]+')::numeric,9999999999)
           from available t where t.id=any(c.ids) order by 1),ids
$function$
;
alter function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) owner to "postgres";
CREATE OR REPLACE FUNCTION private.release_table_hold(p_hold_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_table uuid; v_count integer;
begin
 if auth.uid() is null or (select private.current_staff_role()) not in ('reception','fb_admin')
 then raise exception 'Accès non autorisé' using errcode='42501'; end if;
 select table_id into v_table from public.table_holds
 where id=p_hold_id and held_by=auth.uid();
 if v_table is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 delete from public.table_holds where id=p_hold_id and held_by=auth.uid();
 get diagnostics v_count = row_count;
 return v_count>0;
end $function$
;
alter function "private"."release_table_hold"(p_hold_id uuid) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.remove_fusions_on_table_room_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if old.room_id is distinct from new.room_id then
  delete from public.table_fusion_links where table_a=new.id or table_b=new.id;
 end if;
 return new;
end $function$
;
alter function "private"."remove_fusions_on_table_room_change"() owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.signal_restaurant_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.restaurant_service_changes(restaurant_id) values(coalesce(new.restaurant_id,old.restaurant_id))
  on conflict(restaurant_id) do update set revision=public.restaurant_service_changes.revision+1;
  return null;
end $function$
;
alter function "private"."signal_restaurant_change"() owner to "postgres";
CREATE OR REPLACE FUNCTION private.staff_restaurant()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select restaurant_id from public.staff_profiles where user_id = (select auth.uid()) and active
$function$
;
alter function "private"."staff_restaurant"() owner to "postgres";
CREATE OR REPLACE FUNCTION private.table_label_number_v1(p_label text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare value numeric;
begin
 -- Preserve numeric legacy labels, while matching the same positive safe integer
 -- understood by JavaScript. New configuration RPCs require the Table prefix.
 if p_label is null or p_label !~ '^(Table )?[1-9][0-9]{0,15}$' then
  raise exception 'Utilisez un numéro de table entier positif.' using errcode='22023',detail='INVALID_INPUT';end if;
 value:=regexp_replace(p_label,'^Table ','')::numeric;
 if value>9007199254740991 then
  raise exception 'Ce numéro de table est trop grand.' using errcode='22023',detail='INVALID_INPUT';end if;
 return value;
end $function$
;
alter function "private"."table_label_number_v1"(p_label text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.update_reservation_v3(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 raise exception 'Cette version de l’application ne protège pas les modifications. Actualisez la page.' using errcode='RM002';
end $function$
;
alter function "private"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.update_reservation_v4(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text;v_version uuid;v_old_room text;v_room text:=nullif(btrim(p_hotel_room),'');
 v_table uuid;v_lock_room text;v_count integer;v_seats integer;
begin
 perform private.lock_restaurant_mutation_v1();
 if auth.uid() is null or coalesce(private.current_staff_role(),'') not in ('reception','fb_admin') then
  raise exception 'Accès refusé' using errcode='42501',detail='FORBIDDEN';
 end if;
 if p_expected_version is null then
  raise exception 'Actualisez la fiche avant de la modifier.' using errcode='RM002',detail='MISSING_VERSION';
 end if;
 if p_guest_name is null or length(btrim(p_guest_name)) not between 1 and 160
    or p_party_size is null or p_party_size not between 1 and 50
    or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at
    or p_ends_at-p_starts_at>interval '6 hours' or (v_room is not null and length(v_room)>40)
    or p_table_ids is null or cardinality(p_table_ids) not between 1 and 20
    or array_position(p_table_ids,null) is not null
    or (select count(distinct x) from unnest(p_table_ids) x)<>cardinality(p_table_ids) then
  raise exception 'Données invalides' using errcode='22023',detail='INVALID_INPUT';
 end if;
 -- RLS applies to this non-owner, non-BYPASSRLS function owner.
 select status,hotel_room,edit_version into v_status,v_old_room,v_version
  from public.reservations where id=p_reservation_id for update;
 if not found then raise exception 'Réservation introuvable' using errcode='P0002';end if;
 if v_version is distinct from p_expected_version then
  raise exception 'Cette réservation a été modifiée. Votre saisie n’a pas été enregistrée.' using errcode='RM001',detail='STALE_VERSION';
 end if;
 if v_status not in ('reserved','confirmed','late','arrived') then
  raise exception 'Statut non modifiable' using errcode='22023',detail='INVALID_INPUT';
 end if;
 perform private.validate_booking_identity_v1(p_hotel_room,p_notes,v_old_room,true);
 -- Serialize all mutations before rows, then lock the complete table set.
 for v_table in select distinct x from (
   select table_id x from public.reservation_tables where reservation_id=p_reservation_id
   union select unnest(p_table_ids)) z order by x loop
  perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 end loop;
 if not private.check_fusion_selection(p_table_ids) then
  raise exception 'Tables non fusionnables' using errcode='22023',detail='INVALID_INPUT';
 end if;
 -- Same room lock namespace as creation. Lock both old/new identities in order.
 for v_lock_room in select distinct lower(btrim(x)) from unnest(array[v_old_room,v_room]) x
                    where nullif(btrim(x),'') is not null order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended('hotel-room:'||private.staff_restaurant()::text||':'||v_lock_room,0));
 end loop;
 select count(*),coalesce(sum(seats),0) into v_count,v_seats
  from public.restaurant_tables t where t.id=any(p_table_ids) and t.active
   and exists(select 1 from public.restaurant_rooms m where m.id=t.room_id and m.active);
 if v_count<>cardinality(p_table_ids) or v_seats<p_party_size then
  raise exception 'Capacité ou table invalide' using errcode='22023',detail='INVALID_INPUT';
 end if;
 if exists(select 1 from public.reservation_tables rt join public.reservations r on r.id=rt.reservation_id
   where rt.table_id=any(p_table_ids) and r.id<>p_reservation_id
   and r.status in ('reserved','confirmed','late','arrived','seated')
   and r.starts_at<p_ends_at and r.ends_at>p_starts_at)
 or exists(select 1 from public.table_holds h where h.table_id=any(p_table_ids)
   and (h.draft_role is not null or h.held_by<>auth.uid()) and h.expires_at>clock_timestamp()
   and h.starts_at<p_ends_at and h.ends_at>p_starts_at) then
  raise exception 'Table occupée sur ce créneau' using errcode='23P01',detail='TABLE_CONFLICT';
 end if;
 if v_room is not null and exists(select 1 from public.reservations r where r.id<>p_reservation_id
   and lower(btrim(r.hotel_room))=lower(v_room) and r.status in ('reserved','confirmed','late','arrived','seated')
   and r.starts_at<p_ends_at and r.ends_at>p_starts_at) then
  raise exception 'Chambre déjà réservée sur ce créneau' using errcode='23P01',detail='ROOM_CONFLICT';
 end if;
 update public.reservations set guest_name=btrim(p_guest_name),hotel_room=v_room,party_size=p_party_size,
  starts_at=p_starts_at,ends_at=p_ends_at,notes=p_notes,updated_at=clock_timestamp() where id=p_reservation_id;
 delete from public.reservation_tables where reservation_id=p_reservation_id;
 insert into public.reservation_tables(reservation_id,table_id) select p_reservation_id,x from unnest(p_table_ids) x;
 select edit_version into v_version from public.reservations where id=p_reservation_id;
 return v_version;
end $function$
;
alter function "private"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.validate_booking_identity_v1(p_room text, p_notes text, p_previous_room text DEFAULT NULL::text, p_edit boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare hotel boolean:=position('[RESTOMANAGER:HOTEL]' in coalesce(p_notes,''))>0;
 exterior boolean:=position('[RESTOMANAGER:EXTERIEUR]' in coalesce(p_notes,''))>0;
 room text:=nullif(btrim(p_room),'');
begin
 if (hotel and exterior) or (exterior and room is not null) then
  raise exception 'Le type de client et la chambre ne correspondent pas.' using errcode='22023',detail='INVALID_INPUT';end if;
 if hotel and room is null and not (p_edit and nullif(btrim(p_previous_room),'') is null) then
  raise exception 'Indiquez le numéro de chambre du client hôtel.' using errcode='22023',detail='ROOM_REQUIRED';end if;
end $function$
;
alter function "private"."validate_booking_identity_v1"(p_room text, p_notes text, p_previous_room text, p_edit boolean) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION private.validate_table_fusion_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a_room uuid;b_room uuid;
begin
 select room_id into a_room from public.restaurant_tables where id=new.table_a;
 select room_id into b_room from public.restaurant_tables where id=new.table_b;
 if a_room is null or b_room is null or a_room<>b_room then raise exception 'Tables de salles différentes' using errcode='23514';end if;
 return new;
end $function$
;
alter function "private"."validate_table_fusion_link"() owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.acquire_table_hold(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.acquire_table_hold(p_table_id,p_starts_at,p_ends_at) $function$
;
alter function "public"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) owner to "postgres";
CREATE OR REPLACE FUNCTION public.acquire_table_hold_v2(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin
 perform private.lock_restaurant_mutation_v1(); if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN'; end if; return private.acquire_table_hold_v2($1,$2,$3,$4); end$function$
;
alter function "public"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.apply_smart_placement_v3(p_target_reservation_id uuid, p_changes jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_restaurant uuid := private.staff_restaurant();
 v_entry record;
 v_res public.reservations%rowtype;
 v_current_table uuid;
 v_table uuid;
 v_seats integer;
 v_count integer := 0;
 v_time timestamptz := clock_timestamp();
begin
 perform private.lock_restaurant_mutation_v1();
 if (select auth.uid()) is null or private.current_staff_role() is distinct from 'fb_admin' or v_restaurant is null then
  raise exception 'Placement réservé à l’équipe du restaurant.' using errcode='42501',detail='FORBIDDEN';
 end if;
 if p_target_reservation_id is null or jsonb_typeof(p_changes) is distinct from 'array'
   or jsonb_array_length(p_changes) not between 1 and 8 then
  raise exception 'Réorganisation invalide.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 if (select count(distinct (e->>'id')) from jsonb_array_elements(p_changes) e) <> jsonb_array_length(p_changes)
   or (select count(*) from jsonb_array_elements(p_changes) e where e->>'id'=p_target_reservation_id::text) <> 1 then
  raise exception 'Réservations incohérentes.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 -- Serialize this operation with other smart placement actions in the same restaurant.
 perform pg_advisory_xact_lock(hashtextextended('smart-placement:'||v_restaurant::text,0));
 -- Existing creation and status RPCs also lock individual tables. Use the same lock key.
 -- Lock reservations first, matching the existing RPC lock order.
 perform 1 from public.reservations r
  where r.restaurant_id=v_restaurant and r.id in (select (e->>'id')::uuid from jsonb_array_elements(p_changes) e)
  order by r.id for update;
 for v_table in
  select distinct tbl from (
   select (e->>'from_table')::uuid tbl from jsonb_array_elements(p_changes) e
   union all
   select (e->>'to_table')::uuid tbl from jsonb_array_elements(p_changes) e
  ) q order by tbl
 loop
  if v_table is null then raise exception 'Table manquante.' using errcode='22023',detail='INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 end loop;
 for v_entry in
  select x.* from jsonb_to_recordset(p_changes)
   as x(id uuid,from_table uuid,to_table uuid,expected_status text) order by id
 loop
  v_count := v_count + 1;
  if v_entry.id is null or v_entry.from_table is null or v_entry.to_table is null
    or v_entry.expected_status is null or v_entry.from_table=v_entry.to_table then
   raise exception 'Modification de table invalide.' using errcode='22023',detail='INVALID_INPUT';
  end if;
  select * into v_res from public.reservations
    where id=v_entry.id and restaurant_id=v_restaurant;
  if not found then raise exception 'Réservation introuvable dans cet établissement.' using errcode='42501',detail='FORBIDDEN'; end if;
  if v_res.status is distinct from v_entry.expected_status or
     v_res.status not in ('reserved','confirmed','late','arrived') or
     (v_entry.id<>p_target_reservation_id and v_res.status='arrived') or
     v_res.walkin_type is not null then
   raise exception 'Une réservation a changé. Actualisez avant de confirmer.' using errcode='40001';
  end if;
  select count(*),(array_agg(table_id))[1] into v_seats,v_current_table
    from public.reservation_tables where reservation_id=v_entry.id and restaurant_id=v_restaurant;
  if v_seats<>1 or v_current_table is distinct from v_entry.from_table then
   raise exception 'L’attribution a changé ou contient une fusion. Actualisez.' using errcode='40001';
  end if;
  select t.seats into v_seats from public.restaurant_tables t
   where t.id=v_entry.to_table and t.restaurant_id=v_restaurant and t.active
    and exists(select 1 from public.restaurant_rooms m where m.id=t.room_id and m.restaurant_id=v_restaurant and m.active);
  if not found or v_seats<v_res.party_size then
   raise exception 'Table désactivée ou capacité insuffisante.' using errcode='22023',detail='INVALID_INPUT';
  end if;
  if exists(select 1 from public.table_holds h
   where h.table_id=v_entry.to_table and h.expires_at>v_time
     and h.starts_at<v_res.ends_at and h.ends_at>v_res.starts_at) then
   raise exception 'Une table est maintenue pendant une réservation en cours.' using errcode='23P01';
  end if;
  -- Compare the FINAL allocation: other moved reservations use their destination.
  if exists(
   select 1 from public.reservations other
    join public.reservation_tables other_rt on other_rt.reservation_id=other.id
    left join lateral (
      select (e->>'to_table')::uuid new_table from jsonb_array_elements(p_changes) e
      where e->>'id'=other.id::text
    ) moved on true
    where other.restaurant_id=v_restaurant and other.id<>v_res.id
      and other.status in ('reserved','confirmed','late','arrived','seated')
      and coalesce(moved.new_table,other_rt.table_id)=v_entry.to_table
      and (other.status='seated' or (other.starts_at<v_res.ends_at and other.ends_at>v_res.starts_at))
  ) then
   raise exception 'Conflit de table détecté. Aucune modification enregistrée.' using errcode='23P01';
  end if;
 end loop;
 if v_count<>jsonb_array_length(p_changes) then
  raise exception 'Réorganisation incomplète.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 -- All changes occur within the RPC transaction. Any failure rolls everything back.
 for v_entry in select x.* from jsonb_to_recordset(p_changes)
    as x(id uuid,from_table uuid,to_table uuid,expected_status text)
 loop
  update public.reservation_tables set table_id=v_entry.to_table
    where restaurant_id=v_restaurant and reservation_id=v_entry.id and table_id=v_entry.from_table;
  if not found then raise exception 'Attribution modifiée entre-temps.' using errcode='40001'; end if;
 end loop;
 update public.reservations set status='seated', seated_at=v_time, updated_at=v_time
   where id=p_target_reservation_id and restaurant_id=v_restaurant
     and status in ('reserved','confirmed','late','arrived');
 if not found then raise exception 'Installation impossible, statut modifié.' using errcode='40001'; end if;
 return v_count;
end
$function$
;
alter function "public"."apply_smart_placement_v3"(p_target_reservation_id uuid, p_changes jsonb) owner to "postgres";
CREATE OR REPLACE FUNCTION public.booking_draft_status_v1(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k uuid;d private.booking_drafts_v3;state text;
begin
 perform private.lock_restaurant_mutation_v1();
 begin k:=p_key::uuid;exception when invalid_text_representation then
  raise exception 'Référence de saisie invalide.' using errcode='22023',detail='INVALID_INPUT';end;
 if k is null then raise exception 'Référence de saisie invalide.' using errcode='22023',detail='INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('draft:'||k::text,0));
 select * into d from private.booking_drafts_v3 where key=k and staff=auth.uid()
  and restaurant_id=private.staff_restaurant();
 if not found then return jsonb_build_object('state','missing','reservation_id',null,'expires_at',null);end if;
 state:=case when d.booking is not null then 'committed'
  when d.expires>clock_timestamp() and (select count(*) from public.table_holds h
   where h.held_by=auth.uid() and h.owner_token=d.lock_token and h.table_id=any(d.ids)
    and h.starts_at=d.starts and h.ends_at=d.ends and h.expires_at>clock_timestamp())=cardinality(d.ids)
   then 'pending' else 'expired' end;
 return jsonb_build_object('state',state,'reservation_id',d.booking,'expires_at',d.expires);
end $function$
;
alter function "public"."booking_draft_status_v1"(p_key text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.booking_draft_v3(p_key uuid, p_action text, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_guests integer DEFAULT NULL::integer, p_tables uuid[] DEFAULT NULL::uuid[], p_name text DEFAULT NULL::text, p_room text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare staff_role text;d private.booking_drafts_v3;candidate record;t uuid;held uuid[];deadline timestamptz;
begin
 perform private.lock_restaurant_mutation_v1();
 staff_role:=private.current_staff_role();
 if p_key is null then raise exception 'Référence de saisie invalide.' using errcode='22023',detail='INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('draft:'||p_key::text,0));
 select * into d from private.booking_drafts_v3 where key=p_key;
 if found and d.staff<>auth.uid() then raise exception 'Compte non autorisé.' using errcode='42501',detail='FORBIDDEN';end if;
 if p_action='release' then
  -- Never remove committed operation keys: retries must not create a second booking.
  if d.booking is null then
   delete from public.table_holds where held_by=auth.uid() and owner_token=d.lock_token;
   delete from private.booking_drafts_v3 where key=p_key and staff=auth.uid();
   return jsonb_build_object('state','released','reservation_id',null);
  end if;
  -- A confirmation may have committed since the client's previous status read.
  return jsonb_build_object('state','committed','reservation_id',d.booking,'booking',d.booking,'tables',d.ids);
 elsif p_action='confirm' then
  if d.key is null then raise exception 'Maintien expiré. Revérifiez la disponibilité.' using errcode='23P01',detail='HOLD_EXPIRED';end if;
  if d.booking is null then
   if d.expires<=clock_timestamp() then raise exception 'Maintien expiré. Revérifiez la disponibilité.' using errcode='23P01',detail='HOLD_EXPIRED';end if;
   d.booking:=private.confirm_reservation_v3(p_name,p_room,d.guests,d.starts,d.ends,d.ids,d.lock_token,p_notes);
   update private.booking_drafts_v3 set booking=d.booking where key=p_key and staff=auth.uid();
  end if;
  return jsonb_build_object('booking',d.booking,'tables',d.ids);
 elsif p_action='extend' then
  if d.key is null or d.booking is not null or d.expires<=clock_timestamp() then
   raise exception 'Maintien expiré. Revérifiez la disponibilité.' using errcode='23P01',detail='HOLD_EXPIRED';end if;
  deadline:=clock_timestamp()+interval '3 minutes';
  update public.table_holds set expires_at=deadline where held_by=auth.uid() and owner_token=d.lock_token
   and table_id=any(d.ids) and starts_at=d.starts and ends_at=d.ends and expires_at>clock_timestamp();
  if (select count(*) from public.table_holds where held_by=auth.uid() and owner_token=d.lock_token
       and table_id=any(d.ids) and expires_at=deadline)<>cardinality(d.ids) then
   raise exception 'Maintien expiré. Revérifiez la disponibilité.' using errcode='23P01',detail='HOLD_EXPIRED';end if;
  update private.booking_drafts_v3 set expires=deadline where key=p_key;
 elsif p_action='hold' then
  if d.key is not null then
   if d.starts is distinct from p_start or d.ends is distinct from p_end or d.guests is distinct from p_guests
    or (p_tables is not null and not (d.ids @> p_tables and p_tables @> d.ids)) then
    raise exception 'Cette saisie correspond à une autre demande.' using errcode='22023',detail='INVALID_INPUT';end if;
   if d.booking is not null then return jsonb_build_object('booking',d.booking,'tables',d.ids);end if;
   if d.expires<=clock_timestamp() or (select count(*) from public.table_holds where held_by=auth.uid()
     and owner_token=d.lock_token and table_id=any(d.ids) and starts_at=d.starts and ends_at=d.ends
     and expires_at>clock_timestamp())<>cardinality(d.ids) then
    raise exception 'Maintien expiré. Revérifiez la disponibilité.' using errcode='23P01',detail='HOLD_EXPIRED';end if;
   deadline:=d.expires;
  else
   if p_guests is null or p_guests not between 1 and 50 or p_start is null or p_end is null or p_end<=p_start
    or p_start<now()-interval '5 minutes' or p_end-p_start>interval '6 hours'
    or (p_tables is not null and (cardinality(p_tables) not between 1 and 3 or array_position(p_tables,null) is not null
      or cardinality(p_tables)<>(select count(distinct x) from unnest(p_tables) x))) then
    raise exception 'Créneau ou couverts invalides.' using errcode='22023',detail='INVALID_INPUT';end if;
   if not exists(select 1 from public.restaurant_hours h where h.id=1 and
    ((h.lunch_enabled and (p_start at time zone 'Europe/Paris')::time between h.lunch_start and h.lunch_end)
    or (h.dinner_enabled and (p_start at time zone 'Europe/Paris')::time between h.dinner_start and h.dinner_end))) then
    raise exception 'Choisissez un créneau pendant un service ouvert.' using errcode='22023',detail='OUTSIDE_SERVICE';end if;
   if staff_role='reception' and p_tables is not null then
    raise exception 'La table est attribuée automatiquement.' using errcode='42501',detail='FORBIDDEN';end if;
   delete from private.booking_drafts_v3 where staff=auth.uid() and booking is null and expires<clock_timestamp()-interval '1 day';
   d.lock_token:=gen_random_uuid();
   for candidate in select * from private.ranked_booking_sets(null,null,p_guests,p_start,p_end) c
    where cardinality(c.ids)<=3 and (p_tables is null or (cardinality(c.ids)=cardinality(p_tables) and c.ids @> p_tables)) loop
    begin
     held:='{}';
     foreach t in array candidate.ids loop held:=array_append(held,private.acquire_table_hold_v2(t,p_start,p_end,d.lock_token));end loop;
     d.ids:=candidate.ids;exit;
    exception when exclusion_violation then null;
    end;
   end loop;
   if d.ids is null then
    if exists(select 1 from public.table_holds h where h.expires_at>clock_timestamp() and h.starts_at<p_end
      and h.ends_at>p_start and (p_tables is null or h.table_id=any(p_tables))) then
     raise exception 'Une table est temporairement maintenue. Revérifiez la disponibilité.' using errcode='23P01',detail='HOLD_CONFLICT';
    end if;
    raise exception 'Aucune table compatible disponible pour ce créneau.' using errcode='23P01',detail='NO_COMPATIBLE_TABLE';
   end if;
   update public.table_holds set draft_role=staff_role where id=any(held);
   select min(expires_at) into deadline from public.table_holds where id=any(held);
   insert into private.booking_drafts_v3(key,staff,lock_token,ids,guests,starts,ends,expires)
    values(p_key,auth.uid(),d.lock_token,d.ids,p_guests,p_start,p_end,deadline);
  end if;
 else raise exception 'Action inconnue.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 select array_agg(id order by id) into held from public.table_holds where held_by=auth.uid() and owner_token=d.lock_token;
 return jsonb_build_object('tables',d.ids,'holds',held,'seconds',greatest(0,extract(epoch from deadline-clock_timestamp())));
end $function$
;
alter function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.cancel_reservation_v3(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin
 perform private.lock_restaurant_mutation_v1(); if staff='reception' then perform 1 from public.reservations where id=p_reservation_id and status in ('reserved','confirmed','late','arrived') for update;
       if not found then raise exception 'Annulation impossible après installation.' using errcode='42501',detail='FORBIDDEN'; end if;
       elsif staff is distinct from 'fb_admin' then raise exception 'Accès refusé' using errcode='42501',detail='FORBIDDEN'; end if; return private.cancel_reservation_v3($1); end$function$
;
alter function "public"."cancel_reservation_v3"(p_reservation_id uuid) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.change_fusion_link_v3(p_old uuid[], p_new uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.lock_restaurant_mutation_v1();
 if private.current_staff_role() is distinct from 'fb_admin' then raise exception 'Action réservée au restaurant' using errcode='42501',detail='FORBIDDEN';end if;
 if p_old is not null then
  if cardinality(p_old)<>2 then raise exception 'Association invalide';end if;
  delete from public.table_fusion_links where table_a=least(p_old[1],p_old[2]) and table_b=greatest(p_old[1],p_old[2]);
  if not found then raise exception 'Cette association a déjà changé. Actualisez la liste.';end if;
 end if;
 if p_new is not null then
  if cardinality(p_new)<>2 or p_new[1]=p_new[2] or (select count(*) from public.restaurant_tables where id=any(p_new) and active)<>2 then raise exception 'Choisissez deux tables actives.';end if;
  insert into public.table_fusion_links(table_a,table_b) values(least(p_new[1],p_new[2]),greatest(p_new[1],p_new[2]));
 end if;
end $function$
;
alter function "public"."change_fusion_link_v3"(p_old uuid[], p_new uuid[]) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.change_reservation_status_v3(p_reservation_id uuid, p_expected text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin
 perform private.lock_restaurant_mutation_v1(); if staff is distinct from 'fb_admin' and not coalesce(staff='reception' and p_status in ('confirmed','late'),false) then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN'; end if; perform private.change_reservation_status_v3($1,$2,$3); end$function$
;
alter function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.close_service_v3(p_date date, p_mode text DEFAULT 'manual'::text)
 RETURNS service_closures
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rid uuid:=private.staff_restaurant(); result public.service_closures; now_paris timestamp; counts record;
begin
 perform private.lock_restaurant_mutation_v1();
 if (select private.current_staff_role()) is distinct from 'fb_admin' or rid is null then
  raise exception 'Clôture réservée au Restaurant.' using errcode='42501',detail='FORBIDDEN';
 end if;
 if p_date is null or p_mode not in ('manual','automatic') then
  raise exception 'Date ou mode de clôture invalide.';
 end if;
 now_paris:=now() at time zone 'Europe/Paris';
 if p_date>now_paris::date or (p_date=now_paris::date and now_paris::time<time '23:30') then
  raise exception 'La clôture est possible à partir de 23 h 30, heure de Paris.';
 end if;
 -- Serialize same-restaurant close requests without blocking other establishments.
 perform pg_advisory_xact_lock(hashtext(rid::text),hashtext(p_date::text));
 select * into result from public.service_closures where restaurant_id=rid and service_date=p_date;
 if found then return result; end if;
 -- Lock existing reservation rows while calculating the audit snapshot.
 perform 1 from public.reservations r
 where r.restaurant_id=rid and (r.starts_at at time zone 'Europe/Paris')::date=p_date
 for update;
 select
  count(*) filter(where status in ('reserved','confirmed','late','arrived','seated')) as pending,
  coalesce(sum(party_size) filter(where status in ('completed','released','departed')),0) as served,
  count(*) filter(where status in ('completed','released','departed')) as groups,
  coalesce(sum(party_size) filter(where status in ('completed','released','departed') and walkin_type is not null),0) as walkins,
  coalesce(sum(party_size) filter(where status in ('completed','released','departed') and hotel_room is not null),0) as hotel,
  count(*) filter(where status='no_show') as absent,
  count(*) filter(where status='cancelled') as cancelled
 into counts
 from public.reservations r
 where r.restaurant_id=rid and (r.starts_at at time zone 'Europe/Paris')::date=p_date;
 if counts.pending>0 then
  raise exception 'Clôture impossible : % réservation(s) non finalisée(s).',counts.pending;
 end if;
 insert into public.service_closures (restaurant_id,service_date,closed_by,close_mode,served_covers,served_groups,walkin_covers,hotel_covers,no_show_groups,cancelled_groups)
 values(rid,p_date,(select auth.uid()),p_mode,counts.served,counts.groups,counts.walkins,counts.hotel,counts.absent,counts.cancelled)
 returning * into result;
 return result;
end $function$
;
alter function "public"."close_service_v3"(p_date date, p_mode text) owner to "postgres";
CREATE OR REPLACE FUNCTION public.confirm_reservation(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.confirm_reservation(p_guest_name,p_hotel_room,p_party_size,p_starts_at,p_ends_at,p_table_ids,p_notes) $function$
;
alter function "public"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "postgres";
CREATE OR REPLACE FUNCTION public.confirm_reservation_v2(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_table uuid;
begin
 perform private.lock_restaurant_mutation_v1();
 if auth.uid() is null or private.current_staff_role() not in ('reception','fb_admin') then raise exception 'Accès refusé' using errcode='42501',detail='FORBIDDEN'; end if;
 if p_owner_token is null or p_table_ids is null or cardinality(p_table_ids) not between 1 and 3 or array_position(p_table_ids,null) is not null then raise exception 'Tables ou session invalides' using errcode='22023',detail='INVALID_INPUT'; end if;
 for v_table in select distinct x from unnest(p_table_ids) x order by x loop
  perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 end loop;
 if exists(select 1 from unnest(p_table_ids) x where not exists(
 select 1 from public.table_holds h where h.table_id=x and h.held_by=auth.uid() and h.owner_token=p_owner_token
 and h.starts_at=p_starts_at and h.ends_at=p_ends_at and h.expires_at>clock_timestamp()
 )) then raise exception 'Verrouillage absent, expiré ou appartenant à une autre session' using errcode='23P01'; end if;
 return private.confirm_reservation(p_guest_name,p_hotel_room,p_party_size,p_starts_at,p_ends_at,p_table_ids,p_notes);
end $function$
;
alter function "public"."confirm_reservation_v2"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.confirm_reservation_v3(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin
 perform private.lock_restaurant_mutation_v1(); if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN'; end if; return private.confirm_reservation_v3($1,$2,$3,$4,$5,$6,$7,$8); end$function$
;
alter function "public"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.create_restaurant_table_v3(p_label text, p_seats integer, p_room_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 perform private.lock_restaurant_mutation_v1();
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then raise exception 'Accès refusé' using errcode='42501',detail='FORBIDDEN';end if;
 if p_label is null or p_label !~ '^Table [1-9][0-9]*$' or p_seats not between 1 and 50 then raise exception 'Informations de table invalides' using errcode='22023',detail='INVALID_INPUT';end if;
 perform private.table_label_number_v1(p_label);
 if not exists(select 1 from public.restaurant_rooms where id=p_room_id and active) then raise exception 'Salle indisponible' using errcode='22023',detail='INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('restaurant-table-label:'||lower(p_label),0));
 if exists(select 1 from public.restaurant_tables where lower(label)=lower(p_label)) then raise exception 'Ce numéro de table existe déjà' using errcode='23505';end if;
 insert into public.restaurant_tables(room_id,label,seats,active) values(p_room_id,p_label,p_seats,true) returning id into v_id;
 return v_id;
end $function$
;
alter function "public"."create_restaurant_table_v3"(p_label text, p_seats integer, p_room_id uuid) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.delete_cancelled_reservation_v3(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text;
begin
 perform private.lock_restaurant_mutation_v1();
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then
  raise exception 'Suppression réservée aux administrateurs' using errcode='42501',detail='FORBIDDEN';
 end if;
 select status into v_status from public.reservations where id=p_reservation_id for update;
 if not found then raise exception 'Réservation introuvable' using errcode='P0002';end if;
 if v_status <> 'cancelled' then raise exception 'Annulez la réservation avant de la supprimer' using errcode='22023',detail='INVALID_INPUT';end if;
 delete from public.reservations where id=p_reservation_id;
 return true;
end $function$
;
alter function "public"."delete_cancelled_reservation_v3"(p_reservation_id uuid) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.install_walkin_group_v3(p_tables uuid[], p_guests integer, p_name text, p_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 h public.restaurant_hours;
 stamp timestamptz:=statement_timestamp();
 local_time time:=date_trunc('minute',stamp at time zone 'Europe/Paris')::time;
 finish timestamptz;
 token uuid:=gen_random_uuid();
 booking uuid;
 room text;
 t uuid;
begin
 perform private.lock_restaurant_mutation_v1();
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then raise exception 'Accès refusé' using errcode='42501',detail='FORBIDDEN'; end if;
 if p_type is null or p_type not in ('hotel','exterieur') then raise exception 'Type de client invalide'; end if;
 select * into strict h from public.restaurant_hours where id=1 for share;
 if not ((h.lunch_enabled and local_time between h.lunch_start and h.lunch_end)
      or (h.dinner_enabled and local_time between h.dinner_start and h.dinner_end)) then
   raise exception 'Service fermé à cette heure. Vérifiez les horaires dans Gestion.';
 end if;
 finish:=stamp+make_interval(mins=>h.duration);
 if p_type='hotel' and btrim(p_name) ~ '^[0-9]{1,6}[A-Za-z]?$' then room:=btrim(p_name); end if;
 if cardinality(p_tables) not between 1 and 3 or p_tables is null or array_position(p_tables,null) is not null then raise exception 'Sélection de tables invalide'; end if;
 for t in select distinct x from unnest(p_tables) x order by x loop
  perform public.acquire_table_hold_v2(t,stamp,finish,token);
 end loop;
 booking:=public.confirm_reservation_v3(p_name,room,p_guests,stamp,finish,p_tables,token,null);
 perform public.change_reservation_status_v3(booking,'reserved','seated');
 update public.reservations set walkin_type=p_type where id=booking;
 return booking;
end $function$
;
alter function "public"."install_walkin_group_v3"(p_tables uuid[], p_guests integer, p_name text, p_type text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.install_walkin_v3(p_table uuid, p_guests integer, p_name text, p_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin
 perform private.lock_restaurant_mutation_v1(); if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN'; end if; return private.install_walkin_v3($1,$2,$3,$4); end$function$
;
alter function "public"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.reception_booking_v3(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidate record; previous uuid[]; held_table uuid; token uuid:=gen_random_uuid();v_detail text;
begin
 perform private.lock_restaurant_mutation_v1();
 if private.current_staff_role() is distinct from 'reception' then raise exception 'Accès réservé à la réception.' using errcode='42501',detail='FORBIDDEN'; end if;
 if p_guests is null or p_guests not between 1 and 50 or p_start is null or p_end is null or p_end<=p_start then raise exception 'Créneau ou couverts invalides.'; end if;
 if p_reservation is not null then
   perform 1 from public.reservations where id=p_reservation and status in ('reserved','confirmed','late','arrived') for update;
   if not found then raise exception 'Cette réservation ne peut plus être modifiée.'; end if;
   select array_agg(table_id order by table_id) into previous from public.reservation_tables where reservation_id=p_reservation;
 end if;
 if not exists(select 1 from public.reservations where id=p_reservation and starts_at=p_start) then
   if p_start<now()-interval '5 minutes' or not exists(
    select 1 from public.restaurant_hours h where h.id=1 and
     ((h.lunch_enabled and (p_start at time zone 'Europe/Paris')::time between h.lunch_start and h.lunch_end)
     or (h.dinner_enabled and (p_start at time zone 'Europe/Paris')::time between h.dinner_start and h.dinner_end))
   ) then raise exception 'Choisissez un créneau à venir pendant un service ouvert.'; end if;
 end if;
 for candidate in
   select * from private.ranked_booking_sets(p_reservation,previous,p_guests,p_start,p_end)
 loop
   begin
    if p_reservation is null then
     foreach held_table in array candidate.ids loop perform private.acquire_table_hold_v2(held_table,p_start,p_end,token); end loop;
     perform private.confirm_reservation_v3(p_name,p_room,p_guests,p_start,p_end,candidate.ids,token,p_notes);
    else
     perform private.update_reservation_v3(p_reservation,p_name,p_guests,p_start,p_end,candidate.ids,p_notes);
    end if;
    return candidate.ids;
   exception when exclusion_violation then
    get stacked diagnostics v_detail=PG_EXCEPTION_DETAIL;
    if v_detail='ROOM_CONFLICT' then raise;end if;
   end;
 end loop;
 raise exception 'Aucune table disponible pour ce créneau et ce nombre de couverts.';
end $function$
;
alter function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.reception_update_reservation_v4(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidate record;previous uuid[];v_version uuid;v_start timestamptz;v_detail text;
begin
 perform private.lock_restaurant_mutation_v1();
 if auth.uid() is null or private.current_staff_role() is distinct from 'reception' then
  raise exception 'Accès réservé à la réception.' using errcode='42501',detail='FORBIDDEN';
 end if;
 select edit_version,starts_at into v_version,v_start from public.reservations where id=p_reservation_id for update;
 if not found then raise exception 'Réservation introuvable' using errcode='P0002';end if;
 if p_expected_version is null then raise exception 'Actualisez la fiche.' using errcode='RM002',detail='MISSING_VERSION';end if;
 if v_version is distinct from p_expected_version then
  raise exception 'Cette réservation a été modifiée. Votre saisie n’a pas été enregistrée.' using errcode='RM001',detail='STALE_VERSION';
 end if;
 if p_party_size is null or p_party_size not between 1 and 50 or p_starts_at is null
    or p_ends_at is null or p_ends_at<=p_starts_at or p_ends_at-p_starts_at>interval '6 hours' then
  raise exception 'Créneau ou couverts invalides.' using errcode='22023',detail='INVALID_INPUT';
 end if;
 if v_start is distinct from p_starts_at and (p_starts_at<now()-interval '5 minutes' or not exists(
  select 1 from public.restaurant_hours h where h.id=1 and
  ((h.lunch_enabled and (p_starts_at at time zone 'Europe/Paris')::time between h.lunch_start and h.lunch_end)
   or (h.dinner_enabled and (p_starts_at at time zone 'Europe/Paris')::time between h.dinner_start and h.dinner_end))
 )) then raise exception 'Choisissez un créneau à venir pendant un service ouvert.' using errcode='22023',detail='OUTSIDE_SERVICE';end if;
 select array_agg(table_id order by table_id) into previous from public.reservation_tables where reservation_id=p_reservation_id;
 for candidate in select * from private.ranked_booking_sets(p_reservation_id,previous,p_party_size,p_starts_at,p_ends_at) loop
  begin
   v_version:=private.update_reservation_v4(p_reservation_id,p_expected_version,p_guest_name,p_hotel_room,
    p_party_size,p_starts_at,p_ends_at,candidate.ids,p_notes);
   return jsonb_build_object('tables',candidate.ids,'edit_version',v_version);
  exception when exclusion_violation then
   get stacked diagnostics v_detail=PG_EXCEPTION_DETAIL;
   if v_detail='ROOM_CONFLICT' then raise;end if;
  end;
 end loop;
 raise exception 'Aucune table disponible pour ce créneau et ce nombre de couverts.' using errcode='23P01',detail='NO_COMPATIBLE_TABLE';
end $function$
;
alter function "public"."reception_update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.reception_update_reservation_with_table_v1(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_start timestamptz;v_version uuid;v_updated uuid;
BEGIN
 PERFORM private.lock_restaurant_mutation_v1();
 IF auth.uid() IS NULL OR private.current_staff_role() IS DISTINCT FROM 'reception' THEN
  RAISE EXCEPTION 'Action réservée à la Réception' USING ERRCODE='42501',DETAIL='FORBIDDEN';
 END IF;
 SELECT starts_at,edit_version INTO v_start,v_version
 FROM public.reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Réservation introuvable' USING ERRCODE='P0002';END IF;
 IF p_expected_version IS NULL THEN RAISE EXCEPTION 'Actualisez la fiche.' USING ERRCODE='RM002',DETAIL='MISSING_VERSION';END IF;
 IF v_version IS DISTINCT FROM p_expected_version THEN
  RAISE EXCEPTION 'Cette réservation a été modifiée.' USING ERRCODE='RM001',DETAIL='STALE_VERSION';
 END IF;
 IF p_party_size IS NULL OR p_party_size NOT BETWEEN 1 AND 50 OR p_starts_at IS NULL
  OR p_ends_at IS NULL OR p_ends_at<=p_starts_at
  OR p_ends_at-p_starts_at>interval '6 hours' THEN
  RAISE EXCEPTION 'Créneau ou couverts invalides.' USING ERRCODE='22023',DETAIL='INVALID_INPUT';
 END IF;
 IF v_start IS DISTINCT FROM p_starts_at AND (
  p_starts_at<now()-interval '5 minutes' OR NOT EXISTS(
  SELECT 1 FROM public.restaurant_hours h WHERE h.id=1 AND
   ((h.lunch_enabled AND (p_starts_at AT TIME ZONE 'Europe/Paris')::time BETWEEN h.lunch_start AND h.lunch_end)
    OR (h.dinner_enabled AND (p_starts_at AT TIME ZONE 'Europe/Paris')::time BETWEEN h.dinner_start AND h.dinner_end))
  )) THEN
  RAISE EXCEPTION 'Choisissez un créneau à venir pendant un service ouvert.'
   USING ERRCODE='22023',DETAIL='OUTSIDE_SERVICE';
 END IF;
 v_updated:=private.update_reservation_v4(
  p_reservation_id,p_expected_version,p_guest_name,p_hotel_room,
  p_party_size,p_starts_at,p_ends_at,p_table_ids,p_notes
 );
 RETURN jsonb_build_object('tables',p_table_ids,'edit_version',v_updated);
END $function$
;
alter function "public"."reception_update_reservation_with_table_v1"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.release_table_hold(p_hold_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.release_table_hold(p_hold_id) $function$
;
alter function "public"."release_table_hold"(p_hold_id uuid) owner to "postgres";
CREATE OR REPLACE FUNCTION public.release_table_hold_v2(p_hold_id uuid, p_owner_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_table uuid;
begin
 perform private.lock_restaurant_mutation_v1();
 if auth.uid() is null or private.current_staff_role() not in ('reception','fb_admin') or p_owner_token is null then raise exception 'Accès refusé' using errcode='42501',detail='FORBIDDEN'; end if;
 select table_id into v_table from public.table_holds where id=p_hold_id and held_by=auth.uid() and owner_token=p_owner_token;
 if v_table is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 if not exists(select 1 from public.table_holds where id=p_hold_id and held_by=auth.uid() and owner_token=p_owner_token) then return false; end if;
 return private.release_table_hold(p_hold_id);
end $function$
;
alter function "public"."release_table_hold_v2"(p_hold_id uuid, p_owner_token uuid) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;
alter function "public"."rls_auto_enable"() owner to "postgres";
CREATE OR REPLACE FUNCTION public.service_sync_state_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rid uuid:=private.staff_restaurant();rev text;
begin
 if auth.uid() is null or rid is null or coalesce(private.current_staff_role(),'') not in ('fb_admin','reception') then
  raise exception 'Compte non autorisé.' using errcode='42501',detail='FORBIDDEN';end if;
 select revision::text into rev from public.restaurant_service_changes where restaurant_id=rid;
 return jsonb_build_object('revision',coalesce(rev,'0'),'server_time',clock_timestamp(),
  'capabilities',jsonb_build_object('reservation_edits',4,'booking_recovery',1,'snapshot',1));
end $function$
;
alter function "public"."service_sync_state_v1"() owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.set_restaurant_table_active_v3(p_table_id uuid, p_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.lock_restaurant_mutation_v1();
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then raise exception 'Accès refusé' using errcode='42501',detail='FORBIDDEN';end if;
 if p_active is null then raise exception 'Statut invalide' using errcode='22023',detail='INVALID_INPUT';end if;
 perform 1 from public.restaurant_tables where id=p_table_id for update;
 if not found then raise exception 'Table introuvable' using errcode='P0002';end if;
 if not p_active and exists(select 1 from public.reservation_tables rt join public.reservations r on r.id=rt.reservation_id where rt.table_id=p_table_id and r.status in ('reserved','confirmed','late','arrived','seated') and r.ends_at>now()) then raise exception 'Des réservations à venir utilisent cette table' using errcode='22023',detail='INVALID_INPUT';end if;
 update public.restaurant_tables set active=p_active where id=p_table_id;
 return true;
end $function$
;
alter function "public"."set_restaurant_table_active_v3"(p_table_id uuid, p_active boolean) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.update_reservation_v3(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501'; end if; return private.update_reservation_v3($1,$2,$3,$4,$5,$6,$7); end$function$
;
alter function "public"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.update_reservation_v4(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.lock_restaurant_mutation_v1();
 if private.current_staff_role() is distinct from 'fb_admin' then
  raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN';
 end if;
 return private.update_reservation_v4($1,$2,$3,$4,$5,$6,$7,$8,$9);
end $function$
;
alter function "public"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";
CREATE OR REPLACE FUNCTION public.update_restaurant_table_v3(p_table_id uuid, p_label text, p_seats integer, p_room_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_old_label text;v_old_seats integer;
begin
 perform private.lock_restaurant_mutation_v1();
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then raise exception 'Réservé aux administrateurs' using errcode='42501',detail='FORBIDDEN';end if;
 if p_label is null or p_label !~ '^Table [1-9][0-9]*$' or p_seats not between 1 and 50 or p_room_id is null then raise exception 'Paramètres invalides' using errcode='22023',detail='INVALID_INPUT';end if;
 perform private.table_label_number_v1(p_label);
 select label,seats into v_old_label,v_old_seats from public.restaurant_tables where id=p_table_id for update;
 if not found then raise exception 'Table introuvable' using errcode='P0002';end if;
 if not exists(select 1 from public.restaurant_rooms where id=p_room_id and active) then raise exception 'Salle introuvable ou inactive' using errcode='22023',detail='INVALID_INPUT';end if;
 update public.restaurant_tables set label=btrim(p_label),seats=p_seats,room_id=p_room_id where id=p_table_id;
 return true;
end $function$
;
alter function "public"."update_restaurant_table_v3"(p_table_id uuid, p_label text, p_seats integer, p_room_id uuid) owner to "resto_service_writer";
revoke all on function "private"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) to "resto_service_writer";
revoke all on function "private"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) to "resto_service_writer";
revoke all on function "private"."bump_reservation_edit_version"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."bump_reservation_edit_version"() to "postgres";
revoke all on function "private"."cancel_reservation_v3"(p_reservation_id uuid) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."cancel_reservation_v3"(p_reservation_id uuid) to "resto_service_writer";
revoke all on function "private"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) to "resto_service_writer";
revoke all on function "private"."check_fusion_selection"(p_ids uuid[]) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."check_fusion_selection"(p_ids uuid[]) to "resto_service_writer";
grant EXECUTE on function "private"."check_fusion_selection"(p_ids uuid[]) to public;
revoke all on function "private"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
revoke all on function "private"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) to "resto_service_writer";
revoke all on function "private"."current_staff_role"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."current_staff_role"() to "postgres";
grant EXECUTE on function "private"."current_staff_role"() to "authenticated";
grant EXECUTE on function "private"."current_staff_role"() to "resto_service_writer";
revoke all on function "private"."guard_closed_service_reservations"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."guard_closed_service_reservations"() to "postgres";
revoke all on function "private"."guard_fusion_removal_v1"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."guard_fusion_removal_v1"() to "resto_service_writer";
revoke all on function "private"."guard_room_configuration_v1"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."guard_room_configuration_v1"() to "resto_service_writer";
revoke all on function "private"."guard_table_configuration_v1"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."guard_table_configuration_v1"() to "resto_service_writer";
revoke all on function "private"."initialize_restaurant_hours"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."initialize_restaurant_hours"() to "postgres";
revoke all on function "private"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) to "resto_service_writer";
revoke all on function "private"."invalidate_reservation_edit_version"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."invalidate_reservation_edit_version"() to "resto_service_writer";
revoke all on function "private"."invalidate_table_editors_v1"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."invalidate_table_editors_v1"() to "resto_service_writer";
revoke all on function "private"."lock_direct_service_mutation_v1"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."lock_direct_service_mutation_v1"() to "postgres";
revoke all on function "private"."lock_restaurant_mutation_v1"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."lock_restaurant_mutation_v1"() to "resto_service_writer";
grant EXECUTE on function "private"."lock_restaurant_mutation_v1"() to "authenticated";
revoke all on function "private"."notify_fb_on_reception_booking"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."notify_fb_on_reception_booking"() to "resto_service_writer";
grant EXECUTE on function "private"."notify_fb_on_reception_booking"() to public;
revoke all on function "private"."notify_fb_on_reception_change"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."notify_fb_on_reception_change"() to "postgres";
revoke all on function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) to "postgres";
grant EXECUTE on function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) to "resto_service_writer";
revoke all on function "private"."release_table_hold"(p_hold_id uuid) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."release_table_hold"(p_hold_id uuid) to "resto_service_writer";
revoke all on function "private"."remove_fusions_on_table_room_change"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."remove_fusions_on_table_room_change"() to "resto_service_writer";
grant EXECUTE on function "private"."remove_fusions_on_table_room_change"() to public;
revoke all on function "private"."signal_restaurant_change"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."signal_restaurant_change"() to "postgres";
revoke all on function "private"."staff_restaurant"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."staff_restaurant"() to "postgres";
grant EXECUTE on function "private"."staff_restaurant"() to "authenticated";
grant EXECUTE on function "private"."staff_restaurant"() to "resto_service_writer";
revoke all on function "private"."table_label_number_v1"(p_label text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."table_label_number_v1"(p_label text) to "resto_service_writer";
revoke all on function "private"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
revoke all on function "private"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
revoke all on function "private"."validate_booking_identity_v1"(p_room text, p_notes text, p_previous_room text, p_edit boolean) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."validate_booking_identity_v1"(p_room text, p_notes text, p_previous_room text, p_edit boolean) to "resto_service_writer";
revoke all on function "private"."validate_table_fusion_link"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "private"."validate_table_fusion_link"() to "resto_service_writer";
grant EXECUTE on function "private"."validate_table_fusion_link"() to public;
revoke all on function "public"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) to "postgres";
grant EXECUTE on function "public"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) to "resto_service_writer";
revoke all on function "public"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) to "resto_service_writer";
grant EXECUTE on function "public"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) to "authenticated";
revoke all on function "public"."apply_smart_placement_v3"(p_target_reservation_id uuid, p_changes jsonb) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."apply_smart_placement_v3"(p_target_reservation_id uuid, p_changes jsonb) to "postgres";
grant EXECUTE on function "public"."apply_smart_placement_v3"(p_target_reservation_id uuid, p_changes jsonb) to "authenticated";
revoke all on function "public"."booking_draft_status_v1"(p_key text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."booking_draft_status_v1"(p_key text) to "resto_service_writer";
grant EXECUTE on function "public"."booking_draft_status_v1"(p_key text) to "authenticated";
revoke all on function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) to "resto_service_writer";
grant EXECUTE on function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) to "authenticated";
revoke all on function "public"."cancel_reservation_v3"(p_reservation_id uuid) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."cancel_reservation_v3"(p_reservation_id uuid) to "resto_service_writer";
grant EXECUTE on function "public"."cancel_reservation_v3"(p_reservation_id uuid) to "authenticated";
revoke all on function "public"."change_fusion_link_v3"(p_old uuid[], p_new uuid[]) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."change_fusion_link_v3"(p_old uuid[], p_new uuid[]) to "resto_service_writer";
grant EXECUTE on function "public"."change_fusion_link_v3"(p_old uuid[], p_new uuid[]) to "authenticated";
revoke all on function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) to "resto_service_writer";
grant EXECUTE on function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) to "authenticated";
revoke all on function "public"."close_service_v3"(p_date date, p_mode text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."close_service_v3"(p_date date, p_mode text) to "postgres";
grant EXECUTE on function "public"."close_service_v3"(p_date date, p_mode text) to "authenticated";
revoke all on function "public"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "postgres";
grant EXECUTE on function "public"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
revoke all on function "public"."confirm_reservation_v2"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."confirm_reservation_v2"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) to "resto_service_writer";
revoke all on function "public"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) to "resto_service_writer";
grant EXECUTE on function "public"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) to "authenticated";
revoke all on function "public"."create_restaurant_table_v3"(p_label text, p_seats integer, p_room_id uuid) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."create_restaurant_table_v3"(p_label text, p_seats integer, p_room_id uuid) to "resto_service_writer";
grant EXECUTE on function "public"."create_restaurant_table_v3"(p_label text, p_seats integer, p_room_id uuid) to "authenticated";
revoke all on function "public"."delete_cancelled_reservation_v3"(p_reservation_id uuid) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."delete_cancelled_reservation_v3"(p_reservation_id uuid) to "resto_service_writer";
grant EXECUTE on function "public"."delete_cancelled_reservation_v3"(p_reservation_id uuid) to "authenticated";
revoke all on function "public"."install_walkin_group_v3"(p_tables uuid[], p_guests integer, p_name text, p_type text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."install_walkin_group_v3"(p_tables uuid[], p_guests integer, p_name text, p_type text) to "resto_service_writer";
grant EXECUTE on function "public"."install_walkin_group_v3"(p_tables uuid[], p_guests integer, p_name text, p_type text) to "authenticated";
revoke all on function "public"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) to "resto_service_writer";
grant EXECUTE on function "public"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) to "authenticated";
revoke all on function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) to "resto_service_writer";
grant EXECUTE on function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) to "authenticated";
revoke all on function "public"."reception_update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."reception_update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text) to "resto_service_writer";
grant EXECUTE on function "public"."reception_update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text) to "authenticated";
revoke all on function "public"."reception_update_reservation_with_table_v1"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."reception_update_reservation_with_table_v1"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
revoke all on function "public"."release_table_hold"(p_hold_id uuid) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."release_table_hold"(p_hold_id uuid) to "postgres";
grant EXECUTE on function "public"."release_table_hold"(p_hold_id uuid) to "resto_service_writer";
revoke all on function "public"."release_table_hold_v2"(p_hold_id uuid, p_owner_token uuid) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."release_table_hold_v2"(p_hold_id uuid, p_owner_token uuid) to "resto_service_writer";
grant EXECUTE on function "public"."release_table_hold_v2"(p_hold_id uuid, p_owner_token uuid) to "authenticated";
revoke all on function "public"."rls_auto_enable"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."rls_auto_enable"() to "postgres";
revoke all on function "public"."service_sync_state_v1"() from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."service_sync_state_v1"() to "resto_service_writer";
grant EXECUTE on function "public"."service_sync_state_v1"() to "authenticated";
revoke all on function "public"."set_restaurant_table_active_v3"(p_table_id uuid, p_active boolean) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."set_restaurant_table_active_v3"(p_table_id uuid, p_active boolean) to "resto_service_writer";
grant EXECUTE on function "public"."set_restaurant_table_active_v3"(p_table_id uuid, p_active boolean) to "authenticated";
revoke all on function "public"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
grant EXECUTE on function "public"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "authenticated";
revoke all on function "public"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
grant EXECUTE on function "public"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "authenticated";
revoke all on function "public"."update_restaurant_table_v3"(p_table_id uuid, p_label text, p_seats integer, p_room_id uuid) from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant EXECUTE on function "public"."update_restaurant_table_v3"(p_table_id uuid, p_label text, p_seats integer, p_room_id uuid) to "resto_service_writer";
grant EXECUTE on function "public"."update_restaurant_table_v3"(p_table_id uuid, p_label text, p_seats integer, p_room_id uuid) to "authenticated";
alter table "private"."booking_drafts_v3" owner to "postgres";
alter table "private"."booking_drafts_v3" enable row level security;
revoke all on table "private"."booking_drafts_v3" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "private"."booking_drafts_v3" to "postgres";
grant SELECT on table "private"."booking_drafts_v3" to "postgres";
grant UPDATE on table "private"."booking_drafts_v3" to "postgres";
grant DELETE on table "private"."booking_drafts_v3" to "postgres";
grant TRUNCATE on table "private"."booking_drafts_v3" to "postgres";
grant REFERENCES on table "private"."booking_drafts_v3" to "postgres";
grant TRIGGER on table "private"."booking_drafts_v3" to "postgres";
grant MAINTAIN on table "private"."booking_drafts_v3" to "postgres";
grant INSERT on table "private"."booking_drafts_v3" to "resto_service_writer";
grant SELECT on table "private"."booking_drafts_v3" to "resto_service_writer";
grant UPDATE on table "private"."booking_drafts_v3" to "resto_service_writer";
grant DELETE on table "private"."booking_drafts_v3" to "resto_service_writer";
alter table "public"."fb_reservation_alerts" owner to "postgres";
alter table "public"."fb_reservation_alerts" enable row level security;
revoke all on table "public"."fb_reservation_alerts" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."fb_reservation_alerts" to "postgres";
grant SELECT on table "public"."fb_reservation_alerts" to "postgres";
grant UPDATE on table "public"."fb_reservation_alerts" to "postgres";
grant DELETE on table "public"."fb_reservation_alerts" to "postgres";
grant TRUNCATE on table "public"."fb_reservation_alerts" to "postgres";
grant REFERENCES on table "public"."fb_reservation_alerts" to "postgres";
grant TRIGGER on table "public"."fb_reservation_alerts" to "postgres";
grant MAINTAIN on table "public"."fb_reservation_alerts" to "postgres";
grant MAINTAIN on table "public"."fb_reservation_alerts" to "anon";
grant SELECT on table "public"."fb_reservation_alerts" to "authenticated";
grant MAINTAIN on table "public"."fb_reservation_alerts" to "authenticated";
grant INSERT on table "public"."fb_reservation_alerts" to "resto_service_writer";
grant SELECT on table "public"."fb_reservation_alerts" to "resto_service_writer";
grant UPDATE on table "public"."fb_reservation_alerts" to "resto_service_writer";
grant DELETE on table "public"."fb_reservation_alerts" to "resto_service_writer";
grant TRUNCATE on table "public"."fb_reservation_alerts" to "service_role";
grant REFERENCES on table "public"."fb_reservation_alerts" to "service_role";
grant TRIGGER on table "public"."fb_reservation_alerts" to "service_role";
grant MAINTAIN on table "public"."fb_reservation_alerts" to "service_role";
alter table "public"."platform_admins" owner to "postgres";
alter table "public"."platform_admins" enable row level security;
revoke all on table "public"."platform_admins" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."platform_admins" to "postgres";
grant SELECT on table "public"."platform_admins" to "postgres";
grant UPDATE on table "public"."platform_admins" to "postgres";
grant DELETE on table "public"."platform_admins" to "postgres";
grant TRUNCATE on table "public"."platform_admins" to "postgres";
grant REFERENCES on table "public"."platform_admins" to "postgres";
grant TRIGGER on table "public"."platform_admins" to "postgres";
grant MAINTAIN on table "public"."platform_admins" to "postgres";
grant SELECT on table "public"."platform_admins" to "authenticated";
grant TRUNCATE on table "public"."platform_admins" to "service_role";
grant REFERENCES on table "public"."platform_admins" to "service_role";
grant TRIGGER on table "public"."platform_admins" to "service_role";
grant MAINTAIN on table "public"."platform_admins" to "service_role";
alter table "public"."platform_reports" owner to "postgres";
alter table "public"."platform_reports" enable row level security;
revoke all on table "public"."platform_reports" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."platform_reports" to "postgres";
grant SELECT on table "public"."platform_reports" to "postgres";
grant UPDATE on table "public"."platform_reports" to "postgres";
grant DELETE on table "public"."platform_reports" to "postgres";
grant TRUNCATE on table "public"."platform_reports" to "postgres";
grant REFERENCES on table "public"."platform_reports" to "postgres";
grant TRIGGER on table "public"."platform_reports" to "postgres";
grant MAINTAIN on table "public"."platform_reports" to "postgres";
grant SELECT on table "public"."platform_reports" to "authenticated";
grant TRUNCATE on table "public"."platform_reports" to "service_role";
grant REFERENCES on table "public"."platform_reports" to "service_role";
grant TRIGGER on table "public"."platform_reports" to "service_role";
grant MAINTAIN on table "public"."platform_reports" to "service_role";
alter table "public"."reservation_change_alerts" owner to "postgres";
alter table "public"."reservation_change_alerts" enable row level security;
revoke all on table "public"."reservation_change_alerts" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."reservation_change_alerts" to "postgres";
grant SELECT on table "public"."reservation_change_alerts" to "postgres";
grant UPDATE on table "public"."reservation_change_alerts" to "postgres";
grant DELETE on table "public"."reservation_change_alerts" to "postgres";
grant TRUNCATE on table "public"."reservation_change_alerts" to "postgres";
grant REFERENCES on table "public"."reservation_change_alerts" to "postgres";
grant TRIGGER on table "public"."reservation_change_alerts" to "postgres";
grant MAINTAIN on table "public"."reservation_change_alerts" to "postgres";
grant SELECT on table "public"."reservation_change_alerts" to "authenticated";
grant TRUNCATE on table "public"."reservation_change_alerts" to "service_role";
grant REFERENCES on table "public"."reservation_change_alerts" to "service_role";
grant TRIGGER on table "public"."reservation_change_alerts" to "service_role";
grant MAINTAIN on table "public"."reservation_change_alerts" to "service_role";
alter table "public"."reservation_tables" owner to "postgres";
alter table "public"."reservation_tables" enable row level security;
revoke all on table "public"."reservation_tables" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."reservation_tables" to "postgres";
grant SELECT on table "public"."reservation_tables" to "postgres";
grant UPDATE on table "public"."reservation_tables" to "postgres";
grant DELETE on table "public"."reservation_tables" to "postgres";
grant TRUNCATE on table "public"."reservation_tables" to "postgres";
grant REFERENCES on table "public"."reservation_tables" to "postgres";
grant TRIGGER on table "public"."reservation_tables" to "postgres";
grant MAINTAIN on table "public"."reservation_tables" to "postgres";
grant SELECT on table "public"."reservation_tables" to "authenticated";
grant INSERT on table "public"."reservation_tables" to "resto_service_writer";
grant SELECT on table "public"."reservation_tables" to "resto_service_writer";
grant UPDATE on table "public"."reservation_tables" to "resto_service_writer";
grant DELETE on table "public"."reservation_tables" to "resto_service_writer";
grant TRUNCATE on table "public"."reservation_tables" to "service_role";
grant REFERENCES on table "public"."reservation_tables" to "service_role";
grant TRIGGER on table "public"."reservation_tables" to "service_role";
grant MAINTAIN on table "public"."reservation_tables" to "service_role";
alter table "public"."reservations" owner to "postgres";
alter table "public"."reservations" enable row level security;
revoke all on table "public"."reservations" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."reservations" to "postgres";
grant SELECT on table "public"."reservations" to "postgres";
grant UPDATE on table "public"."reservations" to "postgres";
grant DELETE on table "public"."reservations" to "postgres";
grant TRUNCATE on table "public"."reservations" to "postgres";
grant REFERENCES on table "public"."reservations" to "postgres";
grant TRIGGER on table "public"."reservations" to "postgres";
grant MAINTAIN on table "public"."reservations" to "postgres";
grant SELECT on table "public"."reservations" to "authenticated";
grant INSERT on table "public"."reservations" to "resto_service_writer";
grant SELECT on table "public"."reservations" to "resto_service_writer";
grant UPDATE on table "public"."reservations" to "resto_service_writer";
grant DELETE on table "public"."reservations" to "resto_service_writer";
grant TRUNCATE on table "public"."reservations" to "service_role";
grant REFERENCES on table "public"."reservations" to "service_role";
grant TRIGGER on table "public"."reservations" to "service_role";
grant MAINTAIN on table "public"."reservations" to "service_role";
alter table "public"."restaurant_hours" owner to "postgres";
alter table "public"."restaurant_hours" enable row level security;
revoke all on table "public"."restaurant_hours" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."restaurant_hours" to "postgres";
grant SELECT on table "public"."restaurant_hours" to "postgres";
grant UPDATE on table "public"."restaurant_hours" to "postgres";
grant DELETE on table "public"."restaurant_hours" to "postgres";
grant TRUNCATE on table "public"."restaurant_hours" to "postgres";
grant REFERENCES on table "public"."restaurant_hours" to "postgres";
grant TRIGGER on table "public"."restaurant_hours" to "postgres";
grant MAINTAIN on table "public"."restaurant_hours" to "postgres";
grant SELECT on table "public"."restaurant_hours" to "authenticated";
grant UPDATE on table "public"."restaurant_hours" to "authenticated";
grant INSERT on table "public"."restaurant_hours" to "resto_service_writer";
grant SELECT on table "public"."restaurant_hours" to "resto_service_writer";
grant UPDATE on table "public"."restaurant_hours" to "resto_service_writer";
grant DELETE on table "public"."restaurant_hours" to "resto_service_writer";
grant TRUNCATE on table "public"."restaurant_hours" to "service_role";
grant REFERENCES on table "public"."restaurant_hours" to "service_role";
grant TRIGGER on table "public"."restaurant_hours" to "service_role";
grant MAINTAIN on table "public"."restaurant_hours" to "service_role";
alter table "public"."restaurant_rooms" owner to "postgres";
alter table "public"."restaurant_rooms" enable row level security;
revoke all on table "public"."restaurant_rooms" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."restaurant_rooms" to "postgres";
grant SELECT on table "public"."restaurant_rooms" to "postgres";
grant UPDATE on table "public"."restaurant_rooms" to "postgres";
grant DELETE on table "public"."restaurant_rooms" to "postgres";
grant TRUNCATE on table "public"."restaurant_rooms" to "postgres";
grant REFERENCES on table "public"."restaurant_rooms" to "postgres";
grant TRIGGER on table "public"."restaurant_rooms" to "postgres";
grant MAINTAIN on table "public"."restaurant_rooms" to "postgres";
grant INSERT on table "public"."restaurant_rooms" to "authenticated";
grant SELECT on table "public"."restaurant_rooms" to "authenticated";
grant UPDATE on table "public"."restaurant_rooms" to "authenticated";
grant INSERT on table "public"."restaurant_rooms" to "resto_service_writer";
grant SELECT on table "public"."restaurant_rooms" to "resto_service_writer";
grant UPDATE on table "public"."restaurant_rooms" to "resto_service_writer";
grant DELETE on table "public"."restaurant_rooms" to "resto_service_writer";
grant TRUNCATE on table "public"."restaurant_rooms" to "service_role";
grant REFERENCES on table "public"."restaurant_rooms" to "service_role";
grant TRIGGER on table "public"."restaurant_rooms" to "service_role";
grant MAINTAIN on table "public"."restaurant_rooms" to "service_role";
alter table "public"."restaurant_service_changes" owner to "postgres";
alter table "public"."restaurant_service_changes" enable row level security;
revoke all on table "public"."restaurant_service_changes" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."restaurant_service_changes" to "postgres";
grant SELECT on table "public"."restaurant_service_changes" to "postgres";
grant UPDATE on table "public"."restaurant_service_changes" to "postgres";
grant DELETE on table "public"."restaurant_service_changes" to "postgres";
grant TRUNCATE on table "public"."restaurant_service_changes" to "postgres";
grant REFERENCES on table "public"."restaurant_service_changes" to "postgres";
grant TRIGGER on table "public"."restaurant_service_changes" to "postgres";
grant MAINTAIN on table "public"."restaurant_service_changes" to "postgres";
grant SELECT on table "public"."restaurant_service_changes" to "authenticated";
grant SELECT on table "public"."restaurant_service_changes" to "resto_service_writer";
grant TRUNCATE on table "public"."restaurant_service_changes" to "service_role";
grant REFERENCES on table "public"."restaurant_service_changes" to "service_role";
grant TRIGGER on table "public"."restaurant_service_changes" to "service_role";
grant MAINTAIN on table "public"."restaurant_service_changes" to "service_role";
alter table "public"."restaurant_tables" owner to "postgres";
alter table "public"."restaurant_tables" enable row level security;
revoke all on table "public"."restaurant_tables" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."restaurant_tables" to "postgres";
grant SELECT on table "public"."restaurant_tables" to "postgres";
grant UPDATE on table "public"."restaurant_tables" to "postgres";
grant DELETE on table "public"."restaurant_tables" to "postgres";
grant TRUNCATE on table "public"."restaurant_tables" to "postgres";
grant REFERENCES on table "public"."restaurant_tables" to "postgres";
grant TRIGGER on table "public"."restaurant_tables" to "postgres";
grant MAINTAIN on table "public"."restaurant_tables" to "postgres";
grant SELECT on table "public"."restaurant_tables" to "authenticated";
grant INSERT on table "public"."restaurant_tables" to "resto_service_writer";
grant SELECT on table "public"."restaurant_tables" to "resto_service_writer";
grant UPDATE on table "public"."restaurant_tables" to "resto_service_writer";
grant DELETE on table "public"."restaurant_tables" to "resto_service_writer";
grant TRUNCATE on table "public"."restaurant_tables" to "service_role";
grant REFERENCES on table "public"."restaurant_tables" to "service_role";
grant TRIGGER on table "public"."restaurant_tables" to "service_role";
grant MAINTAIN on table "public"."restaurant_tables" to "service_role";
alter table "public"."restaurants" owner to "postgres";
alter table "public"."restaurants" enable row level security;
revoke all on table "public"."restaurants" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."restaurants" to "postgres";
grant SELECT on table "public"."restaurants" to "postgres";
grant UPDATE on table "public"."restaurants" to "postgres";
grant DELETE on table "public"."restaurants" to "postgres";
grant TRUNCATE on table "public"."restaurants" to "postgres";
grant REFERENCES on table "public"."restaurants" to "postgres";
grant TRIGGER on table "public"."restaurants" to "postgres";
grant MAINTAIN on table "public"."restaurants" to "postgres";
grant SELECT on table "public"."restaurants" to "authenticated";
grant TRUNCATE on table "public"."restaurants" to "service_role";
grant REFERENCES on table "public"."restaurants" to "service_role";
grant TRIGGER on table "public"."restaurants" to "service_role";
grant MAINTAIN on table "public"."restaurants" to "service_role";
alter table "public"."service_closures" owner to "postgres";
alter table "public"."service_closures" enable row level security;
revoke all on table "public"."service_closures" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."service_closures" to "postgres";
grant SELECT on table "public"."service_closures" to "postgres";
grant UPDATE on table "public"."service_closures" to "postgres";
grant DELETE on table "public"."service_closures" to "postgres";
grant TRUNCATE on table "public"."service_closures" to "postgres";
grant REFERENCES on table "public"."service_closures" to "postgres";
grant TRIGGER on table "public"."service_closures" to "postgres";
grant MAINTAIN on table "public"."service_closures" to "postgres";
grant SELECT on table "public"."service_closures" to "authenticated";
grant TRUNCATE on table "public"."service_closures" to "service_role";
grant REFERENCES on table "public"."service_closures" to "service_role";
grant TRIGGER on table "public"."service_closures" to "service_role";
grant MAINTAIN on table "public"."service_closures" to "service_role";
alter table "public"."staff_password_reset_audit" owner to "postgres";
alter table "public"."staff_password_reset_audit" enable row level security;
revoke all on table "public"."staff_password_reset_audit" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."staff_password_reset_audit" to "postgres";
grant SELECT on table "public"."staff_password_reset_audit" to "postgres";
grant UPDATE on table "public"."staff_password_reset_audit" to "postgres";
grant DELETE on table "public"."staff_password_reset_audit" to "postgres";
grant TRUNCATE on table "public"."staff_password_reset_audit" to "postgres";
grant REFERENCES on table "public"."staff_password_reset_audit" to "postgres";
grant TRIGGER on table "public"."staff_password_reset_audit" to "postgres";
grant MAINTAIN on table "public"."staff_password_reset_audit" to "postgres";
grant TRUNCATE on table "public"."staff_password_reset_audit" to "service_role";
grant REFERENCES on table "public"."staff_password_reset_audit" to "service_role";
grant TRIGGER on table "public"."staff_password_reset_audit" to "service_role";
grant MAINTAIN on table "public"."staff_password_reset_audit" to "service_role";
alter table "public"."staff_profiles" owner to "postgres";
alter table "public"."staff_profiles" enable row level security;
revoke all on table "public"."staff_profiles" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."staff_profiles" to "postgres";
grant SELECT on table "public"."staff_profiles" to "postgres";
grant UPDATE on table "public"."staff_profiles" to "postgres";
grant DELETE on table "public"."staff_profiles" to "postgres";
grant TRUNCATE on table "public"."staff_profiles" to "postgres";
grant REFERENCES on table "public"."staff_profiles" to "postgres";
grant TRIGGER on table "public"."staff_profiles" to "postgres";
grant MAINTAIN on table "public"."staff_profiles" to "postgres";
grant SELECT on table "public"."staff_profiles" to "authenticated";
grant MAINTAIN on table "public"."staff_profiles" to "authenticated";
grant SELECT on table "public"."staff_profiles" to "resto_service_writer";
grant TRUNCATE on table "public"."staff_profiles" to "service_role";
grant REFERENCES on table "public"."staff_profiles" to "service_role";
grant TRIGGER on table "public"."staff_profiles" to "service_role";
grant MAINTAIN on table "public"."staff_profiles" to "service_role";
alter table "public"."table_fusion_links" owner to "postgres";
alter table "public"."table_fusion_links" enable row level security;
revoke all on table "public"."table_fusion_links" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."table_fusion_links" to "postgres";
grant SELECT on table "public"."table_fusion_links" to "postgres";
grant UPDATE on table "public"."table_fusion_links" to "postgres";
grant DELETE on table "public"."table_fusion_links" to "postgres";
grant TRUNCATE on table "public"."table_fusion_links" to "postgres";
grant REFERENCES on table "public"."table_fusion_links" to "postgres";
grant TRIGGER on table "public"."table_fusion_links" to "postgres";
grant MAINTAIN on table "public"."table_fusion_links" to "postgres";
grant MAINTAIN on table "public"."table_fusion_links" to "anon";
grant SELECT on table "public"."table_fusion_links" to "authenticated";
grant MAINTAIN on table "public"."table_fusion_links" to "authenticated";
grant INSERT on table "public"."table_fusion_links" to "resto_service_writer";
grant SELECT on table "public"."table_fusion_links" to "resto_service_writer";
grant UPDATE on table "public"."table_fusion_links" to "resto_service_writer";
grant DELETE on table "public"."table_fusion_links" to "resto_service_writer";
grant TRUNCATE on table "public"."table_fusion_links" to "service_role";
grant REFERENCES on table "public"."table_fusion_links" to "service_role";
grant TRIGGER on table "public"."table_fusion_links" to "service_role";
grant MAINTAIN on table "public"."table_fusion_links" to "service_role";
alter table "public"."table_holds" owner to "postgres";
alter table "public"."table_holds" enable row level security;
revoke all on table "public"."table_holds" from public,"postgres","anon","authenticated","service_role","resto_service_writer";
grant INSERT on table "public"."table_holds" to "postgres";
grant SELECT on table "public"."table_holds" to "postgres";
grant UPDATE on table "public"."table_holds" to "postgres";
grant DELETE on table "public"."table_holds" to "postgres";
grant TRUNCATE on table "public"."table_holds" to "postgres";
grant REFERENCES on table "public"."table_holds" to "postgres";
grant TRIGGER on table "public"."table_holds" to "postgres";
grant MAINTAIN on table "public"."table_holds" to "postgres";
grant INSERT on table "public"."table_holds" to "resto_service_writer";
grant SELECT on table "public"."table_holds" to "resto_service_writer";
grant UPDATE on table "public"."table_holds" to "resto_service_writer";
grant DELETE on table "public"."table_holds" to "resto_service_writer";
grant TRUNCATE on table "public"."table_holds" to "service_role";
grant REFERENCES on table "public"."table_holds" to "service_role";
grant TRIGGER on table "public"."table_holds" to "service_role";
grant MAINTAIN on table "public"."table_holds" to "service_role";
do $clear_columns$ declare c record;begin for c in select table_schema,table_name,column_name from information_schema.columns where table_schema in ('public','private') loop execute format('revoke select(%I),insert(%I),update(%I),references(%I) on %I.%I from public,anon,authenticated,service_role,resto_service_writer',c.column_name,c.column_name,c.column_name,c.column_name,c.table_schema,c.table_name);end loop;end $clear_columns$;
grant UPDATE("read_at") on table "public"."reservation_change_alerts" to "authenticated";
grant INSERT("restaurant_id") on table "public"."platform_reports" to "authenticated";
grant INSERT("submitted_by") on table "public"."platform_reports" to "authenticated";
grant INSERT("submitted_role") on table "public"."platform_reports" to "authenticated";
grant INSERT("kind") on table "public"."platform_reports" to "authenticated";
grant INSERT("severity") on table "public"."platform_reports" to "authenticated";
grant INSERT("title") on table "public"."platform_reports" to "authenticated";
grant INSERT("description") on table "public"."platform_reports" to "authenticated";
grant INSERT("reply_contact") on table "public"."platform_reports" to "authenticated";
grant INSERT("screen") on table "public"."platform_reports" to "authenticated";
grant UPDATE("status") on table "public"."platform_reports" to "authenticated";
grant UPDATE("read_at") on table "public"."fb_reservation_alerts" to "authenticated";
grant SELECT("id") on table "public"."table_holds" to "authenticated";
grant SELECT("table_id") on table "public"."table_holds" to "authenticated";
grant SELECT("held_by") on table "public"."table_holds" to "authenticated";
grant SELECT("starts_at") on table "public"."table_holds" to "authenticated";
grant SELECT("ends_at") on table "public"."table_holds" to "authenticated";
grant SELECT("expires_at") on table "public"."table_holds" to "authenticated";
grant SELECT("created_at") on table "public"."table_holds" to "authenticated";
grant SELECT("draft_role") on table "public"."table_holds" to "authenticated";
do $clear_policies$ declare p record;begin for p in select * from pg_policies where schemaname in ('public','private') loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);end loop;end $clear_policies$;
create policy "same_restaurant" on "private"."booking_drafts_v3" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "writer_access" on "private"."booking_drafts_v3" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);
create policy "fb alerts mark read" on "public"."fb_reservation_alerts" as PERMISSIVE for UPDATE to "authenticated" using ((private.current_staff_role() = 'fb_admin'::text)) with check ((private.current_staff_role() = 'fb_admin'::text));
create policy "fb alerts read" on "public"."fb_reservation_alerts" as PERMISSIVE for SELECT to "authenticated" using ((private.current_staff_role() = 'fb_admin'::text));
create policy "same_restaurant" on "public"."fb_reservation_alerts" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "writer_access" on "public"."fb_reservation_alerts" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);
create policy "platform_admin_read_self" on "public"."platform_admins" as PERMISSIVE for SELECT to "authenticated" using (((( SELECT auth.uid() AS uid) = user_id) AND (active = true)));
create policy "platform_reports_owner_read" on "public"."platform_reports" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE ((pa.user_id = ( SELECT auth.uid() AS uid)) AND (pa.active = true) AND (pa.role = 'platform_admin'::text)))));
create policy "platform_reports_owner_status" on "public"."platform_reports" as PERMISSIVE for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE ((pa.user_id = ( SELECT auth.uid() AS uid)) AND (pa.active = true) AND (pa.role = 'platform_admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE ((pa.user_id = ( SELECT auth.uid() AS uid)) AND (pa.active = true) AND (pa.role = 'platform_admin'::text)))));
create policy "platform_reports_staff_create" on "public"."platform_reports" as PERMISSIVE for INSERT to "authenticated" with check (((submitted_by = ( SELECT auth.uid() AS uid)) AND (restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (submitted_role = ( SELECT private.current_staff_role() AS current_staff_role)) AND (submitted_role = ANY (ARRAY['fb_admin'::text, 'reception'::text])) AND (status = 'new'::text)));
create policy "restaurant acknowledges change alerts" on "public"."reservation_change_alerts" as PERMISSIVE for UPDATE to "authenticated" using (((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text))) with check (((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)));
create policy "restaurant reads change alerts" on "public"."reservation_change_alerts" as PERMISSIVE for SELECT to "authenticated" using (((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)));
create policy "reservation_tables_staff_read" on "public"."reservation_tables" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));
create policy "same_restaurant" on "public"."reservation_tables" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "writer_access" on "public"."reservation_tables" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);
create policy "reservations_staff_read" on "public"."reservations" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));
create policy "same_restaurant" on "public"."reservations" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "writer_access" on "public"."reservations" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);
create policy "admin_edit" on "public"."restaurant_hours" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)) with check ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));
create policy "same_restaurant" on "public"."restaurant_hours" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "staff_read" on "public"."restaurant_hours" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['fb_admin'::text, 'reception'::text])));
create policy "writer_access" on "public"."restaurant_hours" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);
create policy "rooms_admin_insert" on "public"."restaurant_rooms" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));
create policy "rooms_admin_update" on "public"."restaurant_rooms" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)) with check ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));
create policy "rooms_staff_read" on "public"."restaurant_rooms" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));
create policy "same_restaurant" on "public"."restaurant_rooms" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "writer_access" on "public"."restaurant_rooms" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);
create policy "mission3_writer_read_revision" on "public"."restaurant_service_changes" as PERMISSIVE for SELECT to "resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "own_changes" on "public"."restaurant_service_changes" as PERMISSIVE for SELECT to "authenticated" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "same_restaurant" on "public"."restaurant_tables" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "tables_admin_insert" on "public"."restaurant_tables" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));
create policy "tables_admin_update" on "public"."restaurant_tables" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)) with check ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));
create policy "tables_staff_read" on "public"."restaurant_tables" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));
create policy "writer_access" on "public"."restaurant_tables" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);
create policy "own_restaurant" on "public"."restaurants" as PERMISSIVE for SELECT to "authenticated" using ((id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "platform_owner_restaurants" on "public"."restaurants" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE ((pa.user_id = ( SELECT auth.uid() AS uid)) AND (pa.role = 'platform_admin'::text) AND (pa.active = true)))));
create policy "restaurant read own service closures" on "public"."service_closures" as PERMISSIVE for SELECT to "authenticated" using (((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)));
create policy "active_profile" on "public"."staff_profiles" as RESTRICTIVE for SELECT to "authenticated" using (active);
create policy "staff_profiles_read_self" on "public"."staff_profiles" as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "writer_profile" on "public"."staff_profiles" as PERMISSIVE for SELECT to "resto_service_writer" using (((user_id = ( SELECT auth.uid() AS uid)) AND active));
create policy "fb manage fusion links" on "public"."table_fusion_links" as PERMISSIVE for ALL to "authenticated" using ((private.current_staff_role() = 'fb_admin'::text)) with check ((private.current_staff_role() = 'fb_admin'::text));
create policy "same_restaurant" on "public"."table_fusion_links" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "staff read fusion links" on "public"."table_fusion_links" as PERMISSIVE for SELECT to "authenticated" using ((private.current_staff_role() = ANY (ARRAY['reception'::text, 'fb_admin'::text])));
create policy "writer_access" on "public"."table_fusion_links" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);
create policy "holds_staff_read" on "public"."table_holds" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));
create policy "same_restaurant" on "public"."table_holds" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "writer_access" on "public"."table_holds" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);
-- Match actual DEV trigger bindings, without keeping extra local protections.
do $clear_triggers$ declare trigger_row record;begin for trigger_row in select n.nspname,c.relname,g.tgname from pg_trigger g join pg_class c on c.oid=g.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and not g.tgisinternal loop execute format('drop trigger %I on %I.%I',trigger_row.tgname,trigger_row.nspname,trigger_row.relname);end loop;end $clear_triggers$;
CREATE TRIGGER mission3_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON fb_reservation_alerts FOR EACH STATEMENT EXECUTE FUNCTION private.lock_direct_service_mutation_v1();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON fb_reservation_alerts FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER mission3_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON reservation_change_alerts FOR EACH STATEMENT EXECUTE FUNCTION private.lock_direct_service_mutation_v1();
CREATE TRIGGER invalidate_reservation_edit_version AFTER INSERT OR DELETE OR UPDATE ON reservation_tables FOR EACH ROW EXECUTE FUNCTION private.invalidate_reservation_edit_version();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON reservation_tables FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER bump_reservation_edit_version BEFORE INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION private.bump_reservation_edit_version();
CREATE TRIGGER guard_closed_service_reservations BEFORE INSERT OR DELETE OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION private.guard_closed_service_reservations();
CREATE TRIGGER reception_booking_alert AFTER INSERT ON reservations FOR EACH ROW EXECUTE FUNCTION private.notify_fb_on_reception_booking();
CREATE TRIGGER reception_booking_change_alert AFTER UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION private.notify_fb_on_reception_change();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER mission3_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON restaurant_hours FOR EACH STATEMENT EXECUTE FUNCTION private.lock_direct_service_mutation_v1();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON restaurant_hours FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER mission3_room_configuration BEFORE UPDATE ON restaurant_rooms FOR EACH ROW EXECUTE FUNCTION private.guard_room_configuration_v1();
CREATE TRIGGER mission3_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON restaurant_rooms FOR EACH STATEMENT EXECUTE FUNCTION private.lock_direct_service_mutation_v1();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON restaurant_rooms FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER mission3_invalidate_table_editors AFTER UPDATE OF label, seats, room_id, active ON restaurant_tables FOR EACH ROW EXECUTE FUNCTION private.invalidate_table_editors_v1();
CREATE TRIGGER mission3_table_configuration BEFORE INSERT OR UPDATE ON restaurant_tables FOR EACH ROW EXECUTE FUNCTION private.guard_table_configuration_v1();
CREATE TRIGGER remove_fusions_on_room_change AFTER UPDATE OF room_id ON restaurant_tables FOR EACH ROW EXECUTE FUNCTION private.remove_fusions_on_table_room_change();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON restaurant_tables FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER initialize_hours AFTER INSERT ON restaurants FOR EACH ROW EXECUTE FUNCTION private.initialize_restaurant_hours();
CREATE TRIGGER mission3_fusion_removal AFTER DELETE ON table_fusion_links FOR EACH ROW EXECUTE FUNCTION private.guard_fusion_removal_v1();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON table_fusion_links FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER validate_fusion_room BEFORE INSERT OR UPDATE ON table_fusion_links FOR EACH ROW EXECUTE FUNCTION private.validate_table_fusion_link();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON table_holds FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
set check_function_bodies=on;
notify pgrst,'reload schema';
