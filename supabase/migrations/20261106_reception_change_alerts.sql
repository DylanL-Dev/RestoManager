-- RestoManager integration: reservation changes made by Reception notify the Restaurant.
-- Apply once to test Supabase. Kept with GitHub integration branch for later rollout.
create table if not exists public.reservation_change_alerts (
 id uuid primary key default gen_random_uuid(),
 reservation_id uuid not null,
 restaurant_id uuid not null,
 event_type text not null check (event_type in ('modified','cancelled')),
 guest_name text not null,
 hotel_room text,
 party_size integer not null,
 starts_at timestamptz not null,
 previous_guest_name text,
 previous_hotel_room text,
 previous_party_size integer,
 previous_starts_at timestamptz,
 changed_fields text[] not null default array[]::text[],
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index if not exists reservation_change_alerts_restaurant_created_idx
 on public.reservation_change_alerts (restaurant_id,created_at desc);
alter table public.reservation_change_alerts enable row level security;
revoke all on table public.reservation_change_alerts from public,anon,authenticated;
grant select on table public.reservation_change_alerts to authenticated;
grant update (read_at) on table public.reservation_change_alerts to authenticated;
create policy "restaurant reads change alerts"
 on public.reservation_change_alerts for select to authenticated
 using (
  restaurant_id=(select private.staff_restaurant())
  and (select private.current_staff_role())='fb_admin'
 );
create policy "restaurant acknowledges change alerts"
 on public.reservation_change_alerts for update to authenticated
 using (
  restaurant_id=(select private.staff_restaurant())
  and (select private.current_staff_role())='fb_admin'
 )
 with check (
  restaurant_id=(select private.staff_restaurant())
  and (select private.current_staff_role())='fb_admin'
 );
create or replace function private.notify_fb_on_reception_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor record; changes text[]:=array[]::text[]; kind text;
begin
 select role,restaurant_id into actor
 from public.staff_profiles where user_id=(select auth.uid()) and active=true;
 if actor.role is distinct from 'reception' or actor.restaurant_id is distinct from new.restaurant_id then
  return new;
 end if;
 if old.status is distinct from 'cancelled' and new.status='cancelled' then
  kind:='cancelled';
 elsif new.status in ('reserved','confirmed','late','arrived')
   and (old.guest_name is distinct from new.guest_name
    or old.hotel_room is distinct from new.hotel_room
    or old.party_size is distinct from new.party_size
    or old.starts_at is distinct from new.starts_at
    or old.ends_at is distinct from new.ends_at
    or old.notes is distinct from new.notes) then
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
$$;
revoke all on function private.notify_fb_on_reception_change() from public,anon,authenticated;
drop trigger if exists reception_booking_change_alert on public.reservations;
create trigger reception_booking_change_alert
 after update on public.reservations
 for each row execute function private.notify_fb_on_reception_change();
