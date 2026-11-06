alter table public.table_holds add column draft_role text check(draft_role in ('fb_admin','reception'));
create table private.booking_drafts_v3(
 key uuid primary key, staff uuid not null, lock_token uuid not null default gen_random_uuid(),
 ids uuid[] not null, guests integer not null, starts timestamptz not null, ends timestamptz not null,
 expires timestamptz not null, booking uuid
);
revoke all on private.booking_drafts_v3 from public,anon,authenticated;
create index on private.booking_drafts_v3(expires);

create function private.ranked_booking_sets(p_reservation uuid,previous uuid[],p_guests integer,p_start timestamptz,p_end timestamptz)
returns table(ids uuid[]) language sql stable set search_path='' as $rank$
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
$rank$;
revoke all on function private.ranked_booking_sets(uuid,uuid[],integer,timestamptz,timestamptz) from public,anon,authenticated;
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
end $$;
revoke all on function public.reception_booking_v3(uuid,text,text,integer,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.reception_booking_v3(uuid,text,text,integer,timestamptz,timestamptz,text) to authenticated;


create function public.booking_draft_v3(p_key uuid,p_action text,p_start timestamptz default null,
 p_end timestamptz default null,p_guests integer default null,p_tables uuid[] default null,
 p_name text default null,p_room text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function public.booking_draft_v3(uuid,text,timestamptz,timestamptz,integer,uuid[],text,text,text) from public,anon;
grant execute on function public.booking_draft_v3(uuid,text,timestamptz,timestamptz,integer,uuid[],text,text,text) to authenticated;
-- Editing another reservation, including through a shared team login, must respect a draft.
do $$ declare src text;new_src text;
begin
 src:=pg_get_functiondef('private.update_reservation_v3(uuid,text,integer,timestamptz,timestamptz,uuid[],text)'::regprocedure);
 new_src:=replace(src,'h.held_by<>auth.uid()','(h.draft_role is not null or h.held_by<>auth.uid())');
 if new_src=src then raise exception 'Unexpected update function';end if;
 execute new_src;
end $$;
grant select(draft_role) on public.table_holds to authenticated;
