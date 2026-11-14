-- RM005 synthetic only: EXACT PROD function definitions, NO customer data.
SET check_function_bodies=off;
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
 if v_room is not null and not (
      v_role='fb_admin'
      and p_notes='[RM:WALKIN_SEPARATE_OCCUPANT_V1]'
      and current_setting('restomanager.second_occupant_confirmed',true)='yes'
    ) and exists (
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
end $function$;
ALTER FUNCTION private.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text) OWNER TO resto_service_writer;
REVOKE ALL ON FUNCTION private.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text) FROM PUBLIC,anon,authenticated;
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
end $function$;
ALTER FUNCTION public.confirm_reservation_v2(text,text,integer,timestamptz,timestamptz,uuid[],uuid,text) OWNER TO resto_service_writer;
REVOKE ALL ON FUNCTION public.confirm_reservation_v2(text,text,integer,timestamptz,timestamptz,uuid[],uuid,text) FROM PUBLIC,anon,authenticated;
RESET check_function_bodies;
