-- RCP-01: Prefer smaller compatible tables when Reception changes guest count.
-- Installed table is still preferred for name/notes/room/date edits.
-- Only define ranking; do not mutate reservations or assign tables here.
-- Always review and validate on disposable PostgreSQL before shared migration.
begin;

do $preflight$
begin
  if to_regprocedure('private.ranked_booking_sets(uuid,uuid[],integer,timestamptz,timestamptz)') is null then
    raise exception 'RCP-01: existing placement function missing; do not migrate';
  end if;
  if to_regprocedure('public.reception_update_reservation_v4(uuid,uuid,text,text,integer,timestamptz,timestamptz,text)') is null then
    raise exception 'RCP-01: Mission 2 V4 edit contract missing; do not migrate';
  end if;
end $preflight$;

CREATE OR REPLACE FUNCTION private.ranked_booking_sets(p_reservation uuid, previous uuid[], p_guests integer, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(ids uuid[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
   order by
     -- Preserve assignment for unchanged passenger counts; prioritize fit on count change.
     case
       when coalesce(
         (select r.party_size is distinct from p_guests
            from public.reservations r where r.id=p_reservation), false
       ) then 0
       when ids=previous then 0
       else 1
     end,
     seats,cardinality(ids),
     array(select coalesce(substring(t.label from '[0-9]+')::numeric,9999999999)
           from available t where t.id=any(c.ids) order by 1),ids
$function$;

commit;
