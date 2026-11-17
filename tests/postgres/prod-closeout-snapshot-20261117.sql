-- Read-only PROD catalog snapshot, 17/11/2026. NO business rows or credentials.
-- Replayed only in network-disabled disposable tests.
begin;
set local check_function_bodies=off;
grant create on schema public,private to resto_service_writer;
CREATE OR REPLACE FUNCTION private.current_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select p.role from public.staff_profiles p where p.user_id = (select auth.uid()) and p.active = true limit 1 $function$
;
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
   if not private.restaurant_service_open_at_v1(private.staff_restaurant(),p_start) then
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
CREATE OR REPLACE FUNCTION public.change_reservation_status_v3(p_reservation_id uuid, p_expected text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin
 perform private.lock_restaurant_mutation_v1(); if staff is distinct from 'fb_admin' and not coalesce(staff='reception' and p_status in ('confirmed','late'),false) then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN'; end if; perform private.change_reservation_status_v3($1,$2,$3); end$function$
;
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
CREATE OR REPLACE FUNCTION private.rm005_seed_weekly_hours_on_insert_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.weekly_schedule IS NOT NULL THEN RETURN NEW; END IF;
  NEW.weekly_schedule := (
    SELECT jsonb_object_agg(d.day_key, jsonb_build_object(
      'lunch', jsonb_build_object(
        'enabled', NEW.lunch_enabled AND NOT (
          (d.n=6 AND NEW.saturday_lunch_closed)
          OR (d.n=7 AND NEW.sunday_lunch_closed)),
        'start', to_char(NEW.lunch_start,'HH24:MI'),
        'end', to_char(NEW.lunch_end,'HH24:MI')),
      'dinner', jsonb_build_object(
        'enabled', NEW.dinner_enabled,
        'start', to_char(NEW.dinner_start,'HH24:MI'),
        'end', to_char(NEW.dinner_end,'HH24:MI'))
    ))
    FROM (VALUES
      (1,'monday'),(2,'tuesday'),(3,'wednesday'),
      (4,'thursday'),(5,'friday'),(6,'saturday'),(7,'sunday')
    ) AS d(n,day_key)
  );
  RETURN NEW;
END
$function$
;
CREATE OR REPLACE FUNCTION private.validate_restaurant_weekly_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  d text;
  service text;
  part jsonb;
  open_at text;
  close_at text;
BEGIN
  IF NEW.weekly_schedule IS NULL THEN
    RAISE EXCEPTION 'Le planning hebdomadaire doit contenir sept jours.'
      USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(NEW.weekly_schedule) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.weekly_schedule)) <> 7 THEN
    RAISE EXCEPTION 'Le planning doit contenir exactement les sept jours.'
      USING ERRCODE='23514';
  END IF;
  FOREACH d IN ARRAY ARRAY[
    'monday','tuesday','wednesday','thursday','friday','saturday','sunday'
  ] LOOP
    IF NOT NEW.weekly_schedule ? d THEN
      RAISE EXCEPTION 'Jour manquant dans le planning : %',d
        USING ERRCODE='23514';
    END IF;
    FOREACH service IN ARRAY ARRAY['lunch','dinner'] LOOP
      part := NEW.weekly_schedule -> d -> service;
      IF jsonb_typeof(part) IS DISTINCT FROM 'object'
         OR jsonb_typeof(part->'enabled') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(part->'start') IS DISTINCT FROM 'string'
         OR jsonb_typeof(part->'end') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Planning invalide : % / %',d,service
          USING ERRCODE='23514';
      END IF;
      open_at := part->>'start';
      close_at := part->>'end';
      IF open_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         OR close_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         OR open_at >= close_at THEN
        RAISE EXCEPTION 'Heures incorrectes : % / %',d,service
          USING ERRCODE='23514';
      END IF;
    END LOOP;
    IF (NEW.weekly_schedule->d->'lunch'->>'enabled')::boolean
       AND (NEW.weekly_schedule->d->'dinner'->>'enabled')::boolean
       AND NEW.weekly_schedule->d->'lunch'->>'end'
           >= NEW.weekly_schedule->d->'dinner'->>'start' THEN
      RAISE EXCEPTION 'Les services se chevauchent pour %',d
        USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NEW;
END
$function$
;
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
CREATE OR REPLACE FUNCTION private.require_named_exterior_guest()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_ext boolean;
BEGIN
 v_ext:=position('[RESTOMANAGER:EXTERIEUR]' in coalesce(NEW.notes,''))>0;
 IF v_ext AND (
    TG_OP='INSERT'
    OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
    OR NEW.notes IS DISTINCT FROM OLD.notes
 ) THEN
   IF btrim(coalesce(NEW.guest_name,''))=''
      OR lower(btrim(NEW.guest_name)) IN (
         'client extérieur','client exterieur','sans nom','anonyme') THEN
      RAISE EXCEPTION 'Le nom du client extérieur est obligatoire.'
        USING errcode='23514';
   END IF;
 END IF;
 RETURN NEW;
END $function$
;
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
   if p_start<now()-interval '5 minutes' or not private.restaurant_service_open_at_v1(private.staff_restaurant(),p_start) then raise exception 'Choisissez un créneau à venir pendant un service ouvert.'; end if;
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
 if v_start is distinct from p_starts_at and (p_starts_at<now()-interval '5 minutes' or not private.restaurant_service_open_at_v1(private.staff_restaurant(),p_starts_at)) then raise exception 'Choisissez un créneau à venir pendant un service ouvert.' using errcode='22023',detail='OUTSIDE_SERVICE';end if;
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
CREATE OR REPLACE FUNCTION private.restaurant_service_open_at_v1(p_restaurant uuid, p_starts_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  h public.restaurant_hours;
  local_start timestamp;
  weekday_key text;
  day_plan jsonb;
  period_plan jsonb;
  period_name text;
  local_dow integer;
BEGIN
  IF p_restaurant IS NULL OR p_starts_at IS NULL THEN RETURN false; END IF;
  SELECT * INTO h FROM public.restaurant_hours WHERE restaurant_id=p_restaurant;
  IF NOT FOUND THEN RETURN false; END IF;
  local_start := p_starts_at AT TIME ZONE 'Europe/Paris';
  local_dow := EXTRACT(ISODOW FROM local_start)::integer;
  IF h.weekly_schedule IS NOT NULL THEN
    weekday_key := (ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[local_dow];
    day_plan := h.weekly_schedule -> weekday_key;
    IF day_plan IS NULL OR jsonb_typeof(day_plan)<>'object' THEN RETURN false; END IF;
    FOREACH period_name IN ARRAY ARRAY['lunch','dinner'] LOOP
      period_plan := day_plan -> period_name;
      IF period_plan IS NOT NULL AND coalesce((period_plan->>'enabled')::boolean,false)
         AND local_start::time >= (period_plan->>'start')::time
         AND local_start::time <= (period_plan->>'end')::time THEN RETURN true; END IF;
    END LOOP;
    RETURN false;
  END IF;
  RETURN
    (h.lunch_enabled AND NOT (
       (local_dow=6 AND h.saturday_lunch_closed)
       OR (local_dow=7 AND h.sunday_lunch_closed))
     AND local_start::time BETWEEN h.lunch_start AND h.lunch_end)
    OR (h.dinner_enabled AND local_start::time BETWEEN h.dinner_start AND h.dinner_end);
END
$function$
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
 if p_owner_token is null or p_table_ids is null or cardinality(p_table_ids) not between 1 and 4 or array_position(p_table_ids,null) is not null then raise exception 'Tables ou session invalides' using errcode='22023',detail='INVALID_INPUT'; end if;
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
 or p_table_ids is null or cardinality(p_table_ids) not between 1 and 4
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
end $function$
;
alter function "private"."current_staff_role"() owner to "postgres";
revoke all on function "private"."current_staff_role"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."current_staff_role"() to "authenticated";
grant EXECUTE on function "private"."current_staff_role"() to "resto_service_writer";
alter function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) owner to "resto_service_writer";
revoke all on function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) to "resto_service_writer";
grant EXECUTE on function "public"."booking_draft_v3"(p_key uuid, p_action text, p_start timestamp with time zone, p_end timestamp with time zone, p_guests integer, p_tables uuid[], p_name text, p_room text, p_notes text) to "authenticated";
alter function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) owner to "resto_service_writer";
revoke all on function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) to "resto_service_writer";
grant EXECUTE on function "public"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) to "authenticated";
alter function "private"."guard_room_configuration_v1"() owner to "resto_service_writer";
revoke all on function "private"."guard_room_configuration_v1"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."guard_room_configuration_v1"() to "resto_service_writer";
alter function "private"."notify_fb_on_reception_booking"() owner to "resto_service_writer";
revoke all on function "private"."notify_fb_on_reception_booking"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."notify_fb_on_reception_booking"() to public;
grant EXECUTE on function "private"."notify_fb_on_reception_booking"() to "resto_service_writer";
alter function "private"."remove_fusions_on_table_room_change"() owner to "resto_service_writer";
revoke all on function "private"."remove_fusions_on_table_room_change"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."remove_fusions_on_table_room_change"() to public;
grant EXECUTE on function "private"."remove_fusions_on_table_room_change"() to "resto_service_writer";
alter function "private"."staff_restaurant"() owner to "postgres";
revoke all on function "private"."staff_restaurant"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."staff_restaurant"() to "authenticated";
grant EXECUTE on function "private"."staff_restaurant"() to "resto_service_writer";
alter function "private"."initialize_restaurant_hours"() owner to "postgres";
revoke all on function "private"."initialize_restaurant_hours"() from public,anon,authenticated,resto_service_writer;
alter function "private"."signal_restaurant_change"() owner to "postgres";
revoke all on function "private"."signal_restaurant_change"() from public,anon,authenticated,resto_service_writer;
alter function "private"."notify_fb_on_reception_change"() owner to "postgres";
revoke all on function "private"."notify_fb_on_reception_change"() from public,anon,authenticated,resto_service_writer;
alter function "private"."guard_closed_service_reservations"() owner to "postgres";
revoke all on function "private"."guard_closed_service_reservations"() from public,anon,authenticated,resto_service_writer;
alter function "private"."bump_reservation_edit_version"() owner to "postgres";
revoke all on function "private"."bump_reservation_edit_version"() from public,anon,authenticated,resto_service_writer;
alter function "private"."invalidate_reservation_edit_version"() owner to "resto_service_writer";
revoke all on function "private"."invalidate_reservation_edit_version"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."invalidate_reservation_edit_version"() to "resto_service_writer";
alter function "private"."rm005_seed_weekly_hours_on_insert_v1"() owner to "postgres";
revoke all on function "private"."rm005_seed_weekly_hours_on_insert_v1"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."rm005_seed_weekly_hours_on_insert_v1"() to public;
alter function "private"."validate_restaurant_weekly_schedule"() owner to "postgres";
revoke all on function "private"."validate_restaurant_weekly_schedule"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."validate_restaurant_weekly_schedule"() to public;
alter function "private"."lock_restaurant_mutation_v1"() owner to "resto_service_writer";
revoke all on function "private"."lock_restaurant_mutation_v1"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."lock_restaurant_mutation_v1"() to "resto_service_writer";
grant EXECUTE on function "private"."lock_restaurant_mutation_v1"() to "authenticated";
alter function "private"."lock_direct_service_mutation_v1"() owner to "postgres";
revoke all on function "private"."lock_direct_service_mutation_v1"() from public,anon,authenticated,resto_service_writer;
alter function "public"."service_sync_state_v1"() owner to "resto_service_writer";
revoke all on function "public"."service_sync_state_v1"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "public"."service_sync_state_v1"() to "resto_service_writer";
grant EXECUTE on function "public"."service_sync_state_v1"() to "authenticated";
alter function "private"."require_named_exterior_guest"() owner to "postgres";
revoke all on function "private"."require_named_exterior_guest"() from public,anon,authenticated,resto_service_writer;
alter function "private"."guard_table_configuration_v1"() owner to "resto_service_writer";
revoke all on function "private"."guard_table_configuration_v1"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."guard_table_configuration_v1"() to "resto_service_writer";
alter function "private"."invalidate_table_editors_v1"() owner to "resto_service_writer";
revoke all on function "private"."invalidate_table_editors_v1"() from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."invalidate_table_editors_v1"() to "resto_service_writer";
alter function "public"."close_service_v3"(p_date date, p_mode text) owner to "postgres";
revoke all on function "public"."close_service_v3"(p_date date, p_mode text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "public"."close_service_v3"(p_date date, p_mode text) to "authenticated";
alter function "public"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";
revoke all on function "public"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "public"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
grant EXECUTE on function "public"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "authenticated";
alter function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) owner to "resto_service_writer";
revoke all on function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) to "resto_service_writer";
grant EXECUTE on function "public"."reception_booking_v3"(p_reservation uuid, p_name text, p_room text, p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone, p_notes text) to "authenticated";
alter function "public"."reception_update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text) owner to "resto_service_writer";
revoke all on function "public"."reception_update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "public"."reception_update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text) to "resto_service_writer";
grant EXECUTE on function "public"."reception_update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text) to "authenticated";
alter function "private"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) owner to "resto_service_writer";
revoke all on function "private"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."confirm_reservation_v3"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) to "resto_service_writer";
alter function "private"."restaurant_service_open_at_v1"(p_restaurant uuid, p_starts_at timestamp with time zone) owner to "postgres";
revoke all on function "private"."restaurant_service_open_at_v1"(p_restaurant uuid, p_starts_at timestamp with time zone) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."restaurant_service_open_at_v1"(p_restaurant uuid, p_starts_at timestamp with time zone) to "resto_service_writer";
alter function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) owner to "postgres";
revoke all on function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."ranked_booking_sets"(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone) to "resto_service_writer";
alter function "private"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) owner to "resto_service_writer";
revoke all on function "private"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."acquire_table_hold_v2"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid) to "resto_service_writer";
alter function "private"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) owner to "resto_service_writer";
revoke all on function "private"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."change_reservation_status_v3"(p_reservation_id uuid, p_expected text, p_status text) to "resto_service_writer";
alter function "private"."table_label_number_v1"(p_label text) owner to "resto_service_writer";
revoke all on function "private"."table_label_number_v1"(p_label text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."table_label_number_v1"(p_label text) to "resto_service_writer";
alter function "private"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";
revoke all on function "private"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."update_reservation_v4"(p_reservation_id uuid, p_expected_version uuid, p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
alter function "private"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";
revoke all on function "private"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."update_reservation_v3"(p_reservation_id uuid, p_guest_name text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
alter function "private"."check_fusion_selection"(p_ids uuid[]) owner to "resto_service_writer";
revoke all on function "private"."check_fusion_selection"(p_ids uuid[]) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."check_fusion_selection"(p_ids uuid[]) to public;
grant EXECUTE on function "private"."check_fusion_selection"(p_ids uuid[]) to "resto_service_writer";
alter function "public"."confirm_reservation_v2"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) owner to "resto_service_writer";
revoke all on function "public"."confirm_reservation_v2"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "public"."confirm_reservation_v2"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text) to "resto_service_writer";
alter function "private"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) owner to "resto_service_writer";
revoke all on function "private"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."acquire_table_hold"(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone) to "resto_service_writer";
alter function "private"."validate_booking_identity_v1"(p_room text, p_notes text, p_previous_room text, p_edit boolean) owner to "resto_service_writer";
revoke all on function "private"."validate_booking_identity_v1"(p_room text, p_notes text, p_previous_room text, p_edit boolean) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."validate_booking_identity_v1"(p_room text, p_notes text, p_previous_room text, p_edit boolean) to "resto_service_writer";
alter function "private"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) owner to "resto_service_writer";
revoke all on function "private"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) from public,anon,authenticated,resto_service_writer;
grant EXECUTE on function "private"."confirm_reservation"(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_notes text) to "resto_service_writer";
do $$declare p record;begin for p in select policyname from pg_policies where schemaname='public' and tablename='reservation_tables' loop execute format('drop policy %I on public."reservation_tables"',p.policyname);end loop;end$$;
revoke all on public."reservation_tables" from public,anon,authenticated,resto_service_writer;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='reservation_tables' loop execute format('revoke all (%I) on public."reservation_tables" from public,anon,authenticated,resto_service_writer',c.column_name);end loop;end$$;
do $$declare p record;begin for p in select policyname from pg_policies where schemaname='public' and tablename='reservations' loop execute format('drop policy %I on public."reservations"',p.policyname);end loop;end$$;
revoke all on public."reservations" from public,anon,authenticated,resto_service_writer;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='reservations' loop execute format('revoke all (%I) on public."reservations" from public,anon,authenticated,resto_service_writer',c.column_name);end loop;end$$;
do $$declare p record;begin for p in select policyname from pg_policies where schemaname='public' and tablename='restaurant_hours' loop execute format('drop policy %I on public."restaurant_hours"',p.policyname);end loop;end$$;
revoke all on public."restaurant_hours" from public,anon,authenticated,resto_service_writer;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='restaurant_hours' loop execute format('revoke all (%I) on public."restaurant_hours" from public,anon,authenticated,resto_service_writer',c.column_name);end loop;end$$;
do $$declare p record;begin for p in select policyname from pg_policies where schemaname='public' and tablename='restaurant_rooms' loop execute format('drop policy %I on public."restaurant_rooms"',p.policyname);end loop;end$$;
revoke all on public."restaurant_rooms" from public,anon,authenticated,resto_service_writer;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='restaurant_rooms' loop execute format('revoke all (%I) on public."restaurant_rooms" from public,anon,authenticated,resto_service_writer',c.column_name);end loop;end$$;
do $$declare p record;begin for p in select policyname from pg_policies where schemaname='public' and tablename='restaurant_service_changes' loop execute format('drop policy %I on public."restaurant_service_changes"',p.policyname);end loop;end$$;
revoke all on public."restaurant_service_changes" from public,anon,authenticated,resto_service_writer;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='restaurant_service_changes' loop execute format('revoke all (%I) on public."restaurant_service_changes" from public,anon,authenticated,resto_service_writer',c.column_name);end loop;end$$;
do $$declare p record;begin for p in select policyname from pg_policies where schemaname='public' and tablename='restaurant_tables' loop execute format('drop policy %I on public."restaurant_tables"',p.policyname);end loop;end$$;
revoke all on public."restaurant_tables" from public,anon,authenticated,resto_service_writer;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='restaurant_tables' loop execute format('revoke all (%I) on public."restaurant_tables" from public,anon,authenticated,resto_service_writer',c.column_name);end loop;end$$;
do $$declare p record;begin for p in select policyname from pg_policies where schemaname='public' and tablename='restaurants' loop execute format('drop policy %I on public."restaurants"',p.policyname);end loop;end$$;
revoke all on public."restaurants" from public,anon,authenticated,resto_service_writer;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='restaurants' loop execute format('revoke all (%I) on public."restaurants" from public,anon,authenticated,resto_service_writer',c.column_name);end loop;end$$;
do $$declare p record;begin for p in select policyname from pg_policies where schemaname='public' and tablename='service_closures' loop execute format('drop policy %I on public."service_closures"',p.policyname);end loop;end$$;
revoke all on public."service_closures" from public,anon,authenticated,resto_service_writer;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='service_closures' loop execute format('revoke all (%I) on public."service_closures" from public,anon,authenticated,resto_service_writer',c.column_name);end loop;end$$;
do $$declare p record;begin for p in select policyname from pg_policies where schemaname='public' and tablename='staff_profiles' loop execute format('drop policy %I on public."staff_profiles"',p.policyname);end loop;end$$;
revoke all on public."staff_profiles" from public,anon,authenticated,resto_service_writer;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='staff_profiles' loop execute format('revoke all (%I) on public."staff_profiles" from public,anon,authenticated,resto_service_writer',c.column_name);end loop;end$$;
do $$declare p record;begin for p in select policyname from pg_policies where schemaname='public' and tablename='table_holds' loop execute format('drop policy %I on public."table_holds"',p.policyname);end loop;end$$;
revoke all on public."table_holds" from public,anon,authenticated,resto_service_writer;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='table_holds' loop execute format('revoke all (%I) on public."table_holds" from public,anon,authenticated,resto_service_writer',c.column_name);end loop;end$$;
create policy "reservation_tables_staff_read" on public."reservation_tables" as PERMISSIVE for SELECT to "authenticated" using((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));
create policy "same_restaurant" on public."reservation_tables" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "writer_access" on public."reservation_tables" as PERMISSIVE for ALL to "resto_service_writer" using(true) with check(true);
create policy "reservations_staff_read" on public."reservations" as PERMISSIVE for SELECT to "authenticated" using((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));
create policy "same_restaurant" on public."reservations" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "writer_access" on public."reservations" as PERMISSIVE for ALL to "resto_service_writer" using(true) with check(true);
create policy "admin_edit" on public."restaurant_hours" as PERMISSIVE for UPDATE to "authenticated" using(((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text))) with check(((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)));
create policy "same_restaurant" on public."restaurant_hours" as PERMISSIVE for SELECT to "authenticated","resto_service_writer" using((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "staff_read" on public."restaurant_hours" as PERMISSIVE for SELECT to "authenticated" using(((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['fb_admin'::text, 'reception'::text]))));
create policy "writer_access" on public."restaurant_hours" as PERMISSIVE for ALL to "resto_service_writer" using(true) with check(true);
create policy "rooms_admin_insert" on public."restaurant_rooms" as PERMISSIVE for INSERT to "authenticated" with check(((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)));
create policy "rooms_admin_update" on public."restaurant_rooms" as PERMISSIVE for UPDATE to "authenticated" using(((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text))) with check(((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)));
create policy "rooms_staff_read" on public."restaurant_rooms" as PERMISSIVE for SELECT to "authenticated" using(((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text]))));
create policy "writer_access" on public."restaurant_rooms" as PERMISSIVE for ALL to "resto_service_writer" using(true) with check(true);
create policy "mission3_writer_read_revision" on public."restaurant_service_changes" as PERMISSIVE for SELECT to "resto_service_writer" using((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "own_changes" on public."restaurant_service_changes" as PERMISSIVE for SELECT to "authenticated" using((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "same_restaurant" on public."restaurant_tables" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "tables_admin_insert" on public."restaurant_tables" as PERMISSIVE for INSERT to "authenticated" with check((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));
create policy "tables_admin_update" on public."restaurant_tables" as PERMISSIVE for UPDATE to "authenticated" using((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)) with check((( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text));
create policy "tables_staff_read" on public."restaurant_tables" as PERMISSIVE for SELECT to "authenticated" using((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));
create policy "writer_access" on public."restaurant_tables" as PERMISSIVE for ALL to "resto_service_writer" using(true) with check(true);
create policy "own_restaurant" on public."restaurants" as PERMISSIVE for SELECT to "authenticated" using((id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "platform_owner_restaurants" on public."restaurants" as PERMISSIVE for SELECT to "authenticated" using((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE ((pa.user_id = ( SELECT auth.uid() AS uid)) AND (pa.role = 'platform_admin'::text) AND (pa.active = true)))));
create policy "restaurant read own service closures" on public."service_closures" as PERMISSIVE for SELECT to "authenticated" using(((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)) AND (( SELECT private.current_staff_role() AS current_staff_role) = 'fb_admin'::text)));
create policy "active_profile" on public."staff_profiles" as RESTRICTIVE for SELECT to "authenticated" using(active);
create policy "staff_profiles_read_self" on public."staff_profiles" as PERMISSIVE for SELECT to "authenticated" using((user_id = ( SELECT auth.uid() AS uid)));
create policy "writer_profile" on public."staff_profiles" as PERMISSIVE for SELECT to "resto_service_writer" using(((user_id = ( SELECT auth.uid() AS uid)) AND active));
create policy "holds_staff_read" on public."table_holds" as PERMISSIVE for SELECT to "authenticated" using((( SELECT private.current_staff_role() AS current_staff_role) = ANY (ARRAY['reception'::text, 'fb_admin'::text])));
create policy "same_restaurant" on public."table_holds" as RESTRICTIVE for ALL to "authenticated","resto_service_writer" using((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant))) with check((restaurant_id = ( SELECT private.staff_restaurant() AS staff_restaurant)));
create policy "writer_access" on public."table_holds" as PERMISSIVE for ALL to "resto_service_writer" using(true) with check(true);
grant SELECT on public."restaurant_hours" to "authenticated";
grant UPDATE on public."restaurant_hours" to "authenticated";
grant INSERT on public."restaurant_hours" to "resto_service_writer";
grant SELECT on public."restaurant_hours" to "resto_service_writer";
grant UPDATE on public."restaurant_hours" to "resto_service_writer";
grant DELETE on public."restaurant_hours" to "resto_service_writer";
grant INSERT on public."restaurant_rooms" to "authenticated";
grant SELECT on public."restaurant_rooms" to "authenticated";
grant UPDATE on public."restaurant_rooms" to "authenticated";
grant INSERT on public."restaurant_rooms" to "resto_service_writer";
grant SELECT on public."restaurant_rooms" to "resto_service_writer";
grant UPDATE on public."restaurant_rooms" to "resto_service_writer";
grant DELETE on public."restaurant_rooms" to "resto_service_writer";
grant SELECT on public."staff_profiles" to "authenticated";
grant SELECT on public."staff_profiles" to "resto_service_writer";
grant SELECT on public."service_closures" to "authenticated";
grant SELECT on public."restaurants" to "authenticated";
grant SELECT on public."restaurant_service_changes" to "authenticated";
grant SELECT on public."restaurant_service_changes" to "resto_service_writer";
grant SELECT on public."reservation_tables" to "authenticated";
grant INSERT on public."reservation_tables" to "resto_service_writer";
grant SELECT on public."reservation_tables" to "resto_service_writer";
grant UPDATE on public."reservation_tables" to "resto_service_writer";
grant DELETE on public."reservation_tables" to "resto_service_writer";
grant INSERT on public."table_holds" to "resto_service_writer";
grant SELECT on public."table_holds" to "resto_service_writer";
grant UPDATE on public."table_holds" to "resto_service_writer";
grant DELETE on public."table_holds" to "resto_service_writer";
grant SELECT on public."restaurant_tables" to "authenticated";
grant INSERT on public."restaurant_tables" to "resto_service_writer";
grant SELECT on public."restaurant_tables" to "resto_service_writer";
grant UPDATE on public."restaurant_tables" to "resto_service_writer";
grant DELETE on public."restaurant_tables" to "resto_service_writer";
grant SELECT on public."reservations" to "authenticated";
grant INSERT on public."reservations" to "resto_service_writer";
grant SELECT on public."reservations" to "resto_service_writer";
grant UPDATE on public."reservations" to "resto_service_writer";
grant DELETE on public."reservations" to "resto_service_writer";
grant INSERT ("active") on public."restaurant_rooms" to "authenticated";
grant SELECT ("active") on public."restaurant_rooms" to "authenticated";
grant UPDATE ("active") on public."restaurant_rooms" to "authenticated";
grant SELECT ("active") on public."restaurant_tables" to "authenticated";
grant SELECT ("active") on public."staff_profiles" to "authenticated";
grant SELECT ("arrival_limit_percent") on public."restaurant_hours" to "authenticated";
grant UPDATE ("arrival_limit_percent") on public."restaurant_hours" to "authenticated";
grant SELECT ("arrived_at") on public."reservations" to "authenticated";
grant SELECT ("cancelled_groups") on public."service_closures" to "authenticated";
grant SELECT ("close_mode") on public."service_closures" to "authenticated";
grant SELECT ("closed_at") on public."service_closures" to "authenticated";
grant SELECT ("closed_by") on public."service_closures" to "authenticated";
grant SELECT ("confirmed_at") on public."reservations" to "authenticated";
grant SELECT ("created_at") on public."reservations" to "authenticated";
grant SELECT ("created_at") on public."staff_profiles" to "authenticated";
grant SELECT ("created_at") on public."table_holds" to "authenticated";
grant SELECT ("created_by") on public."reservations" to "authenticated";
grant SELECT ("dinner_enabled") on public."restaurant_hours" to "authenticated";
grant UPDATE ("dinner_enabled") on public."restaurant_hours" to "authenticated";
grant SELECT ("dinner_end") on public."restaurant_hours" to "authenticated";
grant UPDATE ("dinner_end") on public."restaurant_hours" to "authenticated";
grant SELECT ("dinner_start") on public."restaurant_hours" to "authenticated";
grant UPDATE ("dinner_start") on public."restaurant_hours" to "authenticated";
grant SELECT ("display_name") on public."staff_profiles" to "authenticated";
grant SELECT ("draft_role") on public."table_holds" to "authenticated";
grant SELECT ("duration") on public."restaurant_hours" to "authenticated";
grant UPDATE ("duration") on public."restaurant_hours" to "authenticated";
grant SELECT ("edit_version") on public."reservations" to "authenticated";
grant SELECT ("ends_at") on public."reservations" to "authenticated";
grant SELECT ("ends_at") on public."table_holds" to "authenticated";
grant SELECT ("expires_at") on public."table_holds" to "authenticated";
grant SELECT ("guest_name") on public."reservations" to "authenticated";
grant SELECT ("held_by") on public."table_holds" to "authenticated";
grant SELECT ("hotel_covers") on public."service_closures" to "authenticated";
grant SELECT ("hotel_room") on public."reservations" to "authenticated";
grant SELECT ("id") on public."reservations" to "authenticated";
grant SELECT ("id") on public."restaurant_hours" to "authenticated";
grant UPDATE ("id") on public."restaurant_hours" to "authenticated";
grant INSERT ("id") on public."restaurant_rooms" to "authenticated";
grant SELECT ("id") on public."restaurant_rooms" to "authenticated";
grant UPDATE ("id") on public."restaurant_rooms" to "authenticated";
grant SELECT ("id") on public."restaurant_tables" to "authenticated";
grant SELECT ("id") on public."restaurants" to "authenticated";
grant SELECT ("id") on public."service_closures" to "authenticated";
grant SELECT ("id") on public."table_holds" to "authenticated";
grant SELECT ("label") on public."restaurant_tables" to "authenticated";
grant SELECT ("lunch_enabled") on public."restaurant_hours" to "authenticated";
grant UPDATE ("lunch_enabled") on public."restaurant_hours" to "authenticated";
grant SELECT ("lunch_end") on public."restaurant_hours" to "authenticated";
grant UPDATE ("lunch_end") on public."restaurant_hours" to "authenticated";
grant SELECT ("lunch_start") on public."restaurant_hours" to "authenticated";
grant UPDATE ("lunch_start") on public."restaurant_hours" to "authenticated";
grant INSERT ("name") on public."restaurant_rooms" to "authenticated";
grant SELECT ("name") on public."restaurant_rooms" to "authenticated";
grant UPDATE ("name") on public."restaurant_rooms" to "authenticated";
grant SELECT ("name") on public."restaurants" to "authenticated";
grant SELECT ("no_show_groups") on public."service_closures" to "authenticated";
grant SELECT ("notes") on public."reservations" to "authenticated";
grant SELECT ("party_size") on public."reservations" to "authenticated";
grant SELECT ("released_at") on public."reservations" to "authenticated";
grant SELECT ("reservation_id") on public."reservation_tables" to "authenticated";
grant SELECT ("restaurant_id") on public."reservation_tables" to "authenticated";
grant SELECT ("restaurant_id") on public."reservations" to "authenticated";
grant SELECT ("restaurant_id") on public."restaurant_hours" to "authenticated";
grant UPDATE ("restaurant_id") on public."restaurant_hours" to "authenticated";
grant INSERT ("restaurant_id") on public."restaurant_rooms" to "authenticated";
grant SELECT ("restaurant_id") on public."restaurant_rooms" to "authenticated";
grant UPDATE ("restaurant_id") on public."restaurant_rooms" to "authenticated";
grant SELECT ("restaurant_id") on public."restaurant_service_changes" to "authenticated";
grant SELECT ("restaurant_id") on public."restaurant_tables" to "authenticated";
grant SELECT ("restaurant_id") on public."service_closures" to "authenticated";
grant SELECT ("restaurant_id") on public."staff_profiles" to "authenticated";
grant SELECT ("revision") on public."restaurant_service_changes" to "authenticated";
grant SELECT ("role") on public."staff_profiles" to "authenticated";
grant SELECT ("room_id") on public."restaurant_tables" to "authenticated";
grant SELECT ("saturday_lunch_closed") on public."restaurant_hours" to "authenticated";
grant UPDATE ("saturday_lunch_closed") on public."restaurant_hours" to "authenticated";
grant SELECT ("seated_at") on public."reservations" to "authenticated";
grant SELECT ("seats") on public."restaurant_tables" to "authenticated";
grant SELECT ("served_covers") on public."service_closures" to "authenticated";
grant SELECT ("served_groups") on public."service_closures" to "authenticated";
grant SELECT ("service_date") on public."service_closures" to "authenticated";
grant INSERT ("sort_order") on public."restaurant_rooms" to "authenticated";
grant SELECT ("sort_order") on public."restaurant_rooms" to "authenticated";
grant UPDATE ("sort_order") on public."restaurant_rooms" to "authenticated";
grant SELECT ("starts_at") on public."reservations" to "authenticated";
grant SELECT ("starts_at") on public."table_holds" to "authenticated";
grant SELECT ("status") on public."reservations" to "authenticated";
grant SELECT ("sunday_lunch_closed") on public."restaurant_hours" to "authenticated";
grant UPDATE ("sunday_lunch_closed") on public."restaurant_hours" to "authenticated";
grant SELECT ("table_id") on public."reservation_tables" to "authenticated";
grant SELECT ("table_id") on public."table_holds" to "authenticated";
grant SELECT ("updated_at") on public."reservations" to "authenticated";
grant SELECT ("user_id") on public."staff_profiles" to "authenticated";
grant SELECT ("walkin_covers") on public."service_closures" to "authenticated";
grant SELECT ("walkin_type") on public."reservations" to "authenticated";
grant SELECT ("weekly_schedule") on public."restaurant_hours" to "authenticated";
grant UPDATE ("weekly_schedule") on public."restaurant_hours" to "authenticated";
grant INSERT ("active") on public."restaurant_rooms" to "resto_service_writer";
grant SELECT ("active") on public."restaurant_rooms" to "resto_service_writer";
grant UPDATE ("active") on public."restaurant_rooms" to "resto_service_writer";
grant INSERT ("active") on public."restaurant_tables" to "resto_service_writer";
grant SELECT ("active") on public."restaurant_tables" to "resto_service_writer";
grant UPDATE ("active") on public."restaurant_tables" to "resto_service_writer";
grant SELECT ("active") on public."staff_profiles" to "resto_service_writer";
grant INSERT ("arrival_limit_percent") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("arrival_limit_percent") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("arrival_limit_percent") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("arrived_at") on public."reservations" to "resto_service_writer";
grant SELECT ("arrived_at") on public."reservations" to "resto_service_writer";
grant UPDATE ("arrived_at") on public."reservations" to "resto_service_writer";
grant INSERT ("confirmed_at") on public."reservations" to "resto_service_writer";
grant SELECT ("confirmed_at") on public."reservations" to "resto_service_writer";
grant UPDATE ("confirmed_at") on public."reservations" to "resto_service_writer";
grant INSERT ("created_at") on public."reservations" to "resto_service_writer";
grant SELECT ("created_at") on public."reservations" to "resto_service_writer";
grant UPDATE ("created_at") on public."reservations" to "resto_service_writer";
grant SELECT ("created_at") on public."staff_profiles" to "resto_service_writer";
grant INSERT ("created_at") on public."table_holds" to "resto_service_writer";
grant SELECT ("created_at") on public."table_holds" to "resto_service_writer";
grant UPDATE ("created_at") on public."table_holds" to "resto_service_writer";
grant INSERT ("created_by") on public."reservations" to "resto_service_writer";
grant SELECT ("created_by") on public."reservations" to "resto_service_writer";
grant UPDATE ("created_by") on public."reservations" to "resto_service_writer";
grant INSERT ("dinner_enabled") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("dinner_enabled") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("dinner_enabled") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("dinner_end") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("dinner_end") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("dinner_end") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("dinner_start") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("dinner_start") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("dinner_start") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("display_name") on public."staff_profiles" to "resto_service_writer";
grant INSERT ("draft_role") on public."table_holds" to "resto_service_writer";
grant SELECT ("draft_role") on public."table_holds" to "resto_service_writer";
grant UPDATE ("draft_role") on public."table_holds" to "resto_service_writer";
grant INSERT ("duration") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("duration") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("duration") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("edit_version") on public."reservations" to "resto_service_writer";
grant SELECT ("edit_version") on public."reservations" to "resto_service_writer";
grant UPDATE ("edit_version") on public."reservations" to "resto_service_writer";
grant INSERT ("ends_at") on public."reservations" to "resto_service_writer";
grant SELECT ("ends_at") on public."reservations" to "resto_service_writer";
grant UPDATE ("ends_at") on public."reservations" to "resto_service_writer";
grant INSERT ("ends_at") on public."table_holds" to "resto_service_writer";
grant SELECT ("ends_at") on public."table_holds" to "resto_service_writer";
grant UPDATE ("ends_at") on public."table_holds" to "resto_service_writer";
grant INSERT ("expires_at") on public."table_holds" to "resto_service_writer";
grant SELECT ("expires_at") on public."table_holds" to "resto_service_writer";
grant UPDATE ("expires_at") on public."table_holds" to "resto_service_writer";
grant INSERT ("guest_name") on public."reservations" to "resto_service_writer";
grant SELECT ("guest_name") on public."reservations" to "resto_service_writer";
grant UPDATE ("guest_name") on public."reservations" to "resto_service_writer";
grant INSERT ("held_by") on public."table_holds" to "resto_service_writer";
grant SELECT ("held_by") on public."table_holds" to "resto_service_writer";
grant UPDATE ("held_by") on public."table_holds" to "resto_service_writer";
grant INSERT ("hotel_room") on public."reservations" to "resto_service_writer";
grant SELECT ("hotel_room") on public."reservations" to "resto_service_writer";
grant UPDATE ("hotel_room") on public."reservations" to "resto_service_writer";
grant INSERT ("id") on public."reservations" to "resto_service_writer";
grant SELECT ("id") on public."reservations" to "resto_service_writer";
grant UPDATE ("id") on public."reservations" to "resto_service_writer";
grant INSERT ("id") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("id") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("id") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("id") on public."restaurant_rooms" to "resto_service_writer";
grant SELECT ("id") on public."restaurant_rooms" to "resto_service_writer";
grant UPDATE ("id") on public."restaurant_rooms" to "resto_service_writer";
grant INSERT ("id") on public."restaurant_tables" to "resto_service_writer";
grant SELECT ("id") on public."restaurant_tables" to "resto_service_writer";
grant UPDATE ("id") on public."restaurant_tables" to "resto_service_writer";
grant INSERT ("id") on public."table_holds" to "resto_service_writer";
grant SELECT ("id") on public."table_holds" to "resto_service_writer";
grant UPDATE ("id") on public."table_holds" to "resto_service_writer";
grant INSERT ("label") on public."restaurant_tables" to "resto_service_writer";
grant SELECT ("label") on public."restaurant_tables" to "resto_service_writer";
grant UPDATE ("label") on public."restaurant_tables" to "resto_service_writer";
grant INSERT ("lunch_enabled") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("lunch_enabled") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("lunch_enabled") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("lunch_end") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("lunch_end") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("lunch_end") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("lunch_start") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("lunch_start") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("lunch_start") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("name") on public."restaurant_rooms" to "resto_service_writer";
grant SELECT ("name") on public."restaurant_rooms" to "resto_service_writer";
grant UPDATE ("name") on public."restaurant_rooms" to "resto_service_writer";
grant INSERT ("notes") on public."reservations" to "resto_service_writer";
grant SELECT ("notes") on public."reservations" to "resto_service_writer";
grant UPDATE ("notes") on public."reservations" to "resto_service_writer";
grant INSERT ("owner_token") on public."table_holds" to "resto_service_writer";
grant SELECT ("owner_token") on public."table_holds" to "resto_service_writer";
grant UPDATE ("owner_token") on public."table_holds" to "resto_service_writer";
grant INSERT ("party_size") on public."reservations" to "resto_service_writer";
grant SELECT ("party_size") on public."reservations" to "resto_service_writer";
grant UPDATE ("party_size") on public."reservations" to "resto_service_writer";
grant INSERT ("released_at") on public."reservations" to "resto_service_writer";
grant SELECT ("released_at") on public."reservations" to "resto_service_writer";
grant UPDATE ("released_at") on public."reservations" to "resto_service_writer";
grant INSERT ("reservation_id") on public."reservation_tables" to "resto_service_writer";
grant SELECT ("reservation_id") on public."reservation_tables" to "resto_service_writer";
grant UPDATE ("reservation_id") on public."reservation_tables" to "resto_service_writer";
grant INSERT ("restaurant_id") on public."reservation_tables" to "resto_service_writer";
grant SELECT ("restaurant_id") on public."reservation_tables" to "resto_service_writer";
grant UPDATE ("restaurant_id") on public."reservation_tables" to "resto_service_writer";
grant INSERT ("restaurant_id") on public."reservations" to "resto_service_writer";
grant SELECT ("restaurant_id") on public."reservations" to "resto_service_writer";
grant UPDATE ("restaurant_id") on public."reservations" to "resto_service_writer";
grant INSERT ("restaurant_id") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("restaurant_id") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("restaurant_id") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("restaurant_id") on public."restaurant_rooms" to "resto_service_writer";
grant SELECT ("restaurant_id") on public."restaurant_rooms" to "resto_service_writer";
grant UPDATE ("restaurant_id") on public."restaurant_rooms" to "resto_service_writer";
grant SELECT ("restaurant_id") on public."restaurant_service_changes" to "resto_service_writer";
grant INSERT ("restaurant_id") on public."restaurant_tables" to "resto_service_writer";
grant SELECT ("restaurant_id") on public."restaurant_tables" to "resto_service_writer";
grant UPDATE ("restaurant_id") on public."restaurant_tables" to "resto_service_writer";
grant SELECT ("restaurant_id") on public."staff_profiles" to "resto_service_writer";
grant INSERT ("restaurant_id") on public."table_holds" to "resto_service_writer";
grant SELECT ("restaurant_id") on public."table_holds" to "resto_service_writer";
grant UPDATE ("restaurant_id") on public."table_holds" to "resto_service_writer";
grant SELECT ("revision") on public."restaurant_service_changes" to "resto_service_writer";
grant SELECT ("role") on public."staff_profiles" to "resto_service_writer";
grant INSERT ("room_id") on public."restaurant_tables" to "resto_service_writer";
grant SELECT ("room_id") on public."restaurant_tables" to "resto_service_writer";
grant UPDATE ("room_id") on public."restaurant_tables" to "resto_service_writer";
grant INSERT ("saturday_lunch_closed") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("saturday_lunch_closed") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("saturday_lunch_closed") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("seated_at") on public."reservations" to "resto_service_writer";
grant SELECT ("seated_at") on public."reservations" to "resto_service_writer";
grant UPDATE ("seated_at") on public."reservations" to "resto_service_writer";
grant INSERT ("seats") on public."restaurant_tables" to "resto_service_writer";
grant SELECT ("seats") on public."restaurant_tables" to "resto_service_writer";
grant UPDATE ("seats") on public."restaurant_tables" to "resto_service_writer";
grant INSERT ("sort_order") on public."restaurant_rooms" to "resto_service_writer";
grant SELECT ("sort_order") on public."restaurant_rooms" to "resto_service_writer";
grant UPDATE ("sort_order") on public."restaurant_rooms" to "resto_service_writer";
grant INSERT ("starts_at") on public."reservations" to "resto_service_writer";
grant SELECT ("starts_at") on public."reservations" to "resto_service_writer";
grant UPDATE ("starts_at") on public."reservations" to "resto_service_writer";
grant INSERT ("starts_at") on public."table_holds" to "resto_service_writer";
grant SELECT ("starts_at") on public."table_holds" to "resto_service_writer";
grant UPDATE ("starts_at") on public."table_holds" to "resto_service_writer";
grant INSERT ("status") on public."reservations" to "resto_service_writer";
grant SELECT ("status") on public."reservations" to "resto_service_writer";
grant UPDATE ("status") on public."reservations" to "resto_service_writer";
grant INSERT ("sunday_lunch_closed") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("sunday_lunch_closed") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("sunday_lunch_closed") on public."restaurant_hours" to "resto_service_writer";
grant INSERT ("table_id") on public."reservation_tables" to "resto_service_writer";
grant SELECT ("table_id") on public."reservation_tables" to "resto_service_writer";
grant UPDATE ("table_id") on public."reservation_tables" to "resto_service_writer";
grant INSERT ("table_id") on public."table_holds" to "resto_service_writer";
grant SELECT ("table_id") on public."table_holds" to "resto_service_writer";
grant UPDATE ("table_id") on public."table_holds" to "resto_service_writer";
grant INSERT ("updated_at") on public."reservations" to "resto_service_writer";
grant SELECT ("updated_at") on public."reservations" to "resto_service_writer";
grant UPDATE ("updated_at") on public."reservations" to "resto_service_writer";
grant SELECT ("user_id") on public."staff_profiles" to "resto_service_writer";
grant INSERT ("walkin_type") on public."reservations" to "resto_service_writer";
grant SELECT ("walkin_type") on public."reservations" to "resto_service_writer";
grant UPDATE ("walkin_type") on public."reservations" to "resto_service_writer";
grant INSERT ("weekly_schedule") on public."restaurant_hours" to "resto_service_writer";
grant SELECT ("weekly_schedule") on public."restaurant_hours" to "resto_service_writer";
grant UPDATE ("weekly_schedule") on public."restaurant_hours" to "resto_service_writer";
do $$declare t record;begin for t in select tgname from pg_trigger where tgrelid='public."reservation_tables"'::regclass and not tgisinternal loop execute format('drop trigger %I on public."reservation_tables"',t.tgname);end loop;end$$;
do $$declare t record;begin for t in select tgname from pg_trigger where tgrelid='public."reservations"'::regclass and not tgisinternal loop execute format('drop trigger %I on public."reservations"',t.tgname);end loop;end$$;
do $$declare t record;begin for t in select tgname from pg_trigger where tgrelid='public."restaurant_hours"'::regclass and not tgisinternal loop execute format('drop trigger %I on public."restaurant_hours"',t.tgname);end loop;end$$;
do $$declare t record;begin for t in select tgname from pg_trigger where tgrelid='public."restaurant_rooms"'::regclass and not tgisinternal loop execute format('drop trigger %I on public."restaurant_rooms"',t.tgname);end loop;end$$;
do $$declare t record;begin for t in select tgname from pg_trigger where tgrelid='public."restaurant_service_changes"'::regclass and not tgisinternal loop execute format('drop trigger %I on public."restaurant_service_changes"',t.tgname);end loop;end$$;
do $$declare t record;begin for t in select tgname from pg_trigger where tgrelid='public."restaurant_tables"'::regclass and not tgisinternal loop execute format('drop trigger %I on public."restaurant_tables"',t.tgname);end loop;end$$;
do $$declare t record;begin for t in select tgname from pg_trigger where tgrelid='public."restaurants"'::regclass and not tgisinternal loop execute format('drop trigger %I on public."restaurants"',t.tgname);end loop;end$$;
do $$declare t record;begin for t in select tgname from pg_trigger where tgrelid='public."service_closures"'::regclass and not tgisinternal loop execute format('drop trigger %I on public."service_closures"',t.tgname);end loop;end$$;
do $$declare t record;begin for t in select tgname from pg_trigger where tgrelid='public."staff_profiles"'::regclass and not tgisinternal loop execute format('drop trigger %I on public."staff_profiles"',t.tgname);end loop;end$$;
do $$declare t record;begin for t in select tgname from pg_trigger where tgrelid='public."table_holds"'::regclass and not tgisinternal loop execute format('drop trigger %I on public."table_holds"',t.tgname);end loop;end$$;
CREATE TRIGGER invalidate_reservation_edit_version AFTER INSERT OR DELETE OR UPDATE ON public.reservation_tables FOR EACH ROW EXECUTE FUNCTION private.invalidate_reservation_edit_version();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.reservation_tables FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER bump_reservation_edit_version BEFORE INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.bump_reservation_edit_version();
CREATE TRIGGER guard_closed_service_reservations BEFORE INSERT OR DELETE OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.guard_closed_service_reservations();
CREATE TRIGGER reception_booking_alert AFTER INSERT ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.notify_fb_on_reception_booking();
CREATE TRIGGER reception_booking_change_alert AFTER UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.notify_fb_on_reception_change();
CREATE TRIGGER require_named_exterior_guest BEFORE INSERT OR UPDATE OF guest_name, notes ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.require_named_exterior_guest();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER mission3_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON public.restaurant_hours FOR EACH STATEMENT EXECUTE FUNCTION private.lock_direct_service_mutation_v1();
CREATE TRIGGER rm005_seed_weekly_hours_on_insert BEFORE INSERT ON public.restaurant_hours FOR EACH ROW EXECUTE FUNCTION private.rm005_seed_weekly_hours_on_insert_v1();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.restaurant_hours FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER validate_restaurant_weekly_schedule BEFORE INSERT OR UPDATE OF weekly_schedule ON public.restaurant_hours FOR EACH ROW EXECUTE FUNCTION private.validate_restaurant_weekly_schedule();
CREATE TRIGGER mission3_room_configuration BEFORE UPDATE ON public.restaurant_rooms FOR EACH ROW EXECUTE FUNCTION private.guard_room_configuration_v1();
CREATE TRIGGER mission3_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON public.restaurant_rooms FOR EACH STATEMENT EXECUTE FUNCTION private.lock_direct_service_mutation_v1();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.restaurant_rooms FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER mission3_invalidate_table_editors AFTER UPDATE OF label, seats, room_id, active ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION private.invalidate_table_editors_v1();
CREATE TRIGGER mission3_table_configuration BEFORE INSERT OR UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION private.guard_table_configuration_v1();
CREATE TRIGGER remove_fusions_on_room_change AFTER UPDATE OF room_id ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION private.remove_fusions_on_table_room_change();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
CREATE TRIGGER initialize_hours AFTER INSERT ON public.restaurants FOR EACH ROW EXECUTE FUNCTION private.initialize_restaurant_hours();
CREATE TRIGGER signal_change AFTER INSERT OR DELETE OR UPDATE ON public.table_holds FOR EACH ROW EXECUTE FUNCTION private.signal_restaurant_change();
revoke create on schema public,private from resto_service_writer;
commit;

