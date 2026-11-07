-- TEST FIXTURE ONLY. Application catalog captured read-only 2026-11-07. No rows/PII.

-- Not a production baseline: Supabase Auth is represented by auth.uid() and auth.users(id).

-- Loaded only into the network-disabled disposable PostgreSQL test container.

set check_function_bodies=off;

create role anon nologin;create role authenticated nologin;create role resto_service_writer nologin nobypassrls;

create schema auth;create schema private;

create table auth.users(id uuid primary key);

create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;

grant usage on schema auth,public,private to anon,authenticated,resto_service_writer;

grant execute on function auth.uid() to anon,authenticated,resto_service_writer;

create table "private"."booking_drafts_v3"("key" uuid not null,
"staff" uuid not null,
"lock_token" uuid not null,
"ids" uuid[] not null,
"guests" integer not null,
"starts" timestamp with time zone not null,
"ends" timestamp with time zone not null,
"expires" timestamp with time zone not null,
"booking" uuid,
"restaurant_id" uuid not null);

create table "public"."fb_reservation_alerts"("id" uuid not null,
"reservation_id" uuid not null,
"guest_name" text not null,
"hotel_room" text,
"party_size" integer not null,
"starts_at" timestamp with time zone not null,
"created_at" timestamp with time zone not null,
"read_at" timestamp with time zone,
"restaurant_id" uuid not null);

create table "public"."reservation_change_alerts"("id" uuid not null,
"reservation_id" uuid not null,
"restaurant_id" uuid not null,
"event_type" text not null,
"guest_name" text not null,
"hotel_room" text,
"party_size" integer not null,
"starts_at" timestamp with time zone not null,
"previous_guest_name" text,
"previous_hotel_room" text,
"previous_party_size" integer,
"previous_starts_at" timestamp with time zone,
"changed_fields" text[] not null,
"created_at" timestamp with time zone not null,
"read_at" timestamp with time zone);

create table "public"."reservation_tables"("reservation_id" uuid not null,
"table_id" uuid not null,
"restaurant_id" uuid not null);

create table "public"."reservations"("id" uuid not null,
"guest_name" text not null,
"hotel_room" text,
"party_size" integer not null,
"starts_at" timestamp with time zone not null,
"ends_at" timestamp with time zone not null,
"status" text not null,
"notes" text,
"created_by" uuid,
"created_at" timestamp with time zone not null,
"updated_at" timestamp with time zone not null,
"arrived_at" timestamp with time zone,
"seated_at" timestamp with time zone,
"released_at" timestamp with time zone,
"confirmed_at" timestamp with time zone,
"walkin_type" text,
"restaurant_id" uuid not null);

create table "public"."restaurant_hours"("id" integer not null,
"lunch_enabled" boolean not null,
"lunch_start" time without time zone not null,
"lunch_end" time without time zone not null,
"dinner_enabled" boolean not null,
"dinner_start" time without time zone not null,
"dinner_end" time without time zone not null,
"duration" integer not null,
"restaurant_id" uuid not null);

create table "public"."restaurant_rooms"("id" uuid not null,
"name" text not null,
"active" boolean not null,
"sort_order" integer not null,
"restaurant_id" uuid not null);

create table "public"."restaurant_service_changes"("restaurant_id" uuid not null,
"revision" bigint not null);

create table "public"."restaurant_tables"("id" uuid not null,
"room_id" uuid not null,
"label" text not null,
"seats" integer not null,
"active" boolean not null,
"restaurant_id" uuid not null);

create table "public"."restaurants"("id" uuid not null,
"name" text not null);

create table "public"."service_closures"("id" uuid not null,
"restaurant_id" uuid not null,
"service_date" date not null,
"closed_at" timestamp with time zone not null,
"closed_by" uuid not null,
"close_mode" text not null,
"served_covers" integer not null,
"served_groups" integer not null,
"walkin_covers" integer not null,
"hotel_covers" integer not null,
"no_show_groups" integer not null,
"cancelled_groups" integer not null);

create table "public"."staff_password_reset_audit"("id" uuid not null,
"actor_user_id" uuid not null,
"target_user_id" uuid not null,
"action" text not null,
"created_at" timestamp with time zone not null,
"restaurant_id" uuid not null);

create table "public"."staff_profiles"("user_id" uuid not null,
"role" text not null,
"display_name" text not null,
"active" boolean not null,
"created_at" timestamp with time zone not null,
"restaurant_id" uuid not null);

create table "public"."table_fusion_links"("table_a" uuid not null,
"table_b" uuid not null,
"created_at" timestamp with time zone not null,
"restaurant_id" uuid not null);

create table "public"."table_holds"("id" uuid not null,
"table_id" uuid not null,
"held_by" uuid not null,
"starts_at" timestamp with time zone not null,
"ends_at" timestamp with time zone not null,
"expires_at" timestamp with time zone not null,
"created_at" timestamp with time zone not null,
"owner_token" uuid,
"draft_role" text,
"restaurant_id" uuid not null);

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

CREATE OR REPLACE FUNCTION private.current_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select p.role from public.staff_profiles p where p.user_id = (select auth.uid()) and p.active = true limit 1 $function$
;

CREATE OR REPLACE FUNCTION private.acquire_table_hold(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := auth.uid(); v_hold uuid; v_conflict boolean;
begin
 if v_user is null or (select private.current_staff_role()) not in ('reception','fb_admin') then
  raise exception 'Accès non autorisé' using errcode='42501';
 end if;
 if p_table_id is null or p_starts_at is null or p_ends_at is null
 or p_ends_at<=p_starts_at or p_ends_at-p_starts_at>interval '6 hours'
 or p_starts_at<now()-interval '5 minutes' then
  raise exception 'Créneau invalide' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_table_id::text,0));
 if not exists(select 1 from public.restaurant_tables where id=p_table_id and active) then
  raise exception 'Table indisponible' using errcode='22023';
 end if;
 select exists(
  select 1 from public.reservation_tables rt
  join public.reservations r on r.id=rt.reservation_id
  where rt.table_id=p_table_id and r.status in ('reserved','confirmed','late','arrived','seated')
  and r.starts_at<p_ends_at and r.ends_at>p_starts_at
 ) into v_conflict;
 if v_conflict then raise exception 'Table déjà réservée' using errcode='23P01'; end if;
 select h.id into v_hold from public.table_holds h
 where h.table_id=p_table_id and h.expires_at>now()
 and h.starts_at<p_ends_at and h.ends_at>p_starts_at
 and h.held_by=v_user
 order by h.created_at desc limit 1;
 if exists(select 1 from public.table_holds h
 where h.table_id=p_table_id and h.expires_at>now()
 and h.starts_at<p_ends_at and h.ends_at>p_starts_at
 and h.held_by<>v_user) then
  raise exception 'Table temporairement bloquée par un collègue' using errcode='23P01';
 end if;
 if v_hold is not null then
  update public.table_holds set starts_at=p_starts_at,ends_at=p_ends_at,
  expires_at=now()+interval '3 minutes' where id=v_hold;
 else
  insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at)
  values(p_table_id,v_user,p_starts_at,p_ends_at,now()+interval '3 minutes')
  returning id into v_hold;
 end if;
 return v_hold;
end $function$
;

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
 v_role := private.current_staff_role();
 if v_user is null or v_role is null or v_role not in ('reception','fb_admin') then
  raise exception 'Accès non autorisé' using errcode='42501';
 end if;
 if p_guest_name is null or length(btrim(p_guest_name)) not between 1 and 160
 or p_party_size is null or p_party_size not between 1 and 50
 or p_starts_at is null or p_ends_at is null
 or p_ends_at <= p_starts_at or p_ends_at-p_starts_at > interval '6 hours'
 or p_starts_at < now()-interval '5 minutes'
 or p_table_ids is null or cardinality(p_table_ids) not between 1 and 20
 or array_position(p_table_ids,null) is not null then
  raise exception 'Réservation invalide' using errcode='22023';
 end if;
 if v_room is not null and length(v_room)>40 then
  raise exception 'Numéro de chambre invalide' using errcode='22023';
 end if;
 select count(*) into v_count from (select distinct x from unnest(p_table_ids) x) q;
 if v_count <> cardinality(p_table_ids) then
  raise exception 'Tables en double' using errcode='22023';
 end if;
 -- Lock all table IDs in stable order: acquisition uses the same advisory lock.
 for v_table in select distinct x from unnest(p_table_ids) x order by x loop
  perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 end loop;
 -- Lock hotel-room identity to serialize duplicate-room checks.
 if v_room is not null then
  perform pg_advisory_xact_lock(hashtextextended('hotel-room:'||lower(v_room),0));
 end if;
 select count(*),coalesce(sum(seats),0) into v_count,v_seats
 from public.restaurant_tables where id=any(p_table_ids) and active;
 if v_count <> cardinality(p_table_ids) or v_seats < p_party_size then
  raise exception 'Tables inexistantes, désactivées ou capacité insuffisante' using errcode='22023';
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
  raise exception 'Verrouillage expiré ou absent : sélectionnez à nouveau les tables' using errcode='23P01';
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
  raise exception 'Conflit de disponibilité des tables' using errcode='23P01';
 end if;
 if v_room is not null and exists (
  select 1 from public.reservations r
  where lower(btrim(r.hotel_room))=lower(v_room)
  and r.status in ('reserved','confirmed','late','arrived','seated')
  and r.starts_at<p_ends_at and r.ends_at>p_starts_at
 ) then
  raise exception 'Cette chambre possède déjà une réservation sur ce créneau' using errcode='23P01';
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

CREATE OR REPLACE FUNCTION public.acquire_table_hold(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.acquire_table_hold(p_table_id,p_starts_at,p_ends_at) $function$
;

CREATE OR REPLACE FUNCTION public.confirm_reservation(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.confirm_reservation(p_guest_name,p_hotel_room,p_party_size,p_starts_at,p_ends_at,p_table_ids,p_notes) $function$
;

CREATE OR REPLACE FUNCTION public.release_table_hold(p_hold_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.release_table_hold(p_hold_id) $function$
;

CREATE OR REPLACE FUNCTION public.release_table_hold_v2(p_hold_id uuid, p_owner_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_table uuid;
begin
 if auth.uid() is null or private.current_staff_role() not in ('reception','fb_admin') or p_owner_token is null then raise exception 'Accès refusé' using errcode='42501'; end if;
 select table_id into v_table from public.table_holds where id=p_hold_id and held_by=auth.uid() and owner_token=p_owner_token;
 if v_table is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 if not exists(select 1 from public.table_holds where id=p_hold_id and held_by=auth.uid() and owner_token=p_owner_token) then return false; end if;
 return private.release_table_hold(p_hold_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.cancel_reservation_v3(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin if staff='reception' then perform 1 from public.reservations where id=p_reservation_id and status in ('reserved','confirmed','late','arrived') for update;
       if not found then raise exception 'Annulation impossible après installation.' using errcode='42501'; end if;
       elsif staff is distinct from 'fb_admin' then raise exception 'Accès refusé' using errcode='42501'; end if; return private.cancel_reservation_v3($1); end$function$
;

CREATE OR REPLACE FUNCTION public.confirm_reservation_v3(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501'; end if; return private.confirm_reservation_v3($1,$2,$3,$4,$5,$6,$7,$8); end$function$
;

CREATE OR REPLACE FUNCTION public.delete_cancelled_reservation_v3(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text;
begin
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then
  raise exception 'Suppression réservée aux administrateurs' using errcode='42501';
 end if;
 select status into v_status from public.reservations where id=p_reservation_id for update;
 if not found then raise exception 'Réservation introuvable' using errcode='P0002';end if;
 if v_status <> 'cancelled' then raise exception 'Annulez la réservation avant de la supprimer' using errcode='22023';end if;
 delete from public.reservations where id=p_reservation_id;
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.install_walkin_v3(p_table uuid, p_guests integer, p_name text, p_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501'; end if; return private.install_walkin_v3($1,$2,$3,$4); end$function$
;

CREATE OR REPLACE FUNCTION public.acquire_table_hold_v2(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501'; end if; return private.acquire_table_hold_v2($1,$2,$3,$4); end$function$
;

CREATE OR REPLACE FUNCTION public.booking_draft_v3(p_key uuid, p_action text, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_guests integer DEFAULT NULL::integer, p_tables uuid[] DEFAULT NULL::uuid[], p_name text DEFAULT NULL::text, p_room text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 staff_role text:=private.current_staff_role(); d private.booking_drafts_v3;
 candidate record; t uuid; held uuid[]; deadline timestamptz;
begin
 if auth.uid() is null or coalesce(staff_role,'') not in ('fb_admin','reception') or p_key is null then
  raise exception 'Accès refusé' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('draft:'||p_key::text,0));
 select * into d from private.booking_drafts_v3 where key=p_key;
 if found and d.staff<>auth.uid() then raise exception 'Accès refusé' using errcode='42501';end if;
 if p_action='release' then
  if d.booking is null then
   delete from public.table_holds where held_by=auth.uid() and owner_token=d.lock_token;
   delete from private.booking_drafts_v3 where key=p_key;
  end if;
  return '{}'::jsonb;
 end if;
 if p_action='confirm' then
  if d.key is null then raise exception 'Maintien expiré. Revérifiez la disponibilité.';end if;
  if d.booking is null then
   d.booking:=private.confirm_reservation_v3(p_name,p_room,d.guests,d.starts,d.ends,d.ids,d.lock_token,p_notes);
   update private.booking_drafts_v3 set booking=d.booking where key=p_key;
  end if;
  return jsonb_build_object('booking',d.booking,'tables',d.ids);
 end if;
 if p_action='extend' then
  if d.key is null or d.booking is not null or d.expires<=clock_timestamp() then raise exception 'Maintien expiré. Revérifiez la disponibilité.';end if;
  deadline:=clock_timestamp()+interval '3 minutes';
  update public.table_holds set expires_at=deadline where held_by=auth.uid() and owner_token=d.lock_token and expires_at>clock_timestamp();
  if (select count(*) from public.table_holds where owner_token=d.lock_token and expires_at=deadline)<>cardinality(d.ids) then
   raise exception 'Maintien expiré. Revérifiez la disponibilité.';
  end if;
  update private.booking_drafts_v3 set expires=deadline where key=p_key;
 elsif p_action='hold' then
  if d.key is not null then raise exception 'Cette saisie est déjà ouverte.';end if;
  if p_guests is null or p_guests not between 1 and 50 or p_start is null or p_end is null or p_end<=p_start
   or p_start<now()-interval '5 minutes' or p_end-p_start>interval '6 hours' then raise exception 'Créneau ou couverts invalides.';end if;
  if not exists(select 1 from public.restaurant_hours h where h.id=1 and
   ((h.lunch_enabled and (p_start at time zone 'Europe/Paris')::time between h.lunch_start and h.lunch_end)
    or (h.dinner_enabled and (p_start at time zone 'Europe/Paris')::time between h.dinner_start and h.dinner_end))) then raise exception 'Choisissez un créneau pendant un service ouvert.';end if;
  if staff_role='reception' and p_tables is not null then raise exception 'La table est attribuée automatiquement.';end if;
  delete from private.booking_drafts_v3 where expires<now()-interval '1 day';
  d.lock_token:=gen_random_uuid();
  for candidate in select * from private.ranked_booking_sets(null,null,p_guests,p_start,p_end) c
   where p_tables is null or (cardinality(c.ids)=cardinality(p_tables) and c.ids @> p_tables)
  loop
   begin
    held:='{}';
    foreach t in array candidate.ids loop
     held:=array_append(held,private.acquire_table_hold_v2(t,p_start,p_end,d.lock_token));
    end loop;
    d.ids:=candidate.ids;
    exit;
   exception when exclusion_violation then null;
   end;
  end loop;
  if d.ids is null then raise exception 'Cette table est indisponible pour ce créneau. Choisissez une autre proposition.';end if;
  update public.table_holds set draft_role=staff_role where id=any(held);
  select min(expires_at) into deadline from public.table_holds where id=any(held);
  insert into private.booking_drafts_v3(key,staff,lock_token,ids,guests,starts,ends,expires)
   values(p_key,auth.uid(),d.lock_token,d.ids,p_guests,p_start,p_end,deadline);
 else raise exception 'Action inconnue.';
 end if;
 select array_agg(id) into held from public.table_holds where held_by=auth.uid() and owner_token=d.lock_token;
 return jsonb_build_object('tables',d.ids,'holds',held,'seconds',greatest(0,extract(epoch from deadline-clock_timestamp())));
end $function$
;

CREATE OR REPLACE FUNCTION public.change_reservation_status_v3(p_reservation_id uuid, p_expected text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin if staff is distinct from 'fb_admin' and not coalesce(staff='reception' and p_status in ('confirmed','late'),false) then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501'; end if; perform private.change_reservation_status_v3($1,$2,$3); end$function$
;

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

CREATE OR REPLACE FUNCTION public.update_reservation_v3(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501'; end if; return private.update_reservation_v3($1,$2,$3,$4,$5,$6,$7); end$function$
;

CREATE OR REPLACE FUNCTION public.reception_booking_v3(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare candidate record; previous uuid[]; held_table uuid; token uuid:=gen_random_uuid();
begin
 if private.current_staff_role() is distinct from 'reception' then raise exception 'Accès réservé à la réception.' using errcode='42501'; end if;
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
    if sqlerrm ilike '%chambre%' then raise; end if;
   end;
 end loop;
 raise exception 'Aucune table disponible pour ce créneau et ce nombre de couverts.';
end $function$
;

CREATE OR REPLACE FUNCTION public.change_fusion_link_v3(p_old uuid[], p_new uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if private.current_staff_role() is distinct from 'fb_admin' then raise exception 'Action réservée au restaurant' using errcode='42501';end if;
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
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then raise exception 'Accès refusé'; end if;
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

CREATE OR REPLACE FUNCTION public.confirm_reservation_v2(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_table uuid;
begin
 if auth.uid() is null or private.current_staff_role() not in ('reception','fb_admin') then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_owner_token is null or p_table_ids is null or cardinality(p_table_ids) not between 1 and 20 or array_position(p_table_ids,null) is not null then raise exception 'Tables ou session invalides' using errcode='22023'; end if;
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
 if auth.uid() is null or coalesce(private.current_staff_role()::text,'') not in ('reception','fb_admin') then raise exception 'Accès refusé'; end if;
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
   order by (ids=previous) desc nulls last,seats,cardinality(ids),
     array(select coalesce(substring(t.label from '[0-9]+')::numeric,9999999999)
           from available t where t.id=any(c.ids) order by 1),ids
$function$
;

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

CREATE OR REPLACE FUNCTION private.staff_restaurant()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select restaurant_id from public.staff_profiles where user_id = (select auth.uid()) and active
$function$
;

CREATE OR REPLACE FUNCTION public.set_restaurant_table_active_v3(p_table_id uuid, p_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then raise exception 'Accès refusé' using errcode='42501';end if;
 if p_active is null then raise exception 'Statut invalide' using errcode='22023';end if;
 perform 1 from public.restaurant_tables where id=p_table_id for update;
 if not found then raise exception 'Table introuvable' using errcode='P0002';end if;
 if not p_active and exists(select 1 from public.reservation_tables rt join public.reservations r on r.id=rt.reservation_id where rt.table_id=p_table_id and r.status in ('reserved','confirmed','late','arrived','seated') and r.ends_at>now()) then raise exception 'Des réservations à venir utilisent cette table' using errcode='22023';end if;
 update public.restaurant_tables set active=p_active where id=p_table_id;
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION private.update_reservation_v3(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text;v_table uuid;v_count integer;v_seats integer;v_room text;
begin
 if auth.uid() is null or private.current_staff_role() not in ('reception','fb_admin') then raise exception 'Accès refusé' using errcode='42501';end if;
 if p_guest_name is null or length(btrim(p_guest_name)) not between 1 and 160 or p_party_size not between 1 and 50 or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or p_ends_at-p_starts_at>interval '6 hours' or p_table_ids is null or cardinality(p_table_ids) not between 1 and 20 or array_position(p_table_ids,null) is not null or (select count(distinct x) from unnest(p_table_ids) x)<>cardinality(p_table_ids) then raise exception 'Données invalides' using errcode='22023';end if;
 select status,hotel_room into v_status,v_room from public.reservations where id=p_reservation_id for update;
 if not found then raise exception 'Réservation introuvable' using errcode='P0002';end if;
 if v_status not in ('reserved','confirmed','late','arrived') then raise exception 'Statut non modifiable' using errcode='22023';end if;
 if not private.check_fusion_selection(p_table_ids) then raise exception 'Tables non fusionnables' using errcode='22023';end if;
 for v_table in select distinct x from (select table_id x from public.reservation_tables where reservation_id=p_reservation_id union select unnest(p_table_ids)) z order by x loop
  perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 end loop;
 if v_room is not null then perform pg_advisory_xact_lock(hashtextextended('hotel-room:'||lower(btrim(v_room)),0));end if;
 select count(*),coalesce(sum(seats),0) into v_count,v_seats from public.restaurant_tables where id=any(p_table_ids) and active;
 if v_count<>cardinality(p_table_ids) or v_seats<p_party_size then raise exception 'Capacité ou table invalide' using errcode='22023';end if;
 if exists(select 1 from public.reservation_tables rt join public.reservations r on r.id=rt.reservation_id where rt.table_id=any(p_table_ids) and r.id<>p_reservation_id and r.status in ('reserved','confirmed','late','arrived','seated') and r.starts_at<p_ends_at and r.ends_at>p_starts_at)
 or exists(select 1 from public.table_holds h where h.table_id=any(p_table_ids) and (h.draft_role is not null or h.held_by<>auth.uid()) and h.expires_at>clock_timestamp() and h.starts_at<p_ends_at and h.ends_at>p_starts_at)
 then raise exception 'Table occupée sur ce créneau' using errcode='23P01';end if;
 if v_room is not null and exists(select 1 from public.reservations r where r.id<>p_reservation_id and lower(btrim(r.hotel_room))=lower(btrim(v_room)) and r.status in ('reserved','confirmed','late','arrived','seated') and r.starts_at<p_ends_at and r.ends_at>p_starts_at) then raise exception 'Chambre déjà réservée sur ce créneau' using errcode='23P01';end if;
 update public.reservations set guest_name=btrim(p_guest_name),party_size=p_party_size,starts_at=p_starts_at,ends_at=p_ends_at,notes=p_notes,updated_at=now() where id=p_reservation_id;
 delete from public.reservation_tables where reservation_id=p_reservation_id;
 insert into public.reservation_tables(reservation_id,table_id) select p_reservation_id,x from unnest(p_table_ids) x;
 return true;
end $function$
;

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

CREATE OR REPLACE FUNCTION public.create_restaurant_table_v3(p_label text, p_seats integer, p_room_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then raise exception 'Accès refusé' using errcode='42501';end if;
 if p_label is null or p_label !~ '^Table [1-9][0-9]*$' or length(p_label)>60 or p_seats not between 1 and 50 then raise exception 'Informations de table invalides' using errcode='22023';end if;
 if not exists(select 1 from public.restaurant_rooms where id=p_room_id and active) then raise exception 'Salle indisponible' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('restaurant-table-label:'||lower(p_label),0));
 if exists(select 1 from public.restaurant_tables where lower(label)=lower(p_label)) then raise exception 'Ce numéro de table existe déjà' using errcode='23505';end if;
 insert into public.restaurant_tables(room_id,label,seats,active) values(p_room_id,p_label,p_seats,true) returning id into v_id;
 return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_restaurant_table_v3(p_table_id uuid, p_label text, p_seats integer, p_room_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_old_label text;v_old_seats integer;
begin
 if auth.uid() is null or private.current_staff_role() is distinct from 'fb_admin' then raise exception 'Réservé aux administrateurs' using errcode='42501';end if;
 if p_label is null or length(btrim(p_label)) not between 1 and 60 or p_seats not between 1 and 50 or p_room_id is null then raise exception 'Paramètres invalides' using errcode='22023';end if;
 select label,seats into v_old_label,v_old_seats from public.restaurant_tables where id=p_table_id for update;
 if not found then raise exception 'Table introuvable' using errcode='P0002';end if;
 if not exists(select 1 from public.restaurant_rooms where id=p_room_id and active) then raise exception 'Salle introuvable ou inactive' using errcode='22023';end if;
 if p_seats<v_old_seats and exists(select 1 from public.reservation_tables rt join public.reservations r on r.id=rt.reservation_id where rt.table_id=p_table_id and r.status in ('reserved','confirmed','late','arrived','seated') and r.party_size>p_seats) then raise exception 'Capacité insuffisante pour une réservation active' using errcode='22023';end if;
 update public.restaurant_tables set label=btrim(p_label),seats=p_seats,room_id=p_room_id where id=p_table_id;
 return true;
end $function$
;

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

CREATE OR REPLACE FUNCTION public.close_service_v3(p_date date, p_mode text DEFAULT 'manual'::text)
 RETURNS service_closures
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rid uuid:=private.staff_restaurant(); result public.service_closures; now_paris timestamp; counts record;
begin
 if (select private.current_staff_role()) is distinct from 'fb_admin' or rid is null then
  raise exception 'Clôture réservée au Restaurant.' using errcode='42501';
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
 if (select auth.uid()) is null or private.current_staff_role() is distinct from 'fb_admin' or v_restaurant is null then
  raise exception 'Placement réservé à l’équipe du restaurant.' using errcode='42501';
 end if;
 if p_target_reservation_id is null or jsonb_typeof(p_changes) is distinct from 'array'
   or jsonb_array_length(p_changes) not between 1 and 8 then
  raise exception 'Réorganisation invalide.' using errcode='22023';
 end if;
 if (select count(distinct (e->>'id')) from jsonb_array_elements(p_changes) e) <> jsonb_array_length(p_changes)
   or (select count(*) from jsonb_array_elements(p_changes) e where e->>'id'=p_target_reservation_id::text) <> 1 then
  raise exception 'Réservations incohérentes.' using errcode='22023';
 end if;
 -- Serialize this operation with other smart placement actions in the same restaurant.
 perform pg_advisory_xact_lock(hashtextextended('smart-placement:'||v_restaurant::text,0));
 -- Existing creation and status RPCs also lock individual tables. Use the same lock key.
 -- Lock reservations first, matching the existing RPC lock order.
 perform 1 from public.reservations r
  where r.id in (select (e->>'id')::uuid from jsonb_array_elements(p_changes) e)
  order by r.id for update;
 for v_table in
  select distinct tbl from (
   select (e->>'from_table')::uuid tbl from jsonb_array_elements(p_changes) e
   union all
   select (e->>'to_table')::uuid tbl from jsonb_array_elements(p_changes) e
  ) q order by tbl
 loop
  if v_table is null then raise exception 'Table manquante.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 end loop;
 for v_entry in
  select x.* from jsonb_to_recordset(p_changes)
   as x(id uuid,from_table uuid,to_table uuid,expected_status text) order by id
 loop
  v_count := v_count + 1;
  if v_entry.id is null or v_entry.from_table is null or v_entry.to_table is null
    or v_entry.expected_status is null or v_entry.from_table=v_entry.to_table then
   raise exception 'Modification de table invalide.' using errcode='22023';
  end if;
  select * into v_res from public.reservations
    where id=v_entry.id and restaurant_id=v_restaurant;
  if not found then raise exception 'Réservation introuvable dans cet établissement.' using errcode='42501'; end if;
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
   where t.id=v_entry.to_table and t.restaurant_id=v_restaurant and t.active;
  if not found or v_seats<v_res.party_size then
   raise exception 'Table désactivée ou capacité insuffisante.' using errcode='22023';
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
  raise exception 'Réorganisation incomplète.' using errcode='22023';
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

alter table "private"."booking_drafts_v3" alter column "lock_token" set default gen_random_uuid();

alter table "private"."booking_drafts_v3" alter column "restaurant_id" set default private.staff_restaurant();

alter table "public"."fb_reservation_alerts" alter column "id" set default gen_random_uuid();

alter table "public"."fb_reservation_alerts" alter column "created_at" set default now();

alter table "public"."fb_reservation_alerts" alter column "restaurant_id" set default private.staff_restaurant();

alter table "public"."reservation_change_alerts" alter column "id" set default gen_random_uuid();

alter table "public"."reservation_change_alerts" alter column "changed_fields" set default ARRAY[]::text[];

alter table "public"."reservation_change_alerts" alter column "created_at" set default now();

alter table "public"."reservation_tables" alter column "restaurant_id" set default private.staff_restaurant();

alter table "public"."reservations" alter column "id" set default gen_random_uuid();

alter table "public"."reservations" alter column "status" set default 'reserved'::text;

alter table "public"."reservations" alter column "created_at" set default now();

alter table "public"."reservations" alter column "updated_at" set default now();

alter table "public"."reservations" alter column "restaurant_id" set default private.staff_restaurant();

alter table "public"."restaurant_hours" alter column "restaurant_id" set default private.staff_restaurant();

alter table "public"."restaurant_rooms" alter column "id" set default gen_random_uuid();

alter table "public"."restaurant_rooms" alter column "active" set default true;

alter table "public"."restaurant_rooms" alter column "sort_order" set default 0;

alter table "public"."restaurant_rooms" alter column "restaurant_id" set default private.staff_restaurant();

alter table "public"."restaurant_service_changes" alter column "revision" set default 1;

alter table "public"."restaurant_tables" alter column "id" set default gen_random_uuid();

alter table "public"."restaurant_tables" alter column "active" set default true;

alter table "public"."restaurant_tables" alter column "restaurant_id" set default private.staff_restaurant();

alter table "public"."restaurants" alter column "id" set default gen_random_uuid();

alter table "public"."service_closures" alter column "id" set default gen_random_uuid();

alter table "public"."service_closures" alter column "closed_at" set default now();

alter table "public"."staff_password_reset_audit" alter column "id" set default gen_random_uuid();

alter table "public"."staff_password_reset_audit" alter column "created_at" set default now();

alter table "public"."staff_password_reset_audit" alter column "restaurant_id" set default private.staff_restaurant();

alter table "public"."staff_profiles" alter column "active" set default true;

alter table "public"."staff_profiles" alter column "created_at" set default now();

alter table "public"."table_fusion_links" alter column "created_at" set default now();

alter table "public"."table_fusion_links" alter column "restaurant_id" set default private.staff_restaurant();

alter table "public"."table_holds" alter column "id" set default gen_random_uuid();

alter table "public"."table_holds" alter column "expires_at" set default (now() + '00:03:00'::interval);

alter table "public"."table_holds" alter column "created_at" set default now();

alter table "public"."table_holds" alter column "restaurant_id" set default private.staff_restaurant();

alter table "private"."booking_drafts_v3" add constraint "booking_drafts_v3_pkey" PRIMARY KEY (key);

alter table "public"."fb_reservation_alerts" add constraint "fb_reservation_alerts_pkey" PRIMARY KEY (id);

alter table "public"."fb_reservation_alerts" add constraint "fb_reservation_alerts_reservation_id_key" UNIQUE (reservation_id);

alter table "public"."reservation_change_alerts" add constraint "reservation_change_alerts_event_type_check" CHECK ((event_type = ANY (ARRAY['modified'::text, 'cancelled'::text])));

alter table "public"."reservation_change_alerts" add constraint "reservation_change_alerts_pkey" PRIMARY KEY (id);

alter table "public"."reservation_tables" add constraint "reservation_tables_pkey" PRIMARY KEY (reservation_id, table_id);

alter table "public"."reservations" add constraint "reservations_check" CHECK ((ends_at > starts_at));

alter table "public"."reservations" add constraint "reservations_guest_name_check" CHECK ((length(TRIM(BOTH FROM guest_name)) > 0));

alter table "public"."reservations" add constraint "reservations_party_size_check" CHECK (((party_size >= 1) AND (party_size <= 50)));

alter table "public"."reservations" add constraint "reservations_pkey" PRIMARY KEY (id);

alter table "public"."reservations" add constraint "reservations_restaurant_id_id_key" UNIQUE (restaurant_id, id);

alter table "public"."reservations" add constraint "reservations_status_check" CHECK ((status = ANY (ARRAY['reserved'::text, 'confirmed'::text, 'late'::text, 'arrived'::text, 'seated'::text, 'completed'::text, 'released'::text, 'departed'::text, 'cancelled'::text, 'no_show'::text])));

alter table "public"."reservations" add constraint "reservations_walkin_type_check" CHECK ((walkin_type = ANY (ARRAY['hotel'::text, 'exterieur'::text])));

alter table "public"."restaurant_hours" add constraint "restaurant_hours_check" CHECK (((lunch_start < lunch_end) AND (dinner_start < dinner_end)));

alter table "public"."restaurant_hours" add constraint "restaurant_hours_check1" CHECK (((NOT (lunch_enabled AND dinner_enabled)) OR (lunch_end < dinner_start)));

alter table "public"."restaurant_hours" add constraint "restaurant_hours_duration_check" CHECK ((duration = ANY (ARRAY[30, 45, 60, 75, 90, 105, 120, 150, 180])));

alter table "public"."restaurant_hours" add constraint "restaurant_hours_id_check" CHECK ((id = 1));

alter table "public"."restaurant_hours" add constraint "restaurant_hours_pkey" PRIMARY KEY (restaurant_id, id);

alter table "public"."restaurant_rooms" add constraint "restaurant_rooms_pkey" PRIMARY KEY (id);

alter table "public"."restaurant_rooms" add constraint "restaurant_rooms_restaurant_id_id_key" UNIQUE (restaurant_id, id);

alter table "public"."restaurant_rooms" add constraint "restaurant_rooms_restaurant_id_name_key" UNIQUE (restaurant_id, name);

alter table "public"."restaurant_service_changes" add constraint "restaurant_service_changes_pkey" PRIMARY KEY (restaurant_id);

alter table "public"."restaurant_tables" add constraint "restaurant_tables_pkey" PRIMARY KEY (id);

alter table "public"."restaurant_tables" add constraint "restaurant_tables_restaurant_id_id_key" UNIQUE (restaurant_id, id);

alter table "public"."restaurant_tables" add constraint "restaurant_tables_restaurant_id_label_key" UNIQUE (restaurant_id, label);

alter table "public"."restaurant_tables" add constraint "restaurant_tables_room_id_label_key" UNIQUE (room_id, label);

alter table "public"."restaurant_tables" add constraint "restaurant_tables_seats_check" CHECK (((seats >= 1) AND (seats <= 50)));

alter table "public"."restaurants" add constraint "restaurants_name_check" CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)));

alter table "public"."restaurants" add constraint "restaurants_pkey" PRIMARY KEY (id);

alter table "public"."service_closures" add constraint "service_closures_close_mode_check" CHECK ((close_mode = ANY (ARRAY['manual'::text, 'automatic'::text])));

alter table "public"."service_closures" add constraint "service_closures_pkey" PRIMARY KEY (id);

alter table "public"."service_closures" add constraint "service_closures_restaurant_id_service_date_key" UNIQUE (restaurant_id, service_date);

alter table "public"."staff_password_reset_audit" add constraint "staff_password_reset_audit_action_check" CHECK ((action = 'password_reset'::text));

alter table "public"."staff_password_reset_audit" add constraint "staff_password_reset_audit_pkey" PRIMARY KEY (id);

alter table "public"."staff_profiles" add constraint "staff_profiles_pkey" PRIMARY KEY (user_id);

alter table "public"."staff_profiles" add constraint "staff_profiles_role_check" CHECK ((role = ANY (ARRAY['reception'::text, 'fb_admin'::text])));

alter table "public"."table_fusion_links" add constraint "distinct_fusion_tables" CHECK ((table_a < table_b));

alter table "public"."table_fusion_links" add constraint "table_fusion_links_pkey" PRIMARY KEY (table_a, table_b);

alter table "public"."table_holds" add constraint "table_holds_check" CHECK ((ends_at > starts_at));

alter table "public"."table_holds" add constraint "table_holds_draft_role_check" CHECK ((draft_role = ANY (ARRAY['fb_admin'::text, 'reception'::text])));

alter table "public"."table_holds" add constraint "table_holds_pkey" PRIMARY KEY (id);

alter table "private"."booking_drafts_v3" add constraint "booking_drafts_v3_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."fb_reservation_alerts" add constraint "fb_reservation_alerts_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;

alter table "public"."fb_reservation_alerts" add constraint "fb_reservation_alerts_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."fb_reservation_alerts" add constraint "fb_reservation_alerts_restaurant_id_reservation_id_fkey" FOREIGN KEY (restaurant_id, reservation_id) REFERENCES reservations(restaurant_id, id) ON DELETE CASCADE;

alter table "public"."reservation_tables" add constraint "reservation_tables_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;

alter table "public"."reservation_tables" add constraint "reservation_tables_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."reservation_tables" add constraint "reservation_tables_restaurant_id_reservation_id_fkey" FOREIGN KEY (restaurant_id, reservation_id) REFERENCES reservations(restaurant_id, id) ON DELETE CASCADE;

alter table "public"."reservation_tables" add constraint "reservation_tables_restaurant_id_table_id_fkey" FOREIGN KEY (restaurant_id, table_id) REFERENCES restaurant_tables(restaurant_id, id);

alter table "public"."reservation_tables" add constraint "reservation_tables_table_id_fkey" FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE RESTRICT;

alter table "public"."reservations" add constraint "reservations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table "public"."reservations" add constraint "reservations_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."restaurant_hours" add constraint "restaurant_hours_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."restaurant_rooms" add constraint "restaurant_rooms_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."restaurant_service_changes" add constraint "restaurant_service_changes_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."restaurant_tables" add constraint "restaurant_tables_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."restaurant_tables" add constraint "restaurant_tables_restaurant_id_room_id_fkey" FOREIGN KEY (restaurant_id, room_id) REFERENCES restaurant_rooms(restaurant_id, id);

alter table "public"."restaurant_tables" add constraint "restaurant_tables_room_id_fkey" FOREIGN KEY (room_id) REFERENCES restaurant_rooms(id) ON DELETE RESTRICT;

alter table "public"."staff_password_reset_audit" add constraint "staff_password_reset_audit_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

alter table "public"."staff_password_reset_audit" add constraint "staff_password_reset_audit_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."staff_password_reset_audit" add constraint "staff_password_reset_audit_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth.users(id);

alter table "public"."staff_profiles" add constraint "staff_profiles_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."staff_profiles" add constraint "staff_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."table_fusion_links" add constraint "table_fusion_links_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."table_fusion_links" add constraint "table_fusion_links_restaurant_id_table_a_fkey" FOREIGN KEY (restaurant_id, table_a) REFERENCES restaurant_tables(restaurant_id, id) ON DELETE CASCADE;

alter table "public"."table_fusion_links" add constraint "table_fusion_links_restaurant_id_table_b_fkey" FOREIGN KEY (restaurant_id, table_b) REFERENCES restaurant_tables(restaurant_id, id) ON DELETE CASCADE;

alter table "public"."table_fusion_links" add constraint "table_fusion_links_table_a_fkey" FOREIGN KEY (table_a) REFERENCES restaurant_tables(id) ON DELETE CASCADE;

alter table "public"."table_fusion_links" add constraint "table_fusion_links_table_b_fkey" FOREIGN KEY (table_b) REFERENCES restaurant_tables(id) ON DELETE CASCADE;

alter table "public"."table_holds" add constraint "table_holds_held_by_fkey" FOREIGN KEY (held_by) REFERENCES auth.users(id);

alter table "public"."table_holds" add constraint "table_holds_restaurant_id_fkey" FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);

alter table "public"."table_holds" add constraint "table_holds_restaurant_id_table_id_fkey" FOREIGN KEY (restaurant_id, table_id) REFERENCES restaurant_tables(restaurant_id, id);

alter table "public"."table_holds" add constraint "table_holds_table_id_fkey" FOREIGN KEY (table_id) REFERENCES restaurant_tables(id);

alter function "public"."rls_auto_enable"() owner to "postgres";

revoke all on function "public"."rls_auto_enable"() from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."rls_auto_enable"() to "postgres";

alter function "private"."current_staff_role"() owner to "postgres";

revoke all on function "private"."current_staff_role"() from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."current_staff_role"() to "postgres";

grant EXECUTE on function "private"."current_staff_role"() to "authenticated";

grant EXECUTE on function "private"."current_staff_role"() to "resto_service_writer";

alter function "private"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) owner to "resto_service_writer";

revoke all on function "private"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) to "resto_service_writer";

alter function "private"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";

revoke all on function "private"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";

alter function "public"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) owner to "postgres";

revoke all on function "public"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) to "postgres";

grant EXECUTE on function "public"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) to "resto_service_writer";

alter function "public"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "postgres";

revoke all on function "public"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "postgres";

grant EXECUTE on function "public"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";

alter function "public"."release_table_hold"(p_hold_id uuid) owner to "postgres";

revoke all on function "public"."release_table_hold"(p_hold_id uuid) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."release_table_hold"(p_hold_id uuid) to "postgres";

grant EXECUTE on function "public"."release_table_hold"(p_hold_id uuid) to "resto_service_writer";

alter function "public"."release_table_hold_v2"(p_hold_id uuid, p_owner_token uuid) owner to "resto_service_writer";

revoke all on function "public"."release_table_hold_v2"(p_hold_id uuid, p_owner_token uuid) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."release_table_hold_v2"(p_hold_id uuid, p_owner_token uuid) to "resto_service_writer";

grant EXECUTE on function "public"."release_table_hold_v2"(p_hold_id uuid, p_owner_token uuid) to "authenticated";

alter function "public"."cancel_reservation_v3"(p_reservation_id uuid) owner to "resto_service_writer";

revoke all on function "public"."cancel_reservation_v3"(p_reservation_id uuid) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."cancel_reservation_v3"(p_reservation_id uuid) to "resto_service_writer";

grant EXECUTE on function "public"."cancel_reservation_v3"(p_reservation_id uuid) to "authenticated";

alter function "public"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) owner to "resto_service_writer";

revoke all on function "public"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) to "resto_service_writer";

grant EXECUTE on function "public"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) to "authenticated";

alter function "public"."delete_cancelled_reservation_v3"(p_reservation_id uuid) owner to "resto_service_writer";

revoke all on function "public"."delete_cancelled_reservation_v3"(p_reservation_id uuid) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."delete_cancelled_reservation_v3"(p_reservation_id uuid) to "resto_service_writer";

grant EXECUTE on function "public"."delete_cancelled_reservation_v3"(p_reservation_id uuid) to "authenticated";

alter function "public"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) owner to "resto_service_writer";

revoke all on function "public"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) to "resto_service_writer";

grant EXECUTE on function "public"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) to "authenticated";

alter function "public"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) owner to "resto_service_writer";

revoke all on function "public"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) to "resto_service_writer";

grant EXECUTE on function "public"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) to "authenticated";

alter function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) owner to "resto_service_writer";

revoke all on function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) to "resto_service_writer";

grant EXECUTE on function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) to "authenticated";

alter function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) owner to "resto_service_writer";

revoke all on function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) to "resto_service_writer";

grant EXECUTE on function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) to "authenticated";

alter function "private"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) owner to "resto_service_writer";

revoke all on function "private"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) to "resto_service_writer";

alter function "public"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";

revoke all on function "public"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";

grant EXECUTE on function "public"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "authenticated";

alter function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) owner to "resto_service_writer";

revoke all on function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) to "resto_service_writer";

grant EXECUTE on function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) to "authenticated";

alter function "public"."change_fusion_link_v3"(p_old uuid[], p_new uuid[]) owner to "postgres";

revoke all on function "public"."change_fusion_link_v3"(p_old uuid[], p_new uuid[]) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."change_fusion_link_v3"(p_old uuid[], p_new uuid[]) to "postgres";

grant EXECUTE on function "public"."change_fusion_link_v3"(p_old uuid[], p_new uuid[]) to "authenticated";

grant EXECUTE on function "public"."change_fusion_link_v3"(p_old uuid[], p_new uuid[]) to "resto_service_writer";

alter function "public"."install_walkin_group_v3"(p_tables uuid[], p_guests integer, p_name text, p_type text) owner to "resto_service_writer";

revoke all on function "public"."install_walkin_group_v3"(p_tables uuid[], p_guests integer, p_name text, p_type text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."install_walkin_group_v3"(p_tables uuid[], p_guests integer, p_name text, p_type text) to "resto_service_writer";

grant EXECUTE on function "public"."install_walkin_group_v3"(p_tables uuid[], p_guests integer, p_name text, p_type text) to "authenticated";

alter function "public"."confirm_reservation_v2"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) owner to "resto_service_writer";

revoke all on function "public"."confirm_reservation_v2"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."confirm_reservation_v2"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) to "resto_service_writer";

alter function "private"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) owner to "resto_service_writer";

revoke all on function "private"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) to "resto_service_writer";

alter function "private"."cancel_reservation_v3"(p_reservation_id uuid) owner to "resto_service_writer";

revoke all on function "private"."cancel_reservation_v3"(p_reservation_id uuid) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."cancel_reservation_v3"(p_reservation_id uuid) to "resto_service_writer";

alter function "private"."check_fusion_selection"(p_ids uuid[]) owner to "resto_service_writer";

revoke all on function "private"."check_fusion_selection"(p_ids uuid[]) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."check_fusion_selection"(p_ids uuid[]) to PUBLIC;

grant EXECUTE on function "private"."check_fusion_selection"(p_ids uuid[]) to "resto_service_writer";

alter function "private"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) owner to "resto_service_writer";

revoke all on function "private"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) to "resto_service_writer";

alter function "private"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) owner to "resto_service_writer";

revoke all on function "private"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."install_walkin_v3"(p_table uuid, p_guests integer, p_name text, p_type text) to "resto_service_writer";

alter function "private"."notify_fb_on_reception_booking"() owner to "resto_service_writer";

revoke all on function "private"."notify_fb_on_reception_booking"() from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."notify_fb_on_reception_booking"() to PUBLIC;

grant EXECUTE on function "private"."notify_fb_on_reception_booking"() to "resto_service_writer";

alter function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) owner to "postgres";

revoke all on function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) to "postgres";

grant EXECUTE on function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) to "resto_service_writer";

alter function "private"."release_table_hold"(p_hold_id uuid) owner to "resto_service_writer";

revoke all on function "private"."release_table_hold"(p_hold_id uuid) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."release_table_hold"(p_hold_id uuid) to "resto_service_writer";

grant EXECUTE on function "private"."release_table_hold"(p_hold_id uuid) to "authenticated";

alter function "private"."remove_fusions_on_table_room_change"() owner to "resto_service_writer";

revoke all on function "private"."remove_fusions_on_table_room_change"() from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."remove_fusions_on_table_room_change"() to PUBLIC;

grant EXECUTE on function "private"."remove_fusions_on_table_room_change"() to "resto_service_writer";

alter function "private"."staff_restaurant"() owner to "postgres";

revoke all on function "private"."staff_restaurant"() from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."staff_restaurant"() to "postgres";

grant EXECUTE on function "private"."staff_restaurant"() to "authenticated";

grant EXECUTE on function "private"."staff_restaurant"() to "resto_service_writer";

alter function "public"."set_restaurant_table_active_v3"(p_table_id uuid, p_active boolean) owner to "resto_service_writer";

revoke all on function "public"."set_restaurant_table_active_v3"(p_table_id uuid, p_active boolean) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."set_restaurant_table_active_v3"(p_table_id uuid, p_active boolean) to "resto_service_writer";

grant EXECUTE on function "public"."set_restaurant_table_active_v3"(p_table_id uuid, p_active boolean) to "authenticated";

alter function "private"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";

revoke all on function "private"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";

alter function "private"."validate_table_fusion_link"() owner to "resto_service_writer";

revoke all on function "private"."validate_table_fusion_link"() from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."validate_table_fusion_link"() to PUBLIC;

grant EXECUTE on function "private"."validate_table_fusion_link"() to "resto_service_writer";

alter function "private"."initialize_restaurant_hours"() owner to "postgres";

revoke all on function "private"."initialize_restaurant_hours"() from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."initialize_restaurant_hours"() to "postgres";

alter function "public"."create_restaurant_table_v3"(p_label text, p_seats integer, p_room_id uuid) owner to "resto_service_writer";

revoke all on function "public"."create_restaurant_table_v3"(p_label text, p_seats integer, p_room_id uuid) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."create_restaurant_table_v3"(p_label text, p_seats integer, p_room_id uuid) to "resto_service_writer";

grant EXECUTE on function "public"."create_restaurant_table_v3"(p_label text, p_seats integer, p_room_id uuid) to "authenticated";

alter function "public"."update_restaurant_table_v3"(p_table_id uuid, p_label text, p_seats integer, p_room_id uuid) owner to "resto_service_writer";

revoke all on function "public"."update_restaurant_table_v3"(p_table_id uuid, p_label text, p_seats integer, p_room_id uuid) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."update_restaurant_table_v3"(p_table_id uuid, p_label text, p_seats integer, p_room_id uuid) to "resto_service_writer";

grant EXECUTE on function "public"."update_restaurant_table_v3"(p_table_id uuid, p_label text, p_seats integer, p_room_id uuid) to "authenticated";

alter function "private"."signal_restaurant_change"() owner to "postgres";

revoke all on function "private"."signal_restaurant_change"() from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."signal_restaurant_change"() to "postgres";

alter function "private"."notify_fb_on_reception_change"() owner to "postgres";

revoke all on function "private"."notify_fb_on_reception_change"() from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."notify_fb_on_reception_change"() to "postgres";

alter function "public"."close_service_v3"(p_date date, p_mode text) owner to "postgres";

revoke all on function "public"."close_service_v3"(p_date date, p_mode text) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."close_service_v3"(p_date date, p_mode text) to "postgres";

grant EXECUTE on function "public"."close_service_v3"(p_date date, p_mode text) to "authenticated";

alter function "private"."guard_closed_service_reservations"() owner to "postgres";

revoke all on function "private"."guard_closed_service_reservations"() from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "private"."guard_closed_service_reservations"() to "postgres";

alter function "public"."apply_smart_placement_v3"(p_target_reservation_id uuid, p_changes jsonb) owner to "postgres";

revoke all on function "public"."apply_smart_placement_v3"(p_target_reservation_id uuid, p_changes jsonb) from public,anon,authenticated,resto_service_writer;

grant EXECUTE on function "public"."apply_smart_placement_v3"(p_target_reservation_id uuid, p_changes jsonb) to "postgres";

grant EXECUTE on function "public"."apply_smart_placement_v3"(p_target_reservation_id uuid, p_changes jsonb) to "authenticated";

grant SELECT on "public"."restaurant_hours" to "authenticated";

grant UPDATE on "public"."restaurant_hours" to "authenticated";

grant INSERT on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT on "public"."restaurant_hours" to "resto_service_writer";

grant UPDATE on "public"."restaurant_hours" to "resto_service_writer";

grant DELETE on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT on "public"."reservation_change_alerts" to "authenticated";

grant SELECT on "public"."service_closures" to "authenticated";

grant SELECT on "public"."restaurants" to "authenticated";

grant SELECT on "public"."staff_profiles" to "authenticated";

grant TRUNCATE on "public"."staff_profiles" to "authenticated";

grant REFERENCES on "public"."staff_profiles" to "authenticated";

grant TRIGGER on "public"."staff_profiles" to "authenticated";

grant SELECT on "public"."staff_profiles" to "resto_service_writer";

grant INSERT on "public"."restaurant_rooms" to "authenticated";

grant SELECT on "public"."restaurant_rooms" to "authenticated";

grant UPDATE on "public"."restaurant_rooms" to "authenticated";

grant INSERT on "public"."restaurant_rooms" to "resto_service_writer";

grant SELECT on "public"."restaurant_rooms" to "resto_service_writer";

grant UPDATE on "public"."restaurant_rooms" to "resto_service_writer";

grant DELETE on "public"."restaurant_rooms" to "resto_service_writer";

grant INSERT on "public"."restaurant_tables" to "authenticated";

grant SELECT on "public"."restaurant_tables" to "authenticated";

grant UPDATE on "public"."restaurant_tables" to "authenticated";

grant INSERT on "public"."restaurant_tables" to "resto_service_writer";

grant SELECT on "public"."restaurant_tables" to "resto_service_writer";

grant UPDATE on "public"."restaurant_tables" to "resto_service_writer";

grant DELETE on "public"."restaurant_tables" to "resto_service_writer";

grant SELECT on "public"."reservations" to "authenticated";

grant INSERT on "public"."reservations" to "resto_service_writer";

grant SELECT on "public"."reservations" to "resto_service_writer";

grant UPDATE on "public"."reservations" to "resto_service_writer";

grant DELETE on "public"."reservations" to "resto_service_writer";

grant SELECT on "public"."reservation_tables" to "authenticated";

grant INSERT on "public"."reservation_tables" to "resto_service_writer";

grant SELECT on "public"."reservation_tables" to "resto_service_writer";

grant UPDATE on "public"."reservation_tables" to "resto_service_writer";

grant DELETE on "public"."reservation_tables" to "resto_service_writer";

grant INSERT on "public"."table_holds" to "resto_service_writer";

grant SELECT on "public"."table_holds" to "resto_service_writer";

grant UPDATE on "public"."table_holds" to "resto_service_writer";

grant DELETE on "public"."table_holds" to "resto_service_writer";

grant TRUNCATE on "public"."table_fusion_links" to "anon";

grant REFERENCES on "public"."table_fusion_links" to "anon";

grant TRIGGER on "public"."table_fusion_links" to "anon";

grant INSERT on "public"."table_fusion_links" to "authenticated";

grant SELECT on "public"."table_fusion_links" to "authenticated";

grant DELETE on "public"."table_fusion_links" to "authenticated";

grant TRUNCATE on "public"."table_fusion_links" to "authenticated";

grant REFERENCES on "public"."table_fusion_links" to "authenticated";

grant TRIGGER on "public"."table_fusion_links" to "authenticated";

grant INSERT on "public"."table_fusion_links" to "resto_service_writer";

grant SELECT on "public"."table_fusion_links" to "resto_service_writer";

grant UPDATE on "public"."table_fusion_links" to "resto_service_writer";

grant DELETE on "public"."table_fusion_links" to "resto_service_writer";

grant TRUNCATE on "public"."fb_reservation_alerts" to "anon";

grant REFERENCES on "public"."fb_reservation_alerts" to "anon";

grant TRIGGER on "public"."fb_reservation_alerts" to "anon";

grant SELECT on "public"."fb_reservation_alerts" to "authenticated";

grant TRUNCATE on "public"."fb_reservation_alerts" to "authenticated";

grant REFERENCES on "public"."fb_reservation_alerts" to "authenticated";

grant TRIGGER on "public"."fb_reservation_alerts" to "authenticated";

grant INSERT on "public"."fb_reservation_alerts" to "resto_service_writer";

grant SELECT on "public"."fb_reservation_alerts" to "resto_service_writer";

grant UPDATE on "public"."fb_reservation_alerts" to "resto_service_writer";

grant DELETE on "public"."fb_reservation_alerts" to "resto_service_writer";

grant INSERT on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE on "private"."booking_drafts_v3" to "resto_service_writer";

grant DELETE on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT on "public"."restaurant_service_changes" to "authenticated";

grant REFERENCES("created_at") on "public"."fb_reservation_alerts" to "anon";

grant REFERENCES("created_at") on "public"."table_fusion_links" to "anon";

grant REFERENCES("guest_name") on "public"."fb_reservation_alerts" to "anon";

grant REFERENCES("hotel_room") on "public"."fb_reservation_alerts" to "anon";

grant REFERENCES("id") on "public"."fb_reservation_alerts" to "anon";

grant REFERENCES("party_size") on "public"."fb_reservation_alerts" to "anon";

grant REFERENCES("read_at") on "public"."fb_reservation_alerts" to "anon";

grant REFERENCES("reservation_id") on "public"."fb_reservation_alerts" to "anon";

grant REFERENCES("restaurant_id") on "public"."fb_reservation_alerts" to "anon";

grant REFERENCES("restaurant_id") on "public"."table_fusion_links" to "anon";

grant REFERENCES("starts_at") on "public"."fb_reservation_alerts" to "anon";

grant REFERENCES("table_a") on "public"."table_fusion_links" to "anon";

grant REFERENCES("table_b") on "public"."table_fusion_links" to "anon";

grant INSERT("active") on "public"."restaurant_rooms" to "authenticated";

grant SELECT("active") on "public"."restaurant_rooms" to "authenticated";

grant UPDATE("active") on "public"."restaurant_rooms" to "authenticated";

grant INSERT("active") on "public"."restaurant_tables" to "authenticated";

grant SELECT("active") on "public"."restaurant_tables" to "authenticated";

grant UPDATE("active") on "public"."restaurant_tables" to "authenticated";

grant REFERENCES("active") on "public"."staff_profiles" to "authenticated";

grant SELECT("active") on "public"."staff_profiles" to "authenticated";

grant SELECT("arrived_at") on "public"."reservations" to "authenticated";

grant SELECT("cancelled_groups") on "public"."service_closures" to "authenticated";

grant SELECT("changed_fields") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("close_mode") on "public"."service_closures" to "authenticated";

grant SELECT("closed_at") on "public"."service_closures" to "authenticated";

grant SELECT("closed_by") on "public"."service_closures" to "authenticated";

grant SELECT("confirmed_at") on "public"."reservations" to "authenticated";

grant REFERENCES("created_at") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("created_at") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("created_at") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("created_at") on "public"."reservations" to "authenticated";

grant REFERENCES("created_at") on "public"."staff_profiles" to "authenticated";

grant SELECT("created_at") on "public"."staff_profiles" to "authenticated";

grant INSERT("created_at") on "public"."table_fusion_links" to "authenticated";

grant REFERENCES("created_at") on "public"."table_fusion_links" to "authenticated";

grant SELECT("created_at") on "public"."table_fusion_links" to "authenticated";

grant SELECT("created_at") on "public"."table_holds" to "authenticated";

grant SELECT("created_by") on "public"."reservations" to "authenticated";

grant SELECT("dinner_enabled") on "public"."restaurant_hours" to "authenticated";

grant UPDATE("dinner_enabled") on "public"."restaurant_hours" to "authenticated";

grant SELECT("dinner_end") on "public"."restaurant_hours" to "authenticated";

grant UPDATE("dinner_end") on "public"."restaurant_hours" to "authenticated";

grant SELECT("dinner_start") on "public"."restaurant_hours" to "authenticated";

grant UPDATE("dinner_start") on "public"."restaurant_hours" to "authenticated";

grant REFERENCES("display_name") on "public"."staff_profiles" to "authenticated";

grant SELECT("display_name") on "public"."staff_profiles" to "authenticated";

grant SELECT("draft_role") on "public"."table_holds" to "authenticated";

grant SELECT("duration") on "public"."restaurant_hours" to "authenticated";

grant UPDATE("duration") on "public"."restaurant_hours" to "authenticated";

grant SELECT("ends_at") on "public"."reservations" to "authenticated";

grant SELECT("ends_at") on "public"."table_holds" to "authenticated";

grant SELECT("event_type") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("expires_at") on "public"."table_holds" to "authenticated";

grant REFERENCES("guest_name") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("guest_name") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("guest_name") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("guest_name") on "public"."reservations" to "authenticated";

grant SELECT("held_by") on "public"."table_holds" to "authenticated";

grant SELECT("hotel_covers") on "public"."service_closures" to "authenticated";

grant REFERENCES("hotel_room") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("hotel_room") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("hotel_room") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("hotel_room") on "public"."reservations" to "authenticated";

grant REFERENCES("id") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("id") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("id") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("id") on "public"."reservations" to "authenticated";

grant SELECT("id") on "public"."restaurant_hours" to "authenticated";

grant UPDATE("id") on "public"."restaurant_hours" to "authenticated";

grant INSERT("id") on "public"."restaurant_rooms" to "authenticated";

grant SELECT("id") on "public"."restaurant_rooms" to "authenticated";

grant UPDATE("id") on "public"."restaurant_rooms" to "authenticated";

grant INSERT("id") on "public"."restaurant_tables" to "authenticated";

grant SELECT("id") on "public"."restaurant_tables" to "authenticated";

grant UPDATE("id") on "public"."restaurant_tables" to "authenticated";

grant SELECT("id") on "public"."restaurants" to "authenticated";

grant SELECT("id") on "public"."service_closures" to "authenticated";

grant SELECT("id") on "public"."table_holds" to "authenticated";

grant INSERT("label") on "public"."restaurant_tables" to "authenticated";

grant SELECT("label") on "public"."restaurant_tables" to "authenticated";

grant UPDATE("label") on "public"."restaurant_tables" to "authenticated";

grant SELECT("lunch_enabled") on "public"."restaurant_hours" to "authenticated";

grant UPDATE("lunch_enabled") on "public"."restaurant_hours" to "authenticated";

grant SELECT("lunch_end") on "public"."restaurant_hours" to "authenticated";

grant UPDATE("lunch_end") on "public"."restaurant_hours" to "authenticated";

grant SELECT("lunch_start") on "public"."restaurant_hours" to "authenticated";

grant UPDATE("lunch_start") on "public"."restaurant_hours" to "authenticated";

grant INSERT("name") on "public"."restaurant_rooms" to "authenticated";

grant SELECT("name") on "public"."restaurant_rooms" to "authenticated";

grant UPDATE("name") on "public"."restaurant_rooms" to "authenticated";

grant SELECT("name") on "public"."restaurants" to "authenticated";

grant SELECT("no_show_groups") on "public"."service_closures" to "authenticated";

grant SELECT("notes") on "public"."reservations" to "authenticated";

grant REFERENCES("party_size") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("party_size") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("party_size") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("party_size") on "public"."reservations" to "authenticated";

grant SELECT("previous_guest_name") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("previous_hotel_room") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("previous_party_size") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("previous_starts_at") on "public"."reservation_change_alerts" to "authenticated";

grant REFERENCES("read_at") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("read_at") on "public"."fb_reservation_alerts" to "authenticated";

grant UPDATE("read_at") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("read_at") on "public"."reservation_change_alerts" to "authenticated";

grant UPDATE("read_at") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("released_at") on "public"."reservations" to "authenticated";

grant REFERENCES("reservation_id") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("reservation_id") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("reservation_id") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("reservation_id") on "public"."reservation_tables" to "authenticated";

grant REFERENCES("restaurant_id") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("restaurant_id") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("restaurant_id") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("restaurant_id") on "public"."reservation_tables" to "authenticated";

grant SELECT("restaurant_id") on "public"."reservations" to "authenticated";

grant SELECT("restaurant_id") on "public"."restaurant_hours" to "authenticated";

grant UPDATE("restaurant_id") on "public"."restaurant_hours" to "authenticated";

grant INSERT("restaurant_id") on "public"."restaurant_rooms" to "authenticated";

grant SELECT("restaurant_id") on "public"."restaurant_rooms" to "authenticated";

grant UPDATE("restaurant_id") on "public"."restaurant_rooms" to "authenticated";

grant SELECT("restaurant_id") on "public"."restaurant_service_changes" to "authenticated";

grant INSERT("restaurant_id") on "public"."restaurant_tables" to "authenticated";

grant SELECT("restaurant_id") on "public"."restaurant_tables" to "authenticated";

grant UPDATE("restaurant_id") on "public"."restaurant_tables" to "authenticated";

grant SELECT("restaurant_id") on "public"."service_closures" to "authenticated";

grant REFERENCES("restaurant_id") on "public"."staff_profiles" to "authenticated";

grant SELECT("restaurant_id") on "public"."staff_profiles" to "authenticated";

grant INSERT("restaurant_id") on "public"."table_fusion_links" to "authenticated";

grant REFERENCES("restaurant_id") on "public"."table_fusion_links" to "authenticated";

grant SELECT("restaurant_id") on "public"."table_fusion_links" to "authenticated";

grant SELECT("revision") on "public"."restaurant_service_changes" to "authenticated";

grant REFERENCES("role") on "public"."staff_profiles" to "authenticated";

grant SELECT("role") on "public"."staff_profiles" to "authenticated";

grant INSERT("room_id") on "public"."restaurant_tables" to "authenticated";

grant SELECT("room_id") on "public"."restaurant_tables" to "authenticated";

grant UPDATE("room_id") on "public"."restaurant_tables" to "authenticated";

grant SELECT("seated_at") on "public"."reservations" to "authenticated";

grant INSERT("seats") on "public"."restaurant_tables" to "authenticated";

grant SELECT("seats") on "public"."restaurant_tables" to "authenticated";

grant UPDATE("seats") on "public"."restaurant_tables" to "authenticated";

grant SELECT("served_covers") on "public"."service_closures" to "authenticated";

grant SELECT("served_groups") on "public"."service_closures" to "authenticated";

grant SELECT("service_date") on "public"."service_closures" to "authenticated";

grant INSERT("sort_order") on "public"."restaurant_rooms" to "authenticated";

grant SELECT("sort_order") on "public"."restaurant_rooms" to "authenticated";

grant UPDATE("sort_order") on "public"."restaurant_rooms" to "authenticated";

grant REFERENCES("starts_at") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("starts_at") on "public"."fb_reservation_alerts" to "authenticated";

grant SELECT("starts_at") on "public"."reservation_change_alerts" to "authenticated";

grant SELECT("starts_at") on "public"."reservations" to "authenticated";

grant SELECT("starts_at") on "public"."table_holds" to "authenticated";

grant SELECT("status") on "public"."reservations" to "authenticated";

grant INSERT("table_a") on "public"."table_fusion_links" to "authenticated";

grant REFERENCES("table_a") on "public"."table_fusion_links" to "authenticated";

grant SELECT("table_a") on "public"."table_fusion_links" to "authenticated";

grant INSERT("table_b") on "public"."table_fusion_links" to "authenticated";

grant REFERENCES("table_b") on "public"."table_fusion_links" to "authenticated";

grant SELECT("table_b") on "public"."table_fusion_links" to "authenticated";

grant SELECT("table_id") on "public"."reservation_tables" to "authenticated";

grant SELECT("table_id") on "public"."table_holds" to "authenticated";

grant SELECT("updated_at") on "public"."reservations" to "authenticated";

grant REFERENCES("user_id") on "public"."staff_profiles" to "authenticated";

grant SELECT("user_id") on "public"."staff_profiles" to "authenticated";

grant SELECT("walkin_covers") on "public"."service_closures" to "authenticated";

grant SELECT("walkin_type") on "public"."reservations" to "authenticated";

grant INSERT("active") on "public"."restaurant_rooms" to "resto_service_writer";

grant SELECT("active") on "public"."restaurant_rooms" to "resto_service_writer";

grant UPDATE("active") on "public"."restaurant_rooms" to "resto_service_writer";

grant INSERT("active") on "public"."restaurant_tables" to "resto_service_writer";

grant SELECT("active") on "public"."restaurant_tables" to "resto_service_writer";

grant UPDATE("active") on "public"."restaurant_tables" to "resto_service_writer";

grant SELECT("active") on "public"."staff_profiles" to "resto_service_writer";

grant INSERT("arrived_at") on "public"."reservations" to "resto_service_writer";

grant SELECT("arrived_at") on "public"."reservations" to "resto_service_writer";

grant UPDATE("arrived_at") on "public"."reservations" to "resto_service_writer";

grant INSERT("booking") on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT("booking") on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE("booking") on "private"."booking_drafts_v3" to "resto_service_writer";

grant INSERT("confirmed_at") on "public"."reservations" to "resto_service_writer";

grant SELECT("confirmed_at") on "public"."reservations" to "resto_service_writer";

grant UPDATE("confirmed_at") on "public"."reservations" to "resto_service_writer";

grant INSERT("created_at") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant SELECT("created_at") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant UPDATE("created_at") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant INSERT("created_at") on "public"."reservations" to "resto_service_writer";

grant SELECT("created_at") on "public"."reservations" to "resto_service_writer";

grant UPDATE("created_at") on "public"."reservations" to "resto_service_writer";

grant SELECT("created_at") on "public"."staff_profiles" to "resto_service_writer";

grant INSERT("created_at") on "public"."table_fusion_links" to "resto_service_writer";

grant SELECT("created_at") on "public"."table_fusion_links" to "resto_service_writer";

grant UPDATE("created_at") on "public"."table_fusion_links" to "resto_service_writer";

grant INSERT("created_at") on "public"."table_holds" to "resto_service_writer";

grant SELECT("created_at") on "public"."table_holds" to "resto_service_writer";

grant UPDATE("created_at") on "public"."table_holds" to "resto_service_writer";

grant INSERT("created_by") on "public"."reservations" to "resto_service_writer";

grant SELECT("created_by") on "public"."reservations" to "resto_service_writer";

grant UPDATE("created_by") on "public"."reservations" to "resto_service_writer";

grant INSERT("dinner_enabled") on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT("dinner_enabled") on "public"."restaurant_hours" to "resto_service_writer";

grant UPDATE("dinner_enabled") on "public"."restaurant_hours" to "resto_service_writer";

grant INSERT("dinner_end") on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT("dinner_end") on "public"."restaurant_hours" to "resto_service_writer";

grant UPDATE("dinner_end") on "public"."restaurant_hours" to "resto_service_writer";

grant INSERT("dinner_start") on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT("dinner_start") on "public"."restaurant_hours" to "resto_service_writer";

grant UPDATE("dinner_start") on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT("display_name") on "public"."staff_profiles" to "resto_service_writer";

grant INSERT("draft_role") on "public"."table_holds" to "resto_service_writer";

grant SELECT("draft_role") on "public"."table_holds" to "resto_service_writer";

grant UPDATE("draft_role") on "public"."table_holds" to "resto_service_writer";

grant INSERT("duration") on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT("duration") on "public"."restaurant_hours" to "resto_service_writer";

grant UPDATE("duration") on "public"."restaurant_hours" to "resto_service_writer";

grant INSERT("ends") on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT("ends") on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE("ends") on "private"."booking_drafts_v3" to "resto_service_writer";

grant INSERT("ends_at") on "public"."reservations" to "resto_service_writer";

grant SELECT("ends_at") on "public"."reservations" to "resto_service_writer";

grant UPDATE("ends_at") on "public"."reservations" to "resto_service_writer";

grant INSERT("ends_at") on "public"."table_holds" to "resto_service_writer";

grant SELECT("ends_at") on "public"."table_holds" to "resto_service_writer";

grant UPDATE("ends_at") on "public"."table_holds" to "resto_service_writer";

grant INSERT("expires") on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT("expires") on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE("expires") on "private"."booking_drafts_v3" to "resto_service_writer";

grant INSERT("expires_at") on "public"."table_holds" to "resto_service_writer";

grant SELECT("expires_at") on "public"."table_holds" to "resto_service_writer";

grant UPDATE("expires_at") on "public"."table_holds" to "resto_service_writer";

grant INSERT("guest_name") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant SELECT("guest_name") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant UPDATE("guest_name") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant INSERT("guest_name") on "public"."reservations" to "resto_service_writer";

grant SELECT("guest_name") on "public"."reservations" to "resto_service_writer";

grant UPDATE("guest_name") on "public"."reservations" to "resto_service_writer";

grant INSERT("guests") on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT("guests") on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE("guests") on "private"."booking_drafts_v3" to "resto_service_writer";

grant INSERT("held_by") on "public"."table_holds" to "resto_service_writer";

grant SELECT("held_by") on "public"."table_holds" to "resto_service_writer";

grant UPDATE("held_by") on "public"."table_holds" to "resto_service_writer";

grant INSERT("hotel_room") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant SELECT("hotel_room") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant UPDATE("hotel_room") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant INSERT("hotel_room") on "public"."reservations" to "resto_service_writer";

grant SELECT("hotel_room") on "public"."reservations" to "resto_service_writer";

grant UPDATE("hotel_room") on "public"."reservations" to "resto_service_writer";

grant INSERT("id") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant SELECT("id") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant UPDATE("id") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant INSERT("id") on "public"."reservations" to "resto_service_writer";

grant SELECT("id") on "public"."reservations" to "resto_service_writer";

grant UPDATE("id") on "public"."reservations" to "resto_service_writer";

grant INSERT("id") on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT("id") on "public"."restaurant_hours" to "resto_service_writer";

grant UPDATE("id") on "public"."restaurant_hours" to "resto_service_writer";

grant INSERT("id") on "public"."restaurant_rooms" to "resto_service_writer";

grant SELECT("id") on "public"."restaurant_rooms" to "resto_service_writer";

grant UPDATE("id") on "public"."restaurant_rooms" to "resto_service_writer";

grant INSERT("id") on "public"."restaurant_tables" to "resto_service_writer";

grant SELECT("id") on "public"."restaurant_tables" to "resto_service_writer";

grant UPDATE("id") on "public"."restaurant_tables" to "resto_service_writer";

grant INSERT("id") on "public"."table_holds" to "resto_service_writer";

grant SELECT("id") on "public"."table_holds" to "resto_service_writer";

grant UPDATE("id") on "public"."table_holds" to "resto_service_writer";

grant INSERT("ids") on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT("ids") on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE("ids") on "private"."booking_drafts_v3" to "resto_service_writer";

grant INSERT("key") on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT("key") on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE("key") on "private"."booking_drafts_v3" to "resto_service_writer";

grant INSERT("label") on "public"."restaurant_tables" to "resto_service_writer";

grant SELECT("label") on "public"."restaurant_tables" to "resto_service_writer";

grant UPDATE("label") on "public"."restaurant_tables" to "resto_service_writer";

grant INSERT("lock_token") on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT("lock_token") on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE("lock_token") on "private"."booking_drafts_v3" to "resto_service_writer";

grant INSERT("lunch_enabled") on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT("lunch_enabled") on "public"."restaurant_hours" to "resto_service_writer";

grant UPDATE("lunch_enabled") on "public"."restaurant_hours" to "resto_service_writer";

grant INSERT("lunch_end") on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT("lunch_end") on "public"."restaurant_hours" to "resto_service_writer";

grant UPDATE("lunch_end") on "public"."restaurant_hours" to "resto_service_writer";

grant INSERT("lunch_start") on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT("lunch_start") on "public"."restaurant_hours" to "resto_service_writer";

grant UPDATE("lunch_start") on "public"."restaurant_hours" to "resto_service_writer";

grant INSERT("name") on "public"."restaurant_rooms" to "resto_service_writer";

grant SELECT("name") on "public"."restaurant_rooms" to "resto_service_writer";

grant UPDATE("name") on "public"."restaurant_rooms" to "resto_service_writer";

grant INSERT("notes") on "public"."reservations" to "resto_service_writer";

grant SELECT("notes") on "public"."reservations" to "resto_service_writer";

grant UPDATE("notes") on "public"."reservations" to "resto_service_writer";

grant INSERT("owner_token") on "public"."table_holds" to "resto_service_writer";

grant SELECT("owner_token") on "public"."table_holds" to "resto_service_writer";

grant UPDATE("owner_token") on "public"."table_holds" to "resto_service_writer";

grant INSERT("party_size") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant SELECT("party_size") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant UPDATE("party_size") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant INSERT("party_size") on "public"."reservations" to "resto_service_writer";

grant SELECT("party_size") on "public"."reservations" to "resto_service_writer";

grant UPDATE("party_size") on "public"."reservations" to "resto_service_writer";

grant INSERT("read_at") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant SELECT("read_at") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant UPDATE("read_at") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant INSERT("released_at") on "public"."reservations" to "resto_service_writer";

grant SELECT("released_at") on "public"."reservations" to "resto_service_writer";

grant UPDATE("released_at") on "public"."reservations" to "resto_service_writer";

grant INSERT("reservation_id") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant SELECT("reservation_id") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant UPDATE("reservation_id") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant INSERT("reservation_id") on "public"."reservation_tables" to "resto_service_writer";

grant SELECT("reservation_id") on "public"."reservation_tables" to "resto_service_writer";

grant UPDATE("reservation_id") on "public"."reservation_tables" to "resto_service_writer";

grant INSERT("restaurant_id") on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT("restaurant_id") on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE("restaurant_id") on "private"."booking_drafts_v3" to "resto_service_writer";

grant INSERT("restaurant_id") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant SELECT("restaurant_id") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant UPDATE("restaurant_id") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant INSERT("restaurant_id") on "public"."reservation_tables" to "resto_service_writer";

grant SELECT("restaurant_id") on "public"."reservation_tables" to "resto_service_writer";

grant UPDATE("restaurant_id") on "public"."reservation_tables" to "resto_service_writer";

grant INSERT("restaurant_id") on "public"."reservations" to "resto_service_writer";

grant SELECT("restaurant_id") on "public"."reservations" to "resto_service_writer";

grant UPDATE("restaurant_id") on "public"."reservations" to "resto_service_writer";

grant INSERT("restaurant_id") on "public"."restaurant_hours" to "resto_service_writer";

grant SELECT("restaurant_id") on "public"."restaurant_hours" to "resto_service_writer";

grant UPDATE("restaurant_id") on "public"."restaurant_hours" to "resto_service_writer";

grant INSERT("restaurant_id") on "public"."restaurant_rooms" to "resto_service_writer";

grant SELECT("restaurant_id") on "public"."restaurant_rooms" to "resto_service_writer";

grant UPDATE("restaurant_id") on "public"."restaurant_rooms" to "resto_service_writer";

grant INSERT("restaurant_id") on "public"."restaurant_tables" to "resto_service_writer";

grant SELECT("restaurant_id") on "public"."restaurant_tables" to "resto_service_writer";

grant UPDATE("restaurant_id") on "public"."restaurant_tables" to "resto_service_writer";

grant SELECT("restaurant_id") on "public"."staff_profiles" to "resto_service_writer";

grant INSERT("restaurant_id") on "public"."table_fusion_links" to "resto_service_writer";

grant SELECT("restaurant_id") on "public"."table_fusion_links" to "resto_service_writer";

grant UPDATE("restaurant_id") on "public"."table_fusion_links" to "resto_service_writer";

grant INSERT("restaurant_id") on "public"."table_holds" to "resto_service_writer";

grant SELECT("restaurant_id") on "public"."table_holds" to "resto_service_writer";

grant UPDATE("restaurant_id") on "public"."table_holds" to "resto_service_writer";

grant SELECT("role") on "public"."staff_profiles" to "resto_service_writer";

grant INSERT("room_id") on "public"."restaurant_tables" to "resto_service_writer";

grant SELECT("room_id") on "public"."restaurant_tables" to "resto_service_writer";

grant UPDATE("room_id") on "public"."restaurant_tables" to "resto_service_writer";

grant INSERT("seated_at") on "public"."reservations" to "resto_service_writer";

grant SELECT("seated_at") on "public"."reservations" to "resto_service_writer";

grant UPDATE("seated_at") on "public"."reservations" to "resto_service_writer";

grant INSERT("seats") on "public"."restaurant_tables" to "resto_service_writer";

grant SELECT("seats") on "public"."restaurant_tables" to "resto_service_writer";

grant UPDATE("seats") on "public"."restaurant_tables" to "resto_service_writer";

grant INSERT("sort_order") on "public"."restaurant_rooms" to "resto_service_writer";

grant SELECT("sort_order") on "public"."restaurant_rooms" to "resto_service_writer";

grant UPDATE("sort_order") on "public"."restaurant_rooms" to "resto_service_writer";

grant INSERT("staff") on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT("staff") on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE("staff") on "private"."booking_drafts_v3" to "resto_service_writer";

grant INSERT("starts") on "private"."booking_drafts_v3" to "resto_service_writer";

grant SELECT("starts") on "private"."booking_drafts_v3" to "resto_service_writer";

grant UPDATE("starts") on "private"."booking_drafts_v3" to "resto_service_writer";

grant INSERT("starts_at") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant SELECT("starts_at") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant UPDATE("starts_at") on "public"."fb_reservation_alerts" to "resto_service_writer";

grant INSERT("starts_at") on "public"."reservations" to "resto_service_writer";

grant SELECT("starts_at") on "public"."reservations" to "resto_service_writer";

grant UPDATE("starts_at") on "public"."reservations" to "resto_service_writer";

grant INSERT("starts_at") on "public"."table_holds" to "resto_service_writer";

grant SELECT("starts_at") on "public"."table_holds" to "resto_service_writer";

grant UPDATE("starts_at") on "public"."table_holds" to "resto_service_writer";

grant INSERT("status") on "public"."reservations" to "resto_service_writer";

grant SELECT("status") on "public"."reservations" to "resto_service_writer";

grant UPDATE("status") on "public"."reservations" to "resto_service_writer";

grant INSERT("table_a") on "public"."table_fusion_links" to "resto_service_writer";

grant SELECT("table_a") on "public"."table_fusion_links" to "resto_service_writer";

grant UPDATE("table_a") on "public"."table_fusion_links" to "resto_service_writer";

grant INSERT("table_b") on "public"."table_fusion_links" to "resto_service_writer";

grant SELECT("table_b") on "public"."table_fusion_links" to "resto_service_writer";

grant UPDATE("table_b") on "public"."table_fusion_links" to "resto_service_writer";

grant INSERT("table_id") on "public"."reservation_tables" to "resto_service_writer";

grant SELECT("table_id") on "public"."reservation_tables" to "resto_service_writer";

grant UPDATE("table_id") on "public"."reservation_tables" to "resto_service_writer";

grant INSERT("table_id") on "public"."table_holds" to "resto_service_writer";

grant SELECT("table_id") on "public"."table_holds" to "resto_service_writer";

grant UPDATE("table_id") on "public"."table_holds" to "resto_service_writer";

grant INSERT("updated_at") on "public"."reservations" to "resto_service_writer";

grant SELECT("updated_at") on "public"."reservations" to "resto_service_writer";

grant UPDATE("updated_at") on "public"."reservations" to "resto_service_writer";

grant SELECT("user_id") on "public"."staff_profiles" to "resto_service_writer";

grant INSERT("walkin_type") on "public"."reservations" to "resto_service_writer";

grant SELECT("walkin_type") on "public"."reservations" to "resto_service_writer";

grant UPDATE("walkin_type") on "public"."reservations" to "resto_service_writer";

alter table "public"."restaurant_hours" enable row level security;

alter table "public"."reservation_change_alerts" enable row level security;

alter table "public"."service_closures" enable row level security;

alter table "public"."restaurants" enable row level security;

alter table "public"."staff_password_reset_audit" enable row level security;

alter table "public"."staff_profiles" enable row level security;

alter table "public"."restaurant_rooms" enable row level security;

alter table "public"."restaurant_tables" enable row level security;

alter table "public"."reservations" enable row level security;

alter table "public"."reservation_tables" enable row level security;

alter table "public"."table_holds" enable row level security;

alter table "public"."table_fusion_links" enable row level security;

alter table "public"."fb_reservation_alerts" enable row level security;

alter table "private"."booking_drafts_v3" enable row level security;

alter table "public"."restaurant_service_changes" enable row level security;

create policy "admin_edit" on "public"."restaurant_hours" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)) with check ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));

create policy "same_restaurant" on "public"."restaurant_hours" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

create policy "staff_read" on "public"."restaurant_hours" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['fb_admin'::text, 'reception'::text])));

create policy "writer_access" on "public"."restaurant_hours" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);

create policy "restaurant acknowledges change alerts" on "public"."reservation_change_alerts" as PERMISSIVE for UPDATE to "authenticated" using (((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text))) with check (((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)));

create policy "restaurant reads change alerts" on "public"."reservation_change_alerts" as PERMISSIVE for SELECT to "authenticated" using (((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)));

create policy "restaurant read own service closures" on "public"."service_closures" as PERMISSIVE for SELECT to "authenticated" using (((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)));

create policy "own_restaurant" on "public"."restaurants" as PERMISSIVE for SELECT to "authenticated" using ((id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

create policy "active_profile" on "public"."staff_profiles" as RESTRICTIVE for SELECT to "authenticated" using (active);

create policy "staff_profiles_read_self" on "public"."staff_profiles" as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "writer_profile" on "public"."staff_profiles" as PERMISSIVE for SELECT to "resto_service_writer" using (((user_id = ( SELECT auth.uid() AS uid)) AND active));

create policy "rooms_admin_insert" on "public"."restaurant_rooms" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));

create policy "rooms_admin_update" on "public"."restaurant_rooms" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)) with check ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));

create policy "rooms_staff_read" on "public"."restaurant_rooms" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));

create policy "same_restaurant" on "public"."restaurant_rooms" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

create policy "writer_access" on "public"."restaurant_rooms" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);

create policy "same_restaurant" on "public"."restaurant_tables" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

create policy "tables_admin_insert" on "public"."restaurant_tables" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));

create policy "tables_admin_update" on "public"."restaurant_tables" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)) with check ((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));

create policy "tables_staff_read" on "public"."restaurant_tables" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));

create policy "writer_access" on "public"."restaurant_tables" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);

create policy "reservations_staff_read" on "public"."reservations" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));

create policy "same_restaurant" on "public"."reservations" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

create policy "writer_access" on "public"."reservations" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);

create policy "reservation_tables_staff_read" on "public"."reservation_tables" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));

create policy "same_restaurant" on "public"."reservation_tables" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

create policy "writer_access" on "public"."reservation_tables" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);

create policy "holds_staff_read" on "public"."table_holds" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));

create policy "same_restaurant" on "public"."table_holds" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

create policy "writer_access" on "public"."table_holds" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);

create policy "fb manage fusion links" on "public"."table_fusion_links" as PERMISSIVE for ALL to "authenticated" using ((private.current_staff_role() = 'fb_admin'::text)) with check ((private.current_staff_role() = 'fb_admin'::text));

create policy "same_restaurant" on "public"."table_fusion_links" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

create policy "staff read fusion links" on "public"."table_fusion_links" as PERMISSIVE for SELECT to "authenticated" using ((private.current_staff_role() = ANY (ARRAY['reception'::text, 'fb_admin'::text])));

create policy "writer_access" on "public"."table_fusion_links" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);

create policy "fb alerts mark read" on "public"."fb_reservation_alerts" as PERMISSIVE for UPDATE to "authenticated" using ((private.current_staff_role() = 'fb_admin'::text)) with check ((private.current_staff_role() = 'fb_admin'::text));

create policy "fb alerts read" on "public"."fb_reservation_alerts" as PERMISSIVE for SELECT to "authenticated" using ((private.current_staff_role() = 'fb_admin'::text));

create policy "same_restaurant" on "public"."fb_reservation_alerts" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

create policy "writer_access" on "public"."fb_reservation_alerts" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);

create policy "same_restaurant" on "private"."booking_drafts_v3" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

create policy "writer_access" on "private"."booking_drafts_v3" as PERMISSIVE for ALL to "resto_service_writer" using (true) with check (true);

create policy "own_changes" on "public"."restaurant_service_changes" as PERMISSIVE for SELECT to "authenticated" using ((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));

CREATE TRIGGER validate_fusion_room BEFORE INSERT OR UPDATE ON public.table_fusion_links FOR EACH ROW EXECUTE FUNCTION private.validate_table_fusion_link();

CREATE TRIGGER remove_fusions_on_room_change AFTER UPDATE OF room_id ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION private.remove_fusions_on_table_room_change();

CREATE TRIGGER reception_booking_alert AFTER INSERT ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.notify_fb_on_reception_booking();

CREATE TRIGGER initialize_hours AFTER INSERT ON public.restaurants FOR EACH ROW EXECUTE FUNCTION private.initialize_restaurant_hours();

CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();

CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.reservation_tables FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();

CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.restaurant_rooms FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();

CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();

CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.table_holds FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();

CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.table_fusion_links FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();

CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.restaurant_hours FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();

CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.fb_reservation_alerts FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();

CREATE TRIGGER reception_booking_change_alert AFTER UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.notify_fb_on_reception_change();

CREATE TRIGGER guard_closed_service_reservations BEFORE INSERT OR DELETE OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.guard_closed_service_reservations();

set check_function_bodies=on;
