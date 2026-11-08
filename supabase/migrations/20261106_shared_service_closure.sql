-- Integration-only Supabase shared service closeout.
create table if not exists public.service_closures (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null,
 service_date date not null,
 closed_at timestamptz not null default now(),
 closed_by uuid not null,
 close_mode text not null check(close_mode in ('manual','automatic')),
 served_covers integer not null,
 served_groups integer not null,
 walkin_covers integer not null,
 hotel_covers integer not null,
 no_show_groups integer not null,
 cancelled_groups integer not null,
 unique(restaurant_id,service_date)
);
create index if not exists service_closures_restaurant_date_idx
 on public.service_closures(restaurant_id,service_date desc);
alter table public.service_closures enable row level security;
revoke all on public.service_closures from public,anon,authenticated;
grant select on public.service_closures to authenticated;
create policy "restaurant read own service closures" on public.service_closures for select to authenticated
 using(restaurant_id=(select private.staff_restaurant()) and (select private.current_staff_role())='fb_admin');
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
revoke all on function public.close_service_v3(date,text) from public,anon;
grant execute on function public.close_service_v3(date,text) to authenticated;
create or replace function private.guard_closed_service_reservations()
returns trigger language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function private.guard_closed_service_reservations() from public,anon,authenticated;
drop trigger if exists guard_closed_service_reservations on public.reservations;
create trigger guard_closed_service_reservations before insert or update or delete on public.reservations
 for each row execute function private.guard_closed_service_reservations();
