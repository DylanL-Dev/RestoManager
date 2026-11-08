create table public.restaurant_hours (
 id integer primary key check (id=1),
 lunch_enabled boolean not null, lunch_start time not null, lunch_end time not null,
 dinner_enabled boolean not null, dinner_start time not null, dinner_end time not null,
 duration integer not null check (duration in (30,45,60,75,90,105,120,150,180)),
 check (lunch_start<lunch_end and dinner_start<dinner_end),
 check (not (lunch_enabled and dinner_enabled) or lunch_end<dinner_start)
);
insert into public.restaurant_hours values (1,true,'12:00','14:30',true,'19:00','21:30',90);
alter table public.restaurant_hours enable row level security;
revoke all on public.restaurant_hours from public,anon,authenticated;
grant select,update on public.restaurant_hours to authenticated;
create policy staff_read on public.restaurant_hours for select to authenticated
 using ((select private.current_staff_role()) in ('fb_admin','reception'));
create policy admin_edit on public.restaurant_hours for update to authenticated
 using ((select private.current_staff_role())='fb_admin') with check ((select private.current_staff_role())='fb_admin');
alter publication supabase_realtime add table public.restaurant_hours;

alter table public.reservations add column walkin_type text check(walkin_type in ('hotel','exterieur'));
create function public.install_walkin_v3(p_table uuid,p_guests integer,p_name text,p_type text)
returns uuid language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function public.install_walkin_v3(uuid,integer,text,text) from public,anon;
grant execute on function public.install_walkin_v3(uuid,integer,text,text) to authenticated;
