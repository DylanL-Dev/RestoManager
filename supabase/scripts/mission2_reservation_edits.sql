-- Mission 2 / FUN-02 + CONC-01. Prepared script: NOT applied to the shared project.
-- Apply as database administrator only after validation on an isolated copy.
-- Prerequisite: current tenant-isolated V3 schema, including resto_service_writer.
-- This is NOT a baseline migration for an empty database.
begin;

do $$
begin
 if not exists(select 1 from pg_roles where rolname='resto_service_writer' and not rolbypassrls and not rolsuper)
    or not exists(select 1 from pg_class where oid='public.reservations'::regclass and relrowsecurity
                  and pg_get_userbyid(relowner)<>'resto_service_writer')
    or (select count(*) from pg_policies where schemaname='public' and tablename in ('reservations','reservation_tables')
        and policyname='same_restaurant' and permissive='RESTRICTIVE' and cmd='ALL')<>2
    or to_regprocedure('private.update_reservation_v3(uuid,text,integer,timestamptz,timestamptz,uuid[],text)') is null
    or to_regprocedure('private.ranked_booking_sets(uuid,uuid[],integer,timestamptz,timestamptz)') is null then
  raise exception 'Mission 2: tenant-isolated V3 prerequisites are missing. No change applied.';
 end if;
 if exists(select 1 from pg_attribute where attrelid='public.reservations'::regclass
           and attname='edit_version' and not attisdropped and (atttypid<>'uuid'::regtype or not attnotnull)) then
  raise exception 'Mission 2: unexpected edit_version column. Review schema drift before applying.';
 end if;
end $$;

-- Opaque UUID revision: safe across JSON/JavaScript, no timestamp precision loss.
alter table public.reservations add column if not exists edit_version uuid not null default gen_random_uuid();

create or replace function private.bump_reservation_edit_version()
returns trigger language plpgsql set search_path='' as $$
begin
 new.edit_version:=gen_random_uuid();
 return new;
end $$;
revoke all on function private.bump_reservation_edit_version() from public,anon,authenticated;
drop trigger if exists bump_reservation_edit_version on public.reservations;
create trigger bump_reservation_edit_version before insert or update on public.reservations
for each row execute function private.bump_reservation_edit_version();

-- Also invalidate open editors after a table-only smart placement. Do not rely
-- on every future caller remembering to touch the reservation row explicitly.
create or replace function private.invalidate_reservation_edit_version()
returns trigger language plpgsql security invoker set search_path='' as $$
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
end $$;
alter function private.invalidate_reservation_edit_version() owner to resto_service_writer;
revoke all on function private.invalidate_reservation_edit_version() from public,anon,authenticated;
drop trigger if exists invalidate_reservation_edit_version on public.reservation_tables;
create trigger invalidate_reservation_edit_version after insert or update or delete on public.reservation_tables
for each row execute function private.invalidate_reservation_edit_version();

create or replace function private.update_reservation_v4(
 p_reservation_id uuid,p_expected_version uuid,p_guest_name text,p_hotel_room text,
 p_party_size integer,p_starts_at timestamptz,p_ends_at timestamptz,p_table_ids uuid[],p_notes text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_status text;v_version uuid;v_old_room text;v_room text:=nullif(btrim(p_hotel_room),'');
 v_table uuid;v_lock_room text;v_count integer;v_seats integer;
begin
 if auth.uid() is null or coalesce(private.current_staff_role(),'') not in ('reception','fb_admin') then
  raise exception 'Accès refusé' using errcode='42501';
 end if;
 if p_expected_version is null then
  raise exception 'Actualisez la fiche avant de la modifier.' using errcode='RM002';
 end if;
 if p_guest_name is null or length(btrim(p_guest_name)) not between 1 and 160
    or p_party_size is null or p_party_size not between 1 and 50
    or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at
    or p_ends_at-p_starts_at>interval '6 hours' or (v_room is not null and length(v_room)>40)
    or p_table_ids is null or cardinality(p_table_ids) not between 1 and 20
    or array_position(p_table_ids,null) is not null
    or (select count(distinct x) from unnest(p_table_ids) x)<>cardinality(p_table_ids) then
  raise exception 'Données invalides' using errcode='22023';
 end if;
 -- RLS applies to this non-owner, non-BYPASSRLS function owner.
 select status,hotel_room,edit_version into v_status,v_old_room,v_version
  from public.reservations where id=p_reservation_id for update;
 if not found then raise exception 'Réservation introuvable' using errcode='P0002';end if;
 if v_version is distinct from p_expected_version then
  raise exception 'Cette réservation a été modifiée. Votre saisie n’a pas été enregistrée.' using errcode='RM001';
 end if;
 if v_status not in ('reserved','confirmed','late','arrived') then
  raise exception 'Statut non modifiable' using errcode='22023';
 end if;
 if not private.check_fusion_selection(p_table_ids) then
  raise exception 'Tables non fusionnables' using errcode='22023';
 end if;
 -- Preserve the existing table lock keys and global ordering.
 for v_table in select distinct x from (
   select table_id x from public.reservation_tables where reservation_id=p_reservation_id
   union select unnest(p_table_ids)) z order by x loop
  perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 end loop;
 -- Same room lock namespace as creation. Lock both old/new identities in order.
 for v_lock_room in select distinct lower(btrim(x)) from unnest(array[v_old_room,v_room]) x
                    where nullif(btrim(x),'') is not null order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended('hotel-room:'||v_lock_room,0));
 end loop;
 select count(*),coalesce(sum(seats),0) into v_count,v_seats
  from public.restaurant_tables where id=any(p_table_ids) and active;
 if v_count<>cardinality(p_table_ids) or v_seats<p_party_size then
  raise exception 'Capacité ou table invalide' using errcode='22023';
 end if;
 if exists(select 1 from public.reservation_tables rt join public.reservations r on r.id=rt.reservation_id
   where rt.table_id=any(p_table_ids) and r.id<>p_reservation_id
   and r.status in ('reserved','confirmed','late','arrived','seated')
   and r.starts_at<p_ends_at and r.ends_at>p_starts_at)
 or exists(select 1 from public.table_holds h where h.table_id=any(p_table_ids)
   and (h.draft_role is not null or h.held_by<>auth.uid()) and h.expires_at>clock_timestamp()
   and h.starts_at<p_ends_at and h.ends_at>p_starts_at) then
  raise exception 'Table occupée sur ce créneau' using errcode='23P01';
 end if;
 if v_room is not null and exists(select 1 from public.reservations r where r.id<>p_reservation_id
   and lower(btrim(r.hotel_room))=lower(v_room) and r.status in ('reserved','confirmed','late','arrived','seated')
   and r.starts_at<p_ends_at and r.ends_at>p_starts_at) then
  raise exception 'Chambre déjà réservée sur ce créneau' using errcode='23P01';
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

create or replace function public.update_reservation_v4(
 p_reservation_id uuid,p_expected_version uuid,p_guest_name text,p_hotel_room text,
 p_party_size integer,p_starts_at timestamptz,p_ends_at timestamptz,p_table_ids uuid[],p_notes text
) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if private.current_staff_role() is distinct from 'fb_admin' then
  raise exception 'Action réservée à l’équipe en salle.' using errcode='42501';
 end if;
 return private.update_reservation_v4($1,$2,$3,$4,$5,$6,$7,$8,$9);
end $$;
alter function public.update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text) owner to resto_service_writer;
revoke all on function public.update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text) from public,anon;
grant execute on function public.update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,uuid[],text) to authenticated;

create or replace function public.reception_update_reservation_v4(
 p_reservation_id uuid,p_expected_version uuid,p_guest_name text,p_hotel_room text,
 p_party_size integer,p_starts_at timestamptz,p_ends_at timestamptz,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record;previous uuid[];v_version uuid;v_start timestamptz;
begin
 if auth.uid() is null or private.current_staff_role() is distinct from 'reception' then
  raise exception 'Accès réservé à la réception.' using errcode='42501';
 end if;
 select edit_version,starts_at into v_version,v_start from public.reservations where id=p_reservation_id for update;
 if not found then raise exception 'Réservation introuvable' using errcode='P0002';end if;
 if p_expected_version is null then raise exception 'Actualisez la fiche.' using errcode='RM002';end if;
 if v_version is distinct from p_expected_version then
  raise exception 'Cette réservation a été modifiée. Votre saisie n’a pas été enregistrée.' using errcode='RM001';
 end if;
 if p_party_size is null or p_party_size not between 1 and 50 or p_starts_at is null
    or p_ends_at is null or p_ends_at<=p_starts_at or p_ends_at-p_starts_at>interval '6 hours' then
  raise exception 'Créneau ou couverts invalides.' using errcode='22023';
 end if;
 if v_start is distinct from p_starts_at and (p_starts_at<now()-interval '5 minutes' or not exists(
  select 1 from public.restaurant_hours h where h.id=1 and
  ((h.lunch_enabled and (p_starts_at at time zone 'Europe/Paris')::time between h.lunch_start and h.lunch_end)
   or (h.dinner_enabled and (p_starts_at at time zone 'Europe/Paris')::time between h.dinner_start and h.dinner_end))
 )) then raise exception 'Choisissez un créneau à venir pendant un service ouvert.' using errcode='22023';end if;
 select array_agg(table_id order by table_id) into previous from public.reservation_tables where reservation_id=p_reservation_id;
 for candidate in select * from private.ranked_booking_sets(p_reservation_id,previous,p_party_size,p_starts_at,p_ends_at) loop
  begin
   v_version:=private.update_reservation_v4(p_reservation_id,p_expected_version,p_guest_name,p_hotel_room,
    p_party_size,p_starts_at,p_ends_at,candidate.ids,p_notes);
   return jsonb_build_object('tables',candidate.ids,'edit_version',v_version);
  exception when exclusion_violation then
   if sqlerrm ilike '%chambre%' then raise;end if;
  end;
 end loop;
 raise exception 'Aucune table disponible pour ce créneau et ce nombre de couverts.' using errcode='23P01';
end $$;
alter function public.reception_update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,text) owner to resto_service_writer;
revoke all on function public.reception_update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.reception_update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,text) to authenticated;

-- Fail closed for old tabs / clients without a captured version. Existing
-- reception_booking_v3 creation (p_reservation=NULL) remains unchanged.
create or replace function private.update_reservation_v3(
 p_reservation_id uuid,p_guest_name text,p_party_size integer,p_starts_at timestamptz,
 p_ends_at timestamptz,p_table_ids uuid[],p_notes text default null
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Cette version de l’application ne protège pas les modifications. Actualisez la page.' using errcode='RM002';
end $$;
alter function private.update_reservation_v3(uuid,text,integer,timestamptz,timestamptz,uuid[],text) owner to resto_service_writer;

notify pgrst,'reload schema';
commit;
