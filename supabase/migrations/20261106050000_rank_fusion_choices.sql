create or replace function public.reception_booking_v3(p_reservation uuid,p_name text,p_room text,p_guests integer,
 p_start timestamptz,p_end timestamptz,p_notes text)
returns uuid[] language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function public.reception_booking_v3(uuid,text,text,integer,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.reception_booking_v3(uuid,text,text,integer,timestamptz,timestamptz,text) to authenticated;

create function public.install_walkin_group_v3(p_tables uuid[],p_guests integer,p_name text,p_type text)
returns uuid language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function public.install_walkin_group_v3(uuid[],integer,text,text) from public,anon;
grant execute on function public.install_walkin_group_v3(uuid[],integer,text,text) to authenticated;

create function public.change_fusion_link_v3(p_old uuid[],p_new uuid[]) returns void
language plpgsql security invoker set search_path='' as $$
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
end $$;
revoke all on function public.change_fusion_link_v3(uuid[],uuid[]) from public,anon;
grant execute on function public.change_fusion_link_v3(uuid[],uuid[]) to authenticated;
