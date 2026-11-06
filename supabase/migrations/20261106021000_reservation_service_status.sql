alter table public.reservations
  add column arrived_at timestamptz,
  add column seated_at timestamptz,
  add column released_at timestamptz,
  add column confirmed_at timestamptz,
  drop constraint reservations_status_check,
  add constraint reservations_status_check check (status in
    ('reserved','confirmed','late','arrived','seated','completed','released','departed','cancelled','no_show'));

-- Keep confirmed and late bookings blocking in the existing hold and booking checks.
do $$
declare
  routine regprocedure;
  original text;
  revised text;
begin
  for routine in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'private'::regnamespace and p.proname in ('acquire_table_hold','confirm_reservation')
  loop
    original := pg_get_functiondef(routine);
    revised := replace(original, 'r.status in (''reserved'',''arrived'',''seated'')',
                                 'r.status in (''reserved'',''confirmed'',''late'',''arrived'',''seated'')');
    if revised = original then raise exception 'Unexpected availability function: %', routine; end if;
    execute revised;
  end loop;
end $$;

create function public.change_reservation_status_v3(
  p_reservation_id uuid, p_expected text, p_status text
) returns void language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.change_reservation_status_v3(uuid,text,text) from public, anon;
grant execute on function public.change_reservation_status_v3(uuid,text,text) to authenticated;
