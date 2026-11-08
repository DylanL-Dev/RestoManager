-- RestoManager integration-only reference migration (already applied to test Supabase).
-- Never run against the restaurant's production database without review.
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
 if (select auth.uid()) is null or private.current_staff_role() is distinct from 'fb_admin' or v_restaurant is null then
  raise exception 'Placement réservé à l’équipe du restaurant.' using errcode='42501';
 end if;
 if p_target_reservation_id is null or jsonb_typeof(p_changes) is distinct from 'array'
   or jsonb_array_length(p_changes) not between 1 and 8 then
  raise exception 'Réorganisation invalide.' using errcode='22023';
 end if;
 if (select count(distinct (e->>'id')) from jsonb_array_elements(p_changes) e) <> jsonb_array_length(p_changes)
   or (select count(*) from jsonb_array_elements(p_changes) e where e->>'id'=p_target_reservation_id::text) <> 1 then
  raise exception 'Réservations incohérentes.' using errcode='22023';
 end if;
 -- Serialize this operation with other smart placement actions in the same restaurant.
 perform pg_advisory_xact_lock(hashtextextended('smart-placement:'||v_restaurant::text,0));
 -- Existing creation and status RPCs also lock individual tables. Use the same lock key.
 -- Lock reservations first, matching the existing RPC lock order.
 perform 1 from public.reservations r
  where r.id in (select (e->>'id')::uuid from jsonb_array_elements(p_changes) e)
  order by r.id for update;
 for v_table in
  select distinct tbl from (
   select (e->>'from_table')::uuid tbl from jsonb_array_elements(p_changes) e
   union all
   select (e->>'to_table')::uuid tbl from jsonb_array_elements(p_changes) e
  ) q order by tbl
 loop
  if v_table is null then raise exception 'Table manquante.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_table::text,0));
 end loop;
 for v_entry in
  select x.* from jsonb_to_recordset(p_changes)
   as x(id uuid,from_table uuid,to_table uuid,expected_status text) order by id
 loop
  v_count := v_count + 1;
  if v_entry.id is null or v_entry.from_table is null or v_entry.to_table is null
    or v_entry.expected_status is null or v_entry.from_table=v_entry.to_table then
   raise exception 'Modification de table invalide.' using errcode='22023';
  end if;
  select * into v_res from public.reservations
    where id=v_entry.id and restaurant_id=v_restaurant;
  if not found then raise exception 'Réservation introuvable dans cet établissement.' using errcode='42501'; end if;
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
   where t.id=v_entry.to_table and t.restaurant_id=v_restaurant and t.active;
  if not found or v_seats<v_res.party_size then
   raise exception 'Table désactivée ou capacité insuffisante.' using errcode='22023';
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
  raise exception 'Réorganisation incomplète.' using errcode='22023';
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
revoke all on function public.apply_smart_placement_v3(uuid,jsonb) from public, anon;
grant execute on function public.apply_smart_placement_v3(uuid,jsonb) to authenticated;
