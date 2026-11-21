-- RM-005 ISOLATED PG17 SCHEMA FIXTURE GENERATED FROM EXACT PROD RPC FUNCTION DEFINITIONS.
-- No reservations, guests, staff accounts, passwords, API tokens or real table data.
-- Testing-only source snapshot. NEVER apply to PROD.
SET check_function_bodies = off;

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
end $function$;

ALTER FUNCTION private.install_walkin_v3(uuid,integer,text,text) OWNER TO resto_service_writer;
REVOKE ALL ON FUNCTION private.install_walkin_v3(uuid,integer,text,text) FROM PUBLIC, anon, authenticated;

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
end $function$;

ALTER FUNCTION public.booking_draft_v3(uuid,text,timestamptz,timestamptz,integer,uuid[],text,text,text) OWNER TO resto_service_writer;
REVOKE ALL ON FUNCTION public.booking_draft_v3(uuid,text,timestamptz,timestamptz,integer,uuid[],text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_draft_v3(uuid,text,timestamptz,timestamptz,integer,uuid[],text,text,text) TO authenticated;

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
 select * into strict h from public.restaurant_hours where id=1 and restaurant_id=private.staff_restaurant() for share;
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
end $function$;

ALTER FUNCTION public.install_walkin_group_v3(uuid[],integer,text,text) OWNER TO resto_service_writer;
REVOKE ALL ON FUNCTION public.install_walkin_group_v3(uuid[],integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.install_walkin_group_v3(uuid[],integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.install_walkin_group_v4(p_tables uuid[], p_guests integer, p_name text, p_type text, p_allow_second_occupant boolean DEFAULT false)
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
 select * into strict h from public.restaurant_hours where id=1 and restaurant_id=private.staff_restaurant() for share;
 if not ((h.lunch_enabled and local_time between h.lunch_start and h.lunch_end)
      or (h.dinner_enabled and local_time between h.dinner_start and h.dinner_end)) then
   raise exception 'Service fermé à cette heure. Vérifiez les horaires dans Gestion.';
 end if;
 finish:=stamp+make_interval(mins=>h.duration);
 if p_type='hotel' and btrim(p_name) ~ '^[0-9]{1,6}[A-Za-z]?$' then room:=btrim(p_name); end if;
     if p_allow_second_occupant is true and (p_type<>'hotel' or room is null) then
       raise exception 'Confirmation du deuxième occupant réservée à une chambre d’hôtel identifiée.'
         using errcode='22023',detail='ROOM_REQUIRED';
     end if;
 if cardinality(p_tables) not between 1 and 3 or p_tables is null or array_position(p_tables,null) is not null then raise exception 'Sélection de tables invalide'; end if;
 for t in select distinct x from unnest(p_tables) x order by x loop
  perform public.acquire_table_hold_v2(t,stamp,finish,token);
 end loop;
 if p_allow_second_occupant is true then
       perform set_config('restomanager.second_occupant_confirmed','yes',true);
     end if;
     booking:=public.confirm_reservation_v3(p_name,room,p_guests,stamp,finish,p_tables,token,case when p_allow_second_occupant is true then '[RM:WALKIN_SEPARATE_OCCUPANT_V1]' else null end);
 perform public.change_reservation_status_v3(booking,'reserved','seated');
 update public.reservations set walkin_type=p_type where id=booking;
 return booking;
end $function$;

REVOKE ALL ON FUNCTION public.install_walkin_group_v4(uuid[],integer,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.install_walkin_group_v4(uuid[],integer,text,text,boolean) TO authenticated;

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
end $function$;

ALTER FUNCTION public.reception_booking_v3(uuid,text,text,integer,timestamptz,timestamptz,text) OWNER TO resto_service_writer;
REVOKE ALL ON FUNCTION public.reception_booking_v3(uuid,text,text,integer,timestamptz,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reception_booking_v3(uuid,text,text,integer,timestamptz,timestamptz,text) TO authenticated;

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
end $function$;

ALTER FUNCTION public.reception_update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,text) OWNER TO resto_service_writer;
REVOKE ALL ON FUNCTION public.reception_update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reception_update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,text) TO authenticated;

RESET check_function_bodies;
