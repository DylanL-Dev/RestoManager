-- RM-012.1: owner requested monitoring from 17/11/2026 and safe automatic closure.
-- Apply only after isolated validation and DEV impact review; never to PROD implicitly.
begin;
do $$begin if current_user<>'postgres' then raise exception 'Installer RM-012.1 sous le rôle administrateur postgres pour conserver un planificateur unique.';end if;end $$;
create extension if not exists pg_cron with schema pg_catalog;
create table if not exists public.service_regularization_policy (
 restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
 starts_on date not null default ((clock_timestamp() at time zone 'Europe/Paris')::date),
 automatic_closure boolean not null default true,
 activated_at timestamptz not null default clock_timestamp()
);
alter table public.service_regularization_policy enable row level security;
alter table public.service_regularization_policy force row level security;
revoke all on public.service_regularization_policy from public,anon,authenticated,resto_service_writer;
grant select on public.service_regularization_policy to authenticated,resto_service_writer;
drop policy if exists rm012_policy_read on public.service_regularization_policy;
create policy rm012_policy_read on public.service_regularization_policy for select to authenticated,resto_service_writer
 using(restaurant_id=(select private.staff_restaurant()) and (select private.current_staff_role())='fb_admin');
-- Explicit rollout date approved by owner. No booking, closure or restaurant hour backfill.
insert into public.service_regularization_policy(restaurant_id,starts_on,automatic_closure)
 select id,date '2026-11-17',true from public.restaurants on conflict(restaurant_id) do nothing;
drop trigger if exists rm012_policy_signal on public.service_regularization_policy;
create trigger rm012_policy_signal after insert or update on public.service_regularization_policy for each row execute function private.signal_restaurant_change();
create or replace function private.rm012_initialize_policy() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.service_regularization_policy(restaurant_id) values(new.id) on conflict do nothing;return new;
end $$;
alter function private.rm012_initialize_policy() owner to postgres;
revoke all on function private.rm012_initialize_policy() from public,anon,authenticated,resto_service_writer,service_role;
drop trigger if exists rm012_initialize_policy on public.restaurants;
create trigger rm012_initialize_policy after insert on public.restaurants for each row execute function private.rm012_initialize_policy();

alter table public.service_regularization_audit add column if not exists actor_kind text not null default 'user';
alter table public.service_regularization_audit alter column actor_id drop not null;
do $$begin
 if not exists(select 1 from pg_constraint where conname='rm012_audit_actor_kind' and conrelid='public.service_regularization_audit'::regclass) then
  alter table public.service_regularization_audit add constraint rm012_audit_actor_kind check(
   (actor_kind='user' and actor_id is not null) or (actor_kind='system' and actor_id is null and action='close_service'));
 end if;
end $$;
drop policy if exists rm012_audit_append on public.service_regularization_audit;
create policy rm012_audit_append on public.service_regularization_audit for insert to resto_service_writer
 with check(actor_kind='user' and restaurant_id=(select private.staff_restaurant()) and actor_id=(select auth.uid()) and (select private.current_staff_role()) in ('fb_admin','reception'));
alter table public.service_closures alter column closed_by drop not null;
do $$begin
 if not exists(select 1 from pg_constraint where conname='rm012_closure_actor' and conrelid='public.service_closures'::regclass) then
  alter table public.service_closures add constraint rm012_closure_actor check(close_mode='automatic' or closed_by is not null);
 end if;
end $$;
create or replace function private.rm012_services_api(p_date date,p_before date,p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rid uuid:=private.rm012_authorize();stamp timestamptz:=private.rm012_now();today date;dates date[];services jsonb:='[]';history jsonb;notifications jsonb;selected date;d date;more boolean;history_more boolean;history_cursor date;rev text;policy public.service_regularization_policy;begin
 today:=(stamp at time zone 'Europe/Paris')::date;
 select * into policy from public.service_regularization_policy where restaurant_id=rid;
 if not found then raise exception 'Le suivi de fin de service n’est pas activé pour cet établissement.' using errcode='RM012';end if;
 if p_date>today or p_limit is null or p_limit not between 1 and 60 then raise exception 'Date ou pagination invalide.' using errcode='22023';end if;
 select array_agg(service_day order by service_day desc) into dates from (
  select distinct service_day from (
   select (r.starts_at at time zone 'Europe/Paris')::date as service_day from public.reservations r where r.restaurant_id=rid
   union select (h.starts_at at time zone 'Europe/Paris')::date from public.table_holds h where h.restaurant_id=rid and h.expires_at>stamp
  ) candidates where service_day>=policy.starts_on and service_day<=today and (p_before is null or service_day<p_before)
   and not exists(select 1 from public.service_closures c where c.restaurant_id=rid and c.service_date=service_day)
  order by service_day desc limit p_limit+1
 ) days;
 more:=coalesce(cardinality(dates)>p_limit,false);
 foreach d in array coalesce(dates[1:p_limit],array[]::date[]) loop
  services:=services||jsonb_build_array(private.rm012_day(rid,d,stamp));
 end loop;
 selected:=p_date;
 if selected is null then select (value->>'date')::date into selected from jsonb_array_elements(services) where (value->>'ended')::boolean limit 1;end if;
 selected:=coalesce(selected,dates[1],today);
 select coalesce(jsonb_agg(to_jsonb(c) order by c.service_date desc),'[]'::jsonb) into history from
  (select * from public.service_closures where restaurant_id=rid and (p_before is null or service_date<p_before) order by service_date desc limit p_limit+1) c;
 history_more:=jsonb_array_length(history)>p_limit;
 if history_more then history_cursor:=(history->(p_limit-1)->>'service_date')::date;history:=history-(jsonb_array_length(history)-1);end if;
 -- Notification lifetime is independent of workspace pagination inside the
 -- owner-approved rollout range. Pre-rollout days remain explicitly accessible.
 with all_dates as (
  select (r.starts_at at time zone 'Europe/Paris')::date as service_day from public.reservations r where r.restaurant_id=rid
  union select (h.starts_at at time zone 'Europe/Paris')::date from public.table_holds h where h.restaurant_id=rid and h.expires_at>stamp
 ),summaries as materialized (
  select private.rm012_day(rid,service_day,stamp) value from all_dates
  where service_day>=policy.starts_on and service_day<=today and not exists(select 1 from public.service_closures c where c.restaurant_id=rid and c.service_date=service_day)
 ) select coalesce(jsonb_agg(value order by value->>'date' desc),'[]'::jsonb) into notifications from summaries where (value->>'ended')::boolean;
 select revision::text into rev from public.restaurant_service_changes where restaurant_id=rid;
 return jsonb_build_object('schema',1,'detection_since',policy.starts_on,'automatic_closure',policy.automatic_closure,'restaurant_id',rid,'server_time',stamp,'today',today,'revision',coalesce(rev,'0'),'services',services,'notification_days',notifications,'selected',private.rm012_day(rid,selected,stamp,true),'history',history,'history_has_more',history_more,'history_next_before',history_cursor,'has_more',more,'next_before',case when more then dates[p_limit] else null end);
end $$;

create or replace function private.rm012_archive_day(p_restaurant uuid,p_date date,p_operation uuid,p_mode text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rid uuid:=p_restaurant;actor uuid:=auth.uid();policy public.service_regularization_policy;c public.service_closures;prior public.service_regularization_audit;day jsonb;counts record;stamp timestamptz;label text;begin
 if p_mode not in ('manual','automatic') or p_mode is null then raise exception 'Mode de clôture invalide.' using errcode='22023';end if;
 if p_mode='manual' then
  if rid is distinct from private.rm012_authorize() then raise exception 'Établissement non autorisé.' using errcode='42501';end if;
 else
  if actor is not null or current_user<>'postgres' then raise exception 'Clôture système réservée au planificateur.' using errcode='42501';end if;
  select * into policy from public.service_regularization_policy where restaurant_id=rid;
  if not found or not policy.automatic_closure or p_date<policy.starts_on then raise exception 'Journée exclue de la clôture automatique.' using errcode='RM012';end if;
 end if;
 if p_date is null or p_operation is null then raise exception 'Date et identifiant de clôture requis.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('restaurant-mutation-v1:'||rid::text,0));
 select * into prior from public.service_regularization_audit where restaurant_id=rid and operation_id=p_operation;
 if found and (prior.actor_id is distinct from auth.uid() or prior.service_date<>p_date or prior.action<>'close_service') then raise exception 'Identifiant d’action déjà utilisé.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtext(rid::text),hashtext(p_date::text));
 select * into c from public.service_closures where restaurant_id=rid and service_date=p_date;
 if found then return to_jsonb(c);end if;
 stamp:=private.rm012_now();day:=private.rm012_day(rid,p_date,stamp);
 if p_date>(stamp at time zone 'Europe/Paris')::date or not coalesce((day->>'ended')::boolean,false) then raise exception 'La journée est encore en cours ou ses horaires sont indisponibles.' using errcode='RM012';end if;
 if p_mode='automatic' and (day->>'total')::integer=0 then raise exception 'Aucun service à clôturer automatiquement.' using errcode='RM012';end if;
 if not (day->>'can_close')::boolean then raise exception 'Clôture impossible : des réservations ou des maintiens actifs restent à vérifier.' using errcode='RM012';end if;
 perform 1 from public.reservations where restaurant_id=rid and (starts_at at time zone 'Europe/Paris')::date=p_date for update;
 select coalesce(sum(party_size) filter(where status in ('completed','released','departed')),0) served,
  count(*) filter(where status in ('completed','released','departed')) groups,
  coalesce(sum(party_size) filter(where status in ('completed','released','departed') and walkin_type is not null),0) walkins,
  coalesce(sum(party_size) filter(where status in ('completed','released','departed') and hotel_room is not null),0) hotel,
  count(*) filter(where status='no_show') absent,count(*) filter(where status='cancelled') cancelled into counts
 from public.reservations where restaurant_id=rid and (starts_at at time zone 'Europe/Paris')::date=p_date;
 insert into public.service_closures(restaurant_id,service_date,closed_by,closed_at,close_mode,served_covers,served_groups,walkin_covers,hotel_covers,no_show_groups,cancelled_groups)
 values(rid,p_date,actor,stamp,p_mode,counts.served,counts.groups,counts.walkins,counts.hotel,counts.absent,counts.cancelled) returning * into c;
 if p_mode='automatic' then label:='Clôture automatique';else select display_name into label from public.staff_profiles where user_id=actor;end if;
 insert into public.service_regularization_audit(restaurant_id,operation_id,service_date,actor_id,actor_label,performed_at,action,old_status,new_status,actor_kind)
 values(rid,p_operation,p_date,actor,coalesce(label,'Équipe'),stamp,'close_service','open','closed',case when p_mode='automatic' then 'system' else 'user' end);
 return to_jsonb(c);
end $$;

-- Shared archive routine: manual and automatic paths apply identical blockers,
-- date locks, immutable totals and single-close trace checks.
alter function private.rm012_archive_day(uuid,date,uuid,text) owner to postgres;
revoke all on function private.rm012_archive_day(uuid,date,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.rm012_archive_day(uuid,date,uuid,text) to resto_service_writer,postgres;
create or replace function private.rm012_close_api(p_date date,p_operation uuid) returns jsonb
language sql security definer set search_path='' as $$
 select private.rm012_archive_day(private.rm012_authorize(),p_date,p_operation,'manual')
$$;
-- Existing owner and restricted API grants survive CREATE OR REPLACE.

create or replace function private.rm012_auto_close_job(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='25s' as $$
declare stamp timestamptz:=private.rm012_now();candidate record;closed integer:=0;skipped integer:=0;failed integer:=0;begin
 if auth.uid() is not null then raise exception 'Tâche système réservée au planificateur.' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Lot de clôtures invalide.' using errcode='22023';end if;
 for candidate in
  with dates as (
   select distinct r.restaurant_id,(r.starts_at at time zone 'Europe/Paris')::date d
   from public.reservations r join public.service_regularization_policy p on p.restaurant_id=r.restaurant_id
   where p.automatic_closure and (r.starts_at at time zone 'Europe/Paris')::date>=p.starts_on
    and (r.starts_at at time zone 'Europe/Paris')::date<=(stamp at time zone 'Europe/Paris')::date
    and not exists(select 1 from public.service_closures c where c.restaurant_id=r.restaurant_id and c.service_date=(r.starts_at at time zone 'Europe/Paris')::date)
  ),ready as materialized (
   select restaurant_id,d,private.rm012_day(restaurant_id,d,stamp) details from dates
  ) select restaurant_id,d from ready where (details->>'can_close')::boolean order by d,restaurant_id limit p_limit
 loop
  begin
   -- Do not delay real service mutations or another scheduled run.
   if not pg_try_advisory_xact_lock(hashtextextended('restaurant-mutation-v1:'||candidate.restaurant_id::text,0))
    or not pg_try_advisory_xact_lock(hashtext(candidate.restaurant_id::text),hashtext(candidate.d::text)) then
    skipped:=skipped+1;continue;
   end if;
   if exists(select 1 from public.service_closures where restaurant_id=candidate.restaurant_id and service_date=candidate.d) then skipped:=skipped+1;continue;end if;
   perform private.rm012_archive_day(candidate.restaurant_id,candidate.d,gen_random_uuid(),'automatic');
   closed:=closed+1;
  exception when sqlstate 'RM012' or lock_not_available then skipped:=skipped+1;
   when others then
    failed:=failed+1;
    -- Keep diagnostics free of client names, notes and auth identities.
    raise warning 'RM012 automatic close failed (%); date %',sqlstate,candidate.d;
  end;
 end loop;
 return jsonb_build_object('closed',closed,'skipped',skipped,'failed',failed);
end $$;
alter function private.rm012_auto_close_job(integer) owner to postgres;
revoke all on function private.rm012_auto_close_job(integer) from public,anon,authenticated,resto_service_writer,service_role;
grant execute on function private.rm012_auto_close_job(integer) to postgres;
-- Stable name: reapplying never creates another scheduler.
select cron.schedule('rm012-safe-automatic-close','*/5 * * * *','set statement_timeout=''25s'';select private.rm012_auto_close_job();');
notify pgrst,'reload schema';
commit;
