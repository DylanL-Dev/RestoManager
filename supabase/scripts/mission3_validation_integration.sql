-- Mission 3. PREPARED ONLY: never run against the shared project without approval.
-- Run after mission2_reservation_edits.sql, with an administrator, in one transaction.
-- Compatibility: V4 edits; booking recovery v1; revision-fenced snapshots v1.
-- Rollback: keep additive V4 protections, suspend edits before reverting clients.
-- Mutations are intentionally serialized per restaurant, not across restaurants.
begin;

do $preflight$
declare item record; writer oid; expected text := 'restaurant_id=selectprivate.staff_restaurantasstaff_restaurant';
begin
 select oid into writer from pg_roles where rolname='resto_service_writer' and not rolbypassrls and not rolsuper;
 if writer is null then raise exception 'Mission 3: non-bypass writer role missing';end if;
 for item in select * from (values
  ('public','reservations'),('public','reservation_tables'),('public','restaurant_rooms'),
  ('public','restaurant_tables'),('public','table_holds'),('public','table_fusion_links'),
  ('public','restaurant_hours'),('private','booking_drafts_v3')) t(s,n) loop
  if not exists(select 1 from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
   where ns.nspname=item.s and c.relname=item.n and c.relrowsecurity and c.relowner<>writer) then
   raise exception 'Mission 3: RLS/non-owner prerequisite missing on %.%',item.s,item.n;
  end if;
  if not exists(select 1 from pg_policies p where p.schemaname=item.s and p.tablename=item.n
   and p.policyname='same_restaurant' and p.permissive='RESTRICTIVE' and p.cmd='ALL'
   and p.roles @> array['authenticated','resto_service_writer']::name[]
   and lower(regexp_replace(p.qual,'[[:space:]()]','','g'))=expected
   and lower(regexp_replace(p.with_check,'[[:space:]()]','','g'))=expected) then
   raise exception 'Mission 3: tenant policy definition drift on %.%',item.s,item.n;
  end if;
  if exists(select 1 from unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege
    where not has_table_privilege('resto_service_writer',format('%I.%I',item.s,item.n),privilege)) then
   raise exception 'Mission 3: writer table grants missing on %.%',item.s,item.n;
  end if;
 end loop;
 if not exists(select 1 from pg_attribute where attrelid='public.reservations'::regclass
  and attname='edit_version' and atttypid='uuid'::regtype and attnotnull and not attisdropped)
  or to_regprocedure('public.update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text)') is null
  or to_regprocedure('public.reception_update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,text)') is null
  or not exists(select 1 from pg_trigger where tgrelid='public.reservations'::regclass
    and tgname='bump_reservation_edit_version' and tgenabled='O')
  or not exists(select 1 from pg_trigger where tgrelid='public.reservation_tables'::regclass
    and tgname='invalidate_reservation_edit_version' and tgenabled='O') then
  raise exception 'Mission 3: install and validate Mission 2 first';
 end if;
 for item in select p.oid,p.proowner,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.proname in ('update_reservation_v4','reception_update_reservation_v4') loop
  if item.proowner<>writer or not coalesce('search_path=""'=any(item.proconfig),false) then
   raise exception 'Mission 3: V4 owner/search_path drift';
  end if;
 end loop;
end $preflight$;

-- Acquire this BEFORE any row/day/table/draft lock in every public mutation.
-- Reentrant within one transaction, including nested legacy calls.
create or replace function private.lock_restaurant_mutation_v1()
returns uuid language plpgsql security definer set search_path='' as $body$
declare rid uuid:=private.staff_restaurant();
begin
 if auth.uid() is null or rid is null or coalesce(private.current_staff_role(),'') not in ('fb_admin','reception') then
  raise exception 'Compte non autorisé.' using errcode='42501',detail='FORBIDDEN';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('restaurant-mutation-v1:'||rid::text,0));
 return rid;
end $body$;
alter function private.lock_restaurant_mutation_v1() owner to resto_service_writer;
revoke all on function private.lock_restaurant_mutation_v1() from public,anon;
grant execute on function private.lock_restaurant_mutation_v1() to authenticated;

-- Notes remain opaque and are never truncated by SQL. Preserve roomless hotel
-- history when unchanged; require a room for a new hotel booking.
create or replace function private.validate_booking_identity_v1(p_room text,p_notes text,p_previous_room text default null,p_edit boolean default false)
returns void language plpgsql set search_path='' as $body$
declare hotel boolean:=position('[RESTOMANAGER:HOTEL]' in coalesce(p_notes,''))>0;
 exterior boolean:=position('[RESTOMANAGER:EXTERIEUR]' in coalesce(p_notes,''))>0;
 room text:=nullif(btrim(p_room),'');
begin
 if (hotel and exterior) or (exterior and room is not null) then
  raise exception 'Le type de client et la chambre ne correspondent pas.' using errcode='22023',detail='INVALID_INPUT';end if;
 if hotel and room is null and not (p_edit and nullif(btrim(p_previous_room),'') is null) then
  raise exception 'Indiquez le numéro de chambre du client hôtel.' using errcode='22023',detail='ROOM_REQUIRED';end if;
end $body$;
alter function private.validate_booking_identity_v1(text,text,text,boolean) owner to resto_service_writer;
revoke all on function private.validate_booking_identity_v1(text,text,text,boolean) from public,anon,authenticated;

create or replace function private.lock_direct_service_mutation_v1()
returns trigger language plpgsql security invoker set search_path='' as $body$
begin
 -- Administrative maintenance (without a JWT) must use its own maintenance window.
 -- Normal staff DML is serialized BEFORE PostgreSQL takes target row locks.
 if auth.uid() is not null then perform private.lock_restaurant_mutation_v1();end if;
 return null;
end $body$;
revoke all on function private.lock_direct_service_mutation_v1() from public,anon,authenticated;
do $triggers$
declare n text;
begin
 foreach n in array array['restaurant_rooms','restaurant_hours','fb_reservation_alerts','reservation_change_alerts'] loop
  execute format('drop trigger if exists mission3_statement_lock on public.%I',n);
  execute format('create trigger mission3_statement_lock before insert or update or delete on public.%I for each statement execute function private.lock_direct_service_mutation_v1()',n);
 end loop;
end $triggers$;

-- Read-only server capability/revision fence; revisions are text to avoid JS bigint loss.
grant select on public.restaurant_service_changes to resto_service_writer;
drop policy if exists mission3_writer_read_revision on public.restaurant_service_changes;
create policy mission3_writer_read_revision on public.restaurant_service_changes for select to resto_service_writer
 using (restaurant_id=(select private.staff_restaurant()));
create or replace function public.service_sync_state_v1()
returns jsonb language plpgsql security definer set search_path='' as $body$
declare rid uuid:=private.staff_restaurant();rev text;
begin
 if auth.uid() is null or rid is null or coalesce(private.current_staff_role(),'') not in ('fb_admin','reception') then
  raise exception 'Compte non autorisé.' using errcode='42501',detail='FORBIDDEN';end if;
 select revision::text into rev from public.restaurant_service_changes where restaurant_id=rid;
 return jsonb_build_object('revision',coalesce(rev,'0'),'server_time',clock_timestamp(),
  'capabilities',jsonb_build_object('reservation_edits',4,'booking_recovery',1,'snapshot',1));
end $body$;
alter function public.service_sync_state_v1() owner to resto_service_writer;
revoke all on function public.service_sync_state_v1() from public,anon;
grant execute on function public.service_sync_state_v1() to authenticated;

-- No lock_token is exposed. Same staff account AND tenant, same lock as confirmation.
create or replace function public.booking_draft_status_v1(p_key text)
returns jsonb language plpgsql security definer set search_path='' as $body$
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
end $body$;
alter function public.booking_draft_status_v1(text) owner to resto_service_writer;
revoke all on function public.booking_draft_status_v1(text) from public,anon;
grant execute on function public.booking_draft_status_v1(text) to authenticated;

-- Invariants belong to the database, including future callers and configuration races.
create or replace function private.table_label_number_v1(p_label text)
returns numeric language plpgsql immutable set search_path='' as $body$
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
end $body$;
alter function private.table_label_number_v1(text) owner to resto_service_writer;
revoke all on function private.table_label_number_v1(text) from public,anon,authenticated;

create or replace function private.guard_table_configuration_v1()
returns trigger language plpgsql security definer set search_path='' as $body$
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
end $body$;
alter function private.guard_table_configuration_v1() owner to resto_service_writer;
revoke all on function private.guard_table_configuration_v1() from public,anon,authenticated;
drop trigger if exists mission3_table_configuration on public.restaurant_tables;
create trigger mission3_table_configuration before insert or update on public.restaurant_tables for each row execute function private.guard_table_configuration_v1();

-- Editors capture table numbers. Renumbering/capacity changes must invalidate
-- their captured reservation version before a fresh number-to-UUID resolution.
-- Terminal history is immutable after closure and cannot have an active V4 editor.
create or replace function private.invalidate_table_editors_v1()
returns trigger language plpgsql security definer set search_path='' as $body$
declare v_reservation_id uuid;
begin
 if new.label is not distinct from old.label and new.seats is not distinct from old.seats
  and new.room_id is not distinct from old.room_id and new.active is not distinct from old.active then return null;end if;
 for v_reservation_id in select r.id from public.reservations r join public.reservation_tables a on a.reservation_id=r.id
  where a.table_id=new.id and r.status in ('reserved','confirmed','late','arrived') order by r.id loop
  update public.reservations set edit_version=gen_random_uuid() where reservations.id=v_reservation_id;
 end loop;
 return null;
end $body$;
alter function private.invalidate_table_editors_v1() owner to resto_service_writer;
revoke all on function private.invalidate_table_editors_v1() from public,anon,authenticated;
drop trigger if exists mission3_invalidate_table_editors on public.restaurant_tables;
create trigger mission3_invalidate_table_editors after update of label,seats,room_id,active on public.restaurant_tables
 for each row execute function private.invalidate_table_editors_v1();

create or replace function private.guard_room_configuration_v1()
returns trigger language plpgsql security definer set search_path='' as $body$
begin
 if new.restaurant_id is distinct from old.restaurant_id or new.id is distinct from old.id then
  raise exception 'Identité de salle non modifiable.' using errcode='23514',detail='INVALID_INPUT';end if;
 if old.active and not new.active and exists(select 1 from public.restaurant_tables t join public.reservation_tables rt on rt.table_id=t.id
  join public.reservations r on r.id=rt.reservation_id where t.room_id=old.id
   and r.status in ('reserved','confirmed','late','arrived','seated') and (r.ends_at>clock_timestamp() or r.status='seated')) then
  raise exception 'Des réservations utilisent cette salle.' using errcode='23514',detail='ROOM_IN_USE';end if;
 return new;
end $body$;
alter function private.guard_room_configuration_v1() owner to resto_service_writer;
revoke all on function private.guard_room_configuration_v1() from public,anon,authenticated;
drop trigger if exists mission3_room_configuration on public.restaurant_rooms;
create trigger mission3_room_configuration before update on public.restaurant_rooms for each row execute function private.guard_room_configuration_v1();

create or replace function private.guard_fusion_removal_v1()
returns trigger language plpgsql security definer set search_path='' as $body$
declare ids uuid[];
begin
 for ids in select array_agg(a.table_id order by a.table_id) from public.reservation_tables a
  join public.reservations r on r.id=a.reservation_id where r.status in ('reserved','confirmed','late','arrived','seated')
  and r.id in (select reservation_id from public.reservation_tables where table_id in (old.table_a,old.table_b)) group by r.id loop
  if not private.check_fusion_selection(ids) then
   raise exception 'Une réservation utilise cette fusion. Modifiez son attribution avant de séparer les tables.' using errcode='23514',detail='FUSION_IN_USE';end if;
 end loop;
 return null;
end $body$;
alter function private.guard_fusion_removal_v1() owner to resto_service_writer;
revoke all on function private.guard_fusion_removal_v1() from public,anon,authenticated;
drop trigger if exists mission3_fusion_removal on public.table_fusion_links;
create trigger mission3_fusion_removal after delete on public.table_fusion_links for each row execute function private.guard_fusion_removal_v1();


-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
CREATE OR REPLACE FUNCTION public.confirm_reservation_v3(p_guest_name text, p_hotel_room text, p_party_size integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_table_ids uuid[], p_owner_token uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin
 perform private.lock_restaurant_mutation_v1(); if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN'; end if; return private.confirm_reservation_v3($1,$2,$3,$4,$5,$6,$7,$8); end$function$
;

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
CREATE OR REPLACE FUNCTION public.install_walkin_v3(p_table uuid, p_guests integer, p_name text, p_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin
 perform private.lock_restaurant_mutation_v1(); if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN'; end if; return private.install_walkin_v3($1,$2,$3,$4); end$function$
;

-- Existing business rules retained; tenant mutex precedes all existing locks.
CREATE OR REPLACE FUNCTION public.acquire_table_hold_v2(p_table_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_owner_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin
 perform private.lock_restaurant_mutation_v1(); if staff is distinct from 'fb_admin' then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN'; end if; return private.acquire_table_hold_v2($1,$2,$3,$4); end$function$
;

-- Existing business rules retained; tenant mutex precedes all existing locks.
CREATE OR REPLACE FUNCTION public.change_reservation_status_v3(p_reservation_id uuid, p_expected text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare staff text:=private.current_staff_role(); begin
 perform private.lock_restaurant_mutation_v1(); if staff is distinct from 'fb_admin' and not coalesce(staff='reception' and p_status in ('confirmed','late'),false) then raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN'; end if; perform private.change_reservation_status_v3($1,$2,$3); end$function$
;

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- V4 core: same tenant/room lock protocol as creation, stable conflict categories.
create or replace function private.update_reservation_v4(
 p_reservation_id uuid,p_expected_version uuid,p_guest_name text,p_hotel_room text,
 p_party_size integer,p_starts_at timestamptz,p_ends_at timestamptz,p_table_ids uuid[],p_notes text
) returns uuid language plpgsql security definer set search_path='' as $$
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
end $$;
alter function private.update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text) owner to resto_service_writer;
revoke all on function private.update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text) from public,anon,authenticated;

-- Existing business rules retained; tenant mutex precedes all existing locks.
create or replace function public.update_reservation_v4(
 p_reservation_id uuid,p_expected_version uuid,p_guest_name text,p_hotel_room text,
 p_party_size integer,p_starts_at timestamptz,p_ends_at timestamptz,p_table_ids uuid[],p_notes text
) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_restaurant_mutation_v1();
 if private.current_staff_role() is distinct from 'fb_admin' then
  raise exception 'Action réservée à l’équipe en salle.' using errcode='42501',detail='FORBIDDEN';
 end if;
 return private.update_reservation_v4($1,$2,$3,$4,$5,$6,$7,$8,$9);
end $$;

-- Existing business rules retained; tenant mutex precedes all existing locks.
create or replace function public.reception_update_reservation_v4(
 p_reservation_id uuid,p_expected_version uuid,p_guest_name text,p_hotel_room text,
 p_party_size integer,p_starts_at timestamptz,p_ends_at timestamptz,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
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
end $$;

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.
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

-- Existing business rules retained; tenant mutex precedes all existing locks.


-- Existing business rules retained; tenant mutex precedes all existing locks.


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

-- Draft key is the idempotency key. Status and every action lock in the same order.
create or replace function public.booking_draft_v3(
 p_key uuid,p_action text,p_start timestamptz default null,p_end timestamptz default null,
 p_guests integer default null,p_tables uuid[] default null,p_name text default null,
 p_room text default null,p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $body$
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
end $body$;
alter function public.booking_draft_v3(uuid,text,timestamptz,timestamptz,integer,uuid[],text,text,text) owner to resto_service_writer;
revoke all on function public.booking_draft_v3(uuid,text,timestamptz,timestamptz,integer,uuid[],text,text,text) from public,anon;
grant execute on function public.booking_draft_v3(uuid,text,timestamptz,timestamptz,integer,uuid[],text,text,text) to authenticated;

-- The fusion API formerly relied on authenticated direct writes. It now uses the
-- tenant-constrained writer and retains its explicit Restaurant role check.
alter function public.change_fusion_link_v3(uuid[],uuid[]) owner to resto_service_writer;
revoke all on function public.change_fusion_link_v3(uuid[],uuid[]) from public,anon;
grant execute on function public.change_fusion_link_v3(uuid[],uuid[]) to authenticated;

-- Revoke BOTH relation and column ACLs. A table REVOKE alone leaves column ACLs.
-- TRUNCATE bypasses row policies and is never a staff application operation.
do $close_direct_dml$
declare item record;col record;n text;
begin
 for item in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
   and c.relname in ('restaurants','restaurant_rooms','restaurant_hours','restaurant_tables','reservations','reservation_tables',
    'table_holds','table_fusion_links','staff_profiles','staff_password_reset_audit','fb_reservation_alerts',
    'reservation_change_alerts','restaurant_service_changes','service_closures') loop
  execute format('revoke truncate,references,trigger on table %I.%I from public,anon,authenticated',item.nspname,item.relname);
  for col in select attname from pg_attribute where attrelid=item.oid and attnum>0 and not attisdropped loop
   execute format('revoke references(%I) on table %I.%I from public,anon,authenticated',col.attname,item.nspname,item.relname);
  end loop;
 end loop;
 foreach n in array array['restaurant_tables','table_fusion_links','reservations','reservation_tables','table_holds'] loop
  execute format('revoke insert,update,delete on table public.%I from public,anon,authenticated',n);
  for col in select a.attname from pg_attribute a where a.attrelid=format('public.%I',n)::regclass and a.attnum>0 and not a.attisdropped loop
   execute format('revoke insert(%I),update(%I) on table public.%I from public,anon,authenticated',col.attname,col.attname,n);
  end loop;
 end loop;
end $close_direct_dml$;
revoke all on function private.release_table_hold(uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
