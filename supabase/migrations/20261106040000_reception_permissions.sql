-- Keep the existing transactional implementations; expose role-checked entry points.
do $migration$
declare f record; guard text; args text; invocation text;
begin
 for f in select p.oid,p.proname,p.pronargs,pg_get_function_arguments(p.oid) params,
   pg_get_function_identity_arguments(p.oid) signature,pg_get_function_result(p.oid) result
   from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
   ('change_reservation_status_v3','install_walkin_v3','cancel_reservation_v3',
    'acquire_table_hold_v2','confirm_reservation_v3','update_reservation_v3')
 loop
   execute format('alter function public.%I(%s) set schema private',f.proname,f.signature);
   execute format('revoke all on function private.%I(%s) from public,anon,authenticated',f.proname,f.signature);
   guard:='if staff is distinct from ''fb_admin'' then raise exception ''Action réservée à l’équipe en salle.'' using errcode=''42501''; end if;';
   if f.proname='change_reservation_status_v3' then
     guard:='if staff is distinct from ''fb_admin'' and not coalesce(staff=''reception'' and p_status in (''confirmed'',''late''),false) then raise exception ''Action réservée à l’équipe en salle.'' using errcode=''42501''; end if;';
   elsif f.proname='cancel_reservation_v3' then
     guard:='if staff=''reception'' then perform 1 from public.reservations where id=p_reservation_id and status in (''reserved'',''confirmed'',''late'',''arrived'') for update;
       if not found then raise exception ''Annulation impossible après installation.'' using errcode=''42501''; end if;
       elsif staff is distinct from ''fb_admin'' then raise exception ''Accès refusé'' using errcode=''42501''; end if;';
   end if;
   select string_agg('$'||i,',' order by i) into args from generate_series(1,f.pronargs) i;
   invocation:=format('private.%I(%s)',f.proname,args);
   execute format('create function public.%I(%s) returns %s language plpgsql security definer set search_path='''' as %L',
     f.proname,f.params,f.result,'declare staff text:=private.current_staff_role(); begin '||guard||
     case when f.result='void' then ' perform ' else ' return ' end||invocation||'; end');
   execute format('revoke all on function public.%I(%s) from public,anon; grant execute on function public.%I(%s) to authenticated',f.proname,f.signature,f.proname,f.signature);
 end loop;
end $migration$;
revoke execute on function private.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text),
 private.acquire_table_hold(uuid,timestamptz,timestamptz) from public,anon,authenticated;

create function public.reception_booking_v3(p_reservation uuid,p_name text,p_room text,p_guests integer,
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
   ), choices as (
    select array[id] ids,seats,label from available
    union all select array[least(a.id,b.id),greatest(a.id,b.id)],a.seats+b.seats,a.label
      from public.table_fusion_links f join available a on a.id=f.table_a join available b on b.id=f.table_b
    union all select previous,sum(seats)::integer,min(label) from available where id=any(previous)
      having count(*)=cardinality(previous)
   )
   select ids from choices where seats>=p_guests
   order by (ids=previous) desc nulls last,cardinality(ids),seats,length(label),label,ids
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
