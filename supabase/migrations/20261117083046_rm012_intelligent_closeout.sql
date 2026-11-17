-- RM-012. PREPARED ONLY: apply to a shared project only after impact review.
-- No existing booking, restaurant setting, closure or hour is changed by this file.
begin;
do $$begin
 if not exists(select 1 from pg_roles where rolname='resto_service_writer' and not rolbypassrls and not rolsuper)
 or to_regprocedure('private.lock_restaurant_mutation_v1()') is null
 or to_regprocedure('private.guard_closed_service_reservations()') is null
 or to_regprocedure('private.lock_direct_service_mutation_v1()') is null
 or to_regprocedure('private.signal_restaurant_change()') is null
 or not has_schema_privilege('authenticated','private','USAGE')
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='reservations' and column_name='edit_version' and data_type='uuid')
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='restaurant_hours' and column_name='weekly_schedule') then
  raise exception 'RM-012 : prérequis V3 / RM-005 / RM-011 absents. Aucune modification appliquée.';
 end if;
end $$;
create temporary table rm012_owner_grants(schema_name name primary key) on commit drop;
insert into pg_temp.rm012_owner_grants select s from unnest(array['public','private']) s where not has_schema_privilege('resto_service_writer',s,'CREATE');
do $$declare s name;begin for s in select schema_name from pg_temp.rm012_owner_grants loop execute format('grant create on schema %I to resto_service_writer',s);end loop;end $$;

create table if not exists public.service_regularization_audit (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id),
 operation_id uuid not null,
 service_date date not null,
 reservation_id uuid,
 actor_id uuid not null,
 actor_label text not null,
 performed_at timestamptz not null default clock_timestamp(),
 action text not null check(action in ('release_table','mark_absent','mark_served','correct_arrival','status_change','close_service')),
 old_status text not null,
 new_status text not null,
 reason text check(length(reason)<=300),
 unique(restaurant_id,operation_id)
);
create index if not exists rm012_audit_day on public.service_regularization_audit(restaurant_id,service_date,performed_at desc,id);
create unique index if not exists rm012_one_close_audit on public.service_regularization_audit(restaurant_id,service_date) where action='close_service';
create index if not exists rm012_reservation_day on public.reservations(restaurant_id,((starts_at at time zone 'Europe/Paris')::date),starts_at,id);
alter table public.service_regularization_audit enable row level security;
alter table public.service_regularization_audit force row level security;
revoke all on public.service_regularization_audit from public,anon,authenticated,resto_service_writer;
grant select on public.service_regularization_audit to authenticated,resto_service_writer;
grant insert on public.service_regularization_audit to resto_service_writer;
drop policy if exists rm012_audit_read on public.service_regularization_audit;
create policy rm012_audit_read on public.service_regularization_audit for select to authenticated,resto_service_writer
 using(restaurant_id=(select private.staff_restaurant()) and (select private.current_staff_role())='fb_admin');
drop policy if exists rm012_audit_append on public.service_regularization_audit;
create policy rm012_audit_append on public.service_regularization_audit for insert to resto_service_writer
 with check(restaurant_id=(select private.staff_restaurant()) and actor_id=(select auth.uid()) and (select private.current_staff_role()) in ('fb_admin','reception'));
grant select,insert on public.service_closures to resto_service_writer;
drop policy if exists rm012_closure_writer_read on public.service_closures;
create policy rm012_closure_writer_read on public.service_closures for select to resto_service_writer
 using(restaurant_id=(select private.staff_restaurant()) and (select private.current_staff_role()) in ('fb_admin','reception'));
drop policy if exists rm012_closure_writer_insert on public.service_closures;
create policy rm012_closure_writer_insert on public.service_closures for insert to resto_service_writer
 with check(restaurant_id=(select private.staff_restaurant()) and closed_by=(select auth.uid()) and close_mode='manual' and (select private.current_staff_role())='fb_admin');

create or replace function private.rm012_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;
create or replace function private.rm012_authorize() returns uuid language plpgsql stable security invoker set search_path='' as $$
declare rid uuid:=private.staff_restaurant();begin
 if auth.uid() is null or rid is null or private.current_staff_role() is distinct from 'fb_admin' then
  raise exception 'Fin de service réservée au responsable Restaurant.' using errcode='42501';end if;
 return rid;
end $$;

-- Convert LOCAL boundaries to timestamptz, including DST and an overnight shift.
-- Historical civil-date identity stays unchanged (RM-001).
create or replace function private.rm012_end(p_restaurant uuid,p_date date) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$
declare h public.restaurant_hours;plan jsonb;part jsonb;period text;start_at time;end_at time;edge timestamptz;result timestamptz;booked_end timestamptz;begin
 select * into h from public.restaurant_hours where restaurant_id=p_restaurant;
 if not found then return null;end if;
 if h.weekly_schedule is not null then
  plan:=h.weekly_schedule->(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from p_date)::integer];
  if plan is null then return null;end if;
 else
  plan:=jsonb_build_object('lunch',jsonb_build_object('enabled',h.lunch_enabled and not ((extract(isodow from p_date)=6 and h.saturday_lunch_closed) or (extract(isodow from p_date)=7 and h.sunday_lunch_closed)),'start',h.lunch_start,'end',h.lunch_end),
   'dinner',jsonb_build_object('enabled',h.dinner_enabled,'start',h.dinner_start,'end',h.dinner_end));
 end if;
 foreach period in array array['lunch','dinner'] loop
  part:=plan->period;
  if jsonb_typeof(part->'enabled') is distinct from 'boolean' then return null;end if;
  if (part->>'enabled')::boolean then
   start_at:=(part->>'start')::time;end_at:=(part->>'end')::time;
   if start_at is null or end_at is null then return null;end if;
   edge:=(p_date+end_at+case when end_at<=start_at then interval '1 day' else interval '0' end) at time zone 'Europe/Paris';
   result:=greatest(result,edge);
  end if;
 end loop;
 -- A closed calendar day is never considered finished before its civil midnight.
 if result is null then result:=(p_date+1)::timestamp at time zone 'Europe/Paris';end if;
 select max(ends_at) into booked_end from public.reservations where restaurant_id=p_restaurant and starts_at>=p_date::timestamp at time zone 'Europe/Paris' and starts_at<(p_date+1)::timestamp at time zone 'Europe/Paris';
 return greatest(result,booked_end);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return null;
end $$;

create or replace function private.rm012_day(p_restaurant uuid,p_date date,p_now timestamptz,p_details boolean default false) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare finish timestamptz;pending int;occupied int;awaited int;arrived int;unknowns int;holds int;total int;served int;revision text;closed jsonb;items jsonb:='[]';audit jsonb:='[]';begin
 finish:=private.rm012_end(p_restaurant,p_date);
 select count(*),count(*) filter(where status not in ('completed','released','departed','cancelled','no_show')),
  count(*) filter(where status in ('reserved','confirmed','late')),count(*) filter(where status='arrived'),
  count(*) filter(where status not in ('reserved','confirmed','late','arrived','seated','completed','released','departed','cancelled','no_show')),
  coalesce(sum(party_size) filter(where status in ('completed','released','departed')),0),
  md5(coalesce(string_agg(id::text||':'||edit_version::text,',' order by id),''))
 into total,pending,awaited,arrived,unknowns,served,revision
 from public.reservations where restaurant_id=p_restaurant and (starts_at at time zone 'Europe/Paris')::date=p_date;
 select count(distinct a.table_id) into occupied from public.reservations r join public.reservation_tables a on a.reservation_id=r.id and a.restaurant_id=r.restaurant_id
 where r.restaurant_id=p_restaurant and (r.starts_at at time zone 'Europe/Paris')::date=p_date and r.status='seated';
 select count(*) into holds from public.table_holds where restaurant_id=p_restaurant and (starts_at at time zone 'Europe/Paris')::date=p_date and expires_at>p_now;
 select to_jsonb(c) into closed from public.service_closures c where restaurant_id=p_restaurant and service_date=p_date;
 if p_details then
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'version',r.edit_version,'status',r.status,'starts_at',r.starts_at,'ends_at',r.ends_at,'guest_name',r.guest_name,'hotel_room',r.hotel_room,'guests',r.party_size,
   'tables',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'label',t.label) order by t.label) from public.reservation_tables a join public.restaurant_tables t on t.id=a.table_id and t.restaurant_id=a.restaurant_id where a.reservation_id=r.id and a.restaurant_id=p_restaurant),'[]'::jsonb)) order by r.starts_at,r.id),'[]'::jsonb) into items
  from public.reservations r where restaurant_id=p_restaurant and (starts_at at time zone 'Europe/Paris')::date=p_date;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.performed_at desc,a.id),'[]'::jsonb) into audit from
   (select * from public.service_regularization_audit where restaurant_id=p_restaurant and service_date=p_date order by performed_at desc,id limit 100) a;
 end if;
 return jsonb_build_object('date',p_date,'ends_at',finish,'ended',coalesce(p_now>=finish,false),'pending',pending,'occupied_tables',occupied,'awaited',awaited,'arrived',arrived,'unsupported',unknowns,'active_holds',holds,'total',total,'served_covers',served,
  'can_close',closed is null and finish is not null and p_now>=finish and pending=0 and holds=0,'closure',closed,'revision',revision||':'||holds::text||':'||coalesce(closed->>'id','open'),'items',items,'audit',audit);
end $$;

create or replace function private.rm012_services_api(p_date date,p_before date,p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rid uuid:=private.rm012_authorize();stamp timestamptz:=private.rm012_now();today date;dates date[];services jsonb:='[]';history jsonb;notifications jsonb;selected date;d date;more boolean;history_more boolean;history_cursor date;rev text;begin
 today:=(stamp at time zone 'Europe/Paris')::date;
 if p_date>today or p_limit is null or p_limit not between 1 and 60 then raise exception 'Date ou pagination invalide.' using errcode='22023';end if;
 select array_agg(service_day order by service_day desc) into dates from (
  select distinct service_day from (
   select (r.starts_at at time zone 'Europe/Paris')::date as service_day from public.reservations r where r.restaurant_id=rid
   union select (h.starts_at at time zone 'Europe/Paris')::date from public.table_holds h where h.restaurant_id=rid and h.expires_at>stamp
  ) candidates where service_day<=today and (p_before is null or service_day<p_before)
   and not exists(select 1 from public.service_closures c where c.restaurant_id=rid and c.service_date=service_day)
  order by service_day desc limit p_limit+1
 ) days;
 more:=coalesce(cardinality(dates)>p_limit,false);
 foreach d in array coalesce(dates[1:p_limit],array[]::date[]) loop
  services:=services||jsonb_build_array(private.rm012_day(rid,d,stamp));
 end loop;
 selected:=p_date;
 if selected is null then select (value->>'date')::date into selected from jsonb_array_elements(services) where (value->>'ended')::boolean limit 1;end if;
 selected:=coalesce(selected,dates[1],today-1);
 select coalesce(jsonb_agg(to_jsonb(c) order by c.service_date desc),'[]'::jsonb) into history from
  (select * from public.service_closures where restaurant_id=rid and (p_before is null or service_date<p_before) order by service_date desc limit p_limit+1) c;
 history_more:=jsonb_array_length(history)>p_limit;
 if history_more then history_cursor:=(history->(p_limit-1)->>'service_date')::date;history:=history-(jsonb_array_length(history)-1);end if;
 -- Notification lifetime is independent of the workspace's pagination. Never
 -- drop an unresolved old service just because the list returns to its first page.
 with all_dates as (
  select (r.starts_at at time zone 'Europe/Paris')::date as service_day from public.reservations r where r.restaurant_id=rid
  union select (h.starts_at at time zone 'Europe/Paris')::date from public.table_holds h where h.restaurant_id=rid and h.expires_at>stamp
 ),summaries as materialized (
  select private.rm012_day(rid,service_day,stamp) value from all_dates
  where service_day<=today and not exists(select 1 from public.service_closures c where c.restaurant_id=rid and c.service_date=service_day)
 ) select coalesce(jsonb_agg(value order by value->>'date' desc),'[]'::jsonb) into notifications from summaries where (value->>'ended')::boolean;
 select revision::text into rev from public.restaurant_service_changes where restaurant_id=rid;
 return jsonb_build_object('schema',1,'restaurant_id',rid,'server_time',stamp,'today',today,'revision',coalesce(rev,'0'),'services',services,'notification_days',notifications,'selected',private.rm012_day(rid,selected,stamp,true),'history',history,'history_has_more',history_more,'history_next_before',history_cursor,'has_more',more,'next_before',case when more then dates[p_limit] else null end);
end $$;

-- Audit legacy historical status changes as well as explicit RM-012 operations.
create or replace function private.rm012_audit_status() returns trigger language plpgsql security definer set search_path='' as $$
declare operation uuid;kind text;label text;stamp timestamptz:=private.rm012_now();d date;begin
 if old.status is not distinct from new.status or auth.uid() is null then return new;end if;
 d:=(old.starts_at at time zone 'Europe/Paris')::date;
 if d>=(stamp at time zone 'Europe/Paris')::date and stamp<private.rm012_end(old.restaurant_id,d) then return new;end if;
 operation:=coalesce(nullif(current_setting('rm012.operation_id',true),'')::uuid,gen_random_uuid());
 kind:=coalesce(nullif(current_setting('rm012.action',true),''),'status_change');
 select display_name into label from public.staff_profiles where user_id=auth.uid();
 insert into public.service_regularization_audit(restaurant_id,operation_id,service_date,reservation_id,actor_id,actor_label,performed_at,action,old_status,new_status,reason)
 values(old.restaurant_id,operation,d,old.id,auth.uid(),coalesce(label,'Équipe'),stamp,kind,old.status,new.status,nullif(current_setting('rm012.reason',true),''));
 return new;
end $$;
drop trigger if exists rm012_audit_status on public.reservations;
create trigger rm012_audit_status after update of status on public.reservations for each row execute function private.rm012_audit_status();

create or replace function private.rm012_regularize_api(p_date date,p_reservation uuid,p_version uuid,p_action text,p_operation uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rid uuid:=private.rm012_authorize();r public.reservations;prior public.service_regularization_audit;target text;stamp timestamptz;result jsonb;begin
 if p_date is null or p_reservation is null or p_operation is null or p_version is null or p_action is null or p_action not in ('release_table','mark_absent','mark_served','correct_arrival') or length(coalesce(p_reason,''))>300 then raise exception 'Action de régularisation invalide.' using errcode='22023';end if;
 perform private.lock_restaurant_mutation_v1();
 select * into prior from public.service_regularization_audit where restaurant_id=rid and operation_id=p_operation;
 if found then
  if prior.actor_id is distinct from auth.uid() or prior.reservation_id is distinct from p_reservation or prior.service_date<>p_date or prior.action<>p_action or coalesce(prior.reason,'')<>btrim(coalesce(p_reason,'')) then raise exception 'Identifiant d’action déjà utilisé.' using errcode='22023';end if;
  return to_jsonb(prior);
 end if;
 stamp:=private.rm012_now();
 if private.rm012_end(rid,p_date) is null or stamp<private.rm012_end(rid,p_date) or p_date>(stamp at time zone 'Europe/Paris')::date then raise exception 'Cette journée est encore en cours ou ses horaires sont indisponibles.' using errcode='RM012';end if;
 perform pg_advisory_xact_lock(hashtext(rid::text),hashtext(p_date::text));
 if exists(select 1 from public.service_closures where restaurant_id=rid and service_date=p_date) then raise exception 'Cette journée est déjà clôturée.' using errcode='RM012';end if;
 select * into r from public.reservations where id=p_reservation and restaurant_id=rid for update;
 if not found then raise exception 'Réservation introuvable.' using errcode='P0002';end if;
 if (r.starts_at at time zone 'Europe/Paris')::date<>p_date then raise exception 'La réservation appartient à une autre journée.' using errcode='22023';end if;
 if r.edit_version is distinct from p_version then raise exception 'La réservation a changé. Actualisez avant de confirmer.' using errcode='RM001';end if;
 target:=case
  when p_action='release_table' and r.status='seated' then 'released'
  when p_action='mark_absent' and r.status in ('reserved','confirmed','late') then 'no_show'
  when p_action='mark_served' and r.status in ('reserved','confirmed','late','arrived') then 'completed'
  when p_action='correct_arrival' and r.status='arrived' then 'confirmed' end;
 if target is null then raise exception 'Ce changement de statut n’est pas autorisé.' using errcode='22023';end if;
 if p_action in ('mark_served','correct_arrival') and length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Expliquez cette correction (au moins 5 caractères).' using errcode='22023';end if;
 perform set_config('rm012.operation_id',p_operation::text,true);perform set_config('rm012.action',p_action,true);perform set_config('rm012.reason',btrim(coalesce(p_reason,'')),true);
 update public.reservations set status=target,updated_at=stamp,released_at=case when target in ('completed','released') then stamp else released_at end where id=r.id and restaurant_id=rid;
 select to_jsonb(a) into result from public.service_regularization_audit a where restaurant_id=rid and operation_id=p_operation;
 perform set_config('rm012.operation_id','',true);perform set_config('rm012.action','',true);perform set_config('rm012.reason','',true);
 if result is null then raise exception 'La trace de régularisation n’a pas été créée.';end if;
 return result;
end $$;

create or replace function private.rm012_close_api(p_date date,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rid uuid:=private.rm012_authorize();c public.service_closures;prior public.service_regularization_audit;day jsonb;counts record;stamp timestamptz;label text;begin
 if p_date is null or p_operation is null then raise exception 'Date et identifiant de clôture requis.' using errcode='22023';end if;
 perform private.lock_restaurant_mutation_v1();
 select * into prior from public.service_regularization_audit where restaurant_id=rid and operation_id=p_operation;
 if found and (prior.actor_id is distinct from auth.uid() or prior.service_date<>p_date or prior.action<>'close_service') then raise exception 'Identifiant d’action déjà utilisé.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtext(rid::text),hashtext(p_date::text));
 select * into c from public.service_closures where restaurant_id=rid and service_date=p_date;
 if found then return to_jsonb(c);end if;
 stamp:=private.rm012_now();day:=private.rm012_day(rid,p_date,stamp);
 if p_date>(stamp at time zone 'Europe/Paris')::date or not coalesce((day->>'ended')::boolean,false) then raise exception 'La journée est encore en cours ou ses horaires sont indisponibles.' using errcode='RM012';end if;
 if not (day->>'can_close')::boolean then raise exception 'Clôture impossible : des réservations ou des maintiens actifs restent à vérifier.' using errcode='RM012';end if;
 perform 1 from public.reservations where restaurant_id=rid and (starts_at at time zone 'Europe/Paris')::date=p_date for update;
 select coalesce(sum(party_size) filter(where status in ('completed','released','departed')),0) served,
  count(*) filter(where status in ('completed','released','departed')) groups,
  coalesce(sum(party_size) filter(where status in ('completed','released','departed') and walkin_type is not null),0) walkins,
  coalesce(sum(party_size) filter(where status in ('completed','released','departed') and hotel_room is not null),0) hotel,
  count(*) filter(where status='no_show') absent,count(*) filter(where status='cancelled') cancelled into counts
 from public.reservations where restaurant_id=rid and (starts_at at time zone 'Europe/Paris')::date=p_date;
 insert into public.service_closures(restaurant_id,service_date,closed_by,closed_at,close_mode,served_covers,served_groups,walkin_covers,hotel_covers,no_show_groups,cancelled_groups)
 values(rid,p_date,auth.uid(),stamp,'manual',counts.served,counts.groups,counts.walkins,counts.hotel,counts.absent,counts.cancelled) returning * into c;
 select display_name into label from public.staff_profiles where user_id=auth.uid();
 insert into public.service_regularization_audit(restaurant_id,operation_id,service_date,actor_id,actor_label,performed_at,action,old_status,new_status)
 values(rid,p_operation,p_date,auth.uid(),coalesce(label,'Équipe'),stamp,'close_service','open','closed');
 return to_jsonb(c);
end $$;

-- Caller-visible functions are INVOKER wrappers. Definers stay in private and
-- run as the existing NOBYPASSRLS writer, with explicit identity/tenant guards.
create or replace function public.rm012_services_v1(p_date date default null,p_before date default null,p_limit integer default 30) returns jsonb
language sql stable security invoker set search_path='' as $$select private.rm012_services_api($1,$2,$3)$$;
create or replace function public.rm012_regularize_v1(p_date date,p_reservation uuid,p_version uuid,p_action text,p_operation uuid,p_reason text default null) returns jsonb
language sql security invoker set search_path='' as $$select private.rm012_regularize_api($1,$2,$3,$4,$5,$6)$$;
create or replace function public.rm012_close_v1(p_date date,p_operation uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.rm012_close_api($1,$2)$$;
create or replace function public.close_service_v3(p_date date,p_mode text default 'manual') returns public.service_closures
language plpgsql security invoker set search_path='' as $$begin
 if p_mode is distinct from 'manual' then raise exception 'La clôture exige une confirmation explicite du responsable.' using errcode='RM012';end if;
 return jsonb_populate_record(null::public.service_closures,private.rm012_close_api(p_date,gen_random_uuid()));
end $$;
create or replace function private.rm012_sync_api() returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid:=private.staff_restaurant();rev text;begin
 if auth.uid() is null or rid is null or coalesce(private.current_staff_role(),'') not in ('fb_admin','reception') then raise exception 'Compte non autorisé.' using errcode='42501';end if;
 select revision::text into rev from public.restaurant_service_changes where restaurant_id=rid;
 return jsonb_build_object('revision',coalesce(rev,'0'),'server_time',clock_timestamp(),'capabilities',jsonb_build_object('reservation_edits',4,'booking_recovery',1,'snapshot',1,'service_regularization',1));
end $$;
create or replace function public.service_sync_state_v1() returns jsonb language sql security invoker set search_path='' as $$select private.rm012_sync_api()$$;

-- Statement lock precedes row locks, including direct writes and old RPCs.
drop trigger if exists rm012_statement_lock on public.reservations;
create trigger rm012_statement_lock before insert or update or delete on public.reservations for each statement execute function private.lock_direct_service_mutation_v1();
drop trigger if exists rm012_statement_lock on public.table_holds;
create trigger rm012_statement_lock before insert or update or delete on public.table_holds for each statement execute function private.lock_direct_service_mutation_v1();
create or replace function private.rm012_guard_hold() returns trigger language plpgsql security definer set search_path='' as $$
declare d date;begin
 d:=(new.starts_at at time zone 'Europe/Paris')::date;
 perform pg_advisory_xact_lock(hashtext(new.restaurant_id::text),hashtext(d::text));
 if new.expires_at>private.rm012_now() and exists(select 1 from public.service_closures where restaurant_id=new.restaurant_id and service_date=d) then raise exception 'Service déjà clôturé : nouveau maintien refusé.' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists rm012_guard_hold on public.table_holds;
create trigger rm012_guard_hold before insert or update on public.table_holds for each row execute function private.rm012_guard_hold();
drop trigger if exists rm012_signal_audit on public.service_regularization_audit;
create trigger rm012_signal_audit after insert on public.service_regularization_audit for each row execute function private.signal_restaurant_change();
drop trigger if exists rm012_signal_closure on public.service_closures;
create trigger rm012_signal_closure after insert on public.service_closures for each row execute function private.signal_restaurant_change();

do $$declare p record;begin
 for p in select n.nspname,f.proname,pg_get_function_identity_arguments(f.oid) args from pg_proc f join pg_namespace n on n.oid=f.pronamespace where n.nspname in ('public','private') and f.proname like 'rm012_%' loop
  if p.nspname='private' then execute format('alter function %I.%I(%s) owner to resto_service_writer',p.nspname,p.proname,p.args);end if;
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',p.nspname,p.proname,p.args);
  execute format('grant execute on function %I.%I(%s) to resto_service_writer',p.nspname,p.proname,p.args);
  if p.nspname='public' or p.proname in ('rm012_services_api','rm012_regularize_api','rm012_close_api','rm012_sync_api') then execute format('grant execute on function %I.%I(%s) to authenticated',p.nspname,p.proname,p.args);end if;
 end loop;
end $$;
revoke all on function public.close_service_v3(date,text),public.service_sync_state_v1() from public,anon;
grant execute on function public.close_service_v3(date,text),public.service_sync_state_v1() to authenticated;
do $$declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['service_closures','service_regularization_audit'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
  end loop;
 end if;
end $$;
do $$declare s name;begin for s in select schema_name from pg_temp.rm012_owner_grants loop execute format('revoke create on schema %I from resto_service_writer',s);end loop;end $$;
drop table pg_temp.rm012_owner_grants;
notify pgrst,'reload schema';
commit;
