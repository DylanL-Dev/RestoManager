-- RM-015.2 PREPARED ONLY: owner impact approval before ANY shared application.
-- No restaurant is enabled; no existing booking, user or hour is changed.
begin;
do $$begin
 if to_regprocedure('private.ranked_booking_sets(uuid,uuid[],integer,timestamptz,timestamptz)') is null or to_regprocedure('private.rm012_sync_api()') is null
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='restaurant_hours' and column_name='arrival_limit_percent') then raise exception 'RM015 prerequisites missing';end if;
 if not exists(select 1 from pg_roles where rolname='rm015_public_writer') then create role rm015_public_writer nologin noinherit nobypassrls;end if;
 if exists(select 1 from pg_roles where rolname='rm015_public_writer' and (rolsuper or rolbypassrls or rolcanlogin)) then raise exception 'RM015 unsafe role';end if;
end $$;
-- The remainder of the API is defined below the schema/availability foundation.
grant usage,create on schema public,private to rm015_public_writer;
grant usage on schema auth to rm015_public_writer;
grant execute on function auth.uid(),private.current_staff_role(),private.staff_restaurant() to rm015_public_writer;
grant execute on function private.lock_restaurant_mutation_v1() to rm015_public_writer;
create table if not exists private.rm015_settings (
 restaurant_id uuid primary key references public.restaurants(id),slug text unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),enabled boolean not null default false,
 max_party integer check(max_party between 1 and 50),pending_minutes integer not null default 60 check(pending_minutes between 15 and 180),version integer not null default 1,last_operation uuid,last_fingerprint text,
 horizon_days integer not null default 60 check(horizon_days between 1 and 180),lead_minutes integer not null default 30 check(lead_minutes between 0 and 1440),
 cancellation_minutes integer not null default 0 check(cancellation_minutes between 0 and 2880),privacy_notice text not null default '' check(length(privacy_notice)<=3000),
 privacy_contact text not null default '' check(length(privacy_contact)<=500),cancellation_notice text not null default '' check(length(cancellation_notice)<=1500),updated_at timestamptz not null default clock_timestamp(),
 check(not enabled or (slug is not null and max_party is not null and length(privacy_notice)>=30 and length(privacy_contact)>=5 and length(cancellation_notice)>=20))
);
create table if not exists private.rm015_requests (
 id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants(id),operation_id uuid not null,
 proof_hash text not null check(proof_hash ~ '^[a-f0-9]{64}$'),token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),token_cipher text not null,
 reference text not null,state text not null check(state in ('draft','pending','confirmed','pending_change','cancelled','rejected','expired')),
 reservation_id uuid,draft jsonb not null,contact jsonb,table_ids uuid[] not null default '{}',starts_at timestamptz not null,ends_at timestamptz not null,
 expires_at timestamptz not null,token_expires_at timestamptz not null,version integer not null default 1,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),last_result text,
 ip_hash text not null check(ip_hash ~ '^[a-f0-9]{64}$'),unique(restaurant_id,operation_id),unique(restaurant_id,reference),unique(id,restaurant_id)
);
create index if not exists rm015_pending_expiry on private.rm015_requests(restaurant_id,expires_at) where state in ('draft','pending','pending_change');
create table if not exists private.rm015_operations (
 restaurant_id uuid not null,request_id uuid not null references private.rm015_requests(id),operation_id uuid not null,fingerprint text not null,action text not null,result jsonb not null,primary key(restaurant_id,request_id,operation_id)
);
create table if not exists private.rm015_audit (
 id bigint generated always as identity primary key,restaurant_id uuid not null,request_id uuid,reservation_id uuid,actor_id uuid,actor_type text not null,action text not null,old_state text,new_state text,occurred_at timestamptz not null default clock_timestamp()
);
create table if not exists private.rm015_mail (
 id uuid primary key default gen_random_uuid(),restaurant_id uuid not null,request_id uuid not null references private.rm015_requests(id),version integer not null,event text not null,
 state text not null default 'queued' check(state in ('queued','sending','sent','failed','uncertain','superseded')),lease uuid,lease_until timestamptz,attempts integer not null default 0,next_at timestamptz not null default clock_timestamp(),created_at timestamptz not null default clock_timestamp(),sent_at timestamptz,provider_id text,unique(request_id,version,event)
);
create index if not exists rm015_mail_ready on private.rm015_mail(next_at,id) where state in ('queued','sending');
create table if not exists private.rm015_rate (
 restaurant_id uuid not null,bucket text not null,fingerprint text not null,since timestamptz not null,count integer not null,primary key(restaurant_id,bucket,fingerprint)
);
alter table public.reservations add column if not exists source_channel text not null default 'staff' check(source_channel in ('staff','web'));
grant select(source_channel) on public.reservations to authenticated;
alter table public.table_holds add column if not exists web_request_id uuid;
alter table public.table_holds alter column held_by drop not null;
do $$begin
 if not exists(select 1 from pg_constraint where conname='rm015_hold_owner' and conrelid='public.table_holds'::regclass) then
  alter table public.table_holds add constraint rm015_hold_owner check((held_by is not null and web_request_id is null) or (held_by is null and web_request_id is not null and draft_role is null));
  alter table public.table_holds add constraint rm015_hold_request foreign key(web_request_id,restaurant_id) references private.rm015_requests(id,restaurant_id);
 end if;
end $$;
create index if not exists rm015_web_holds on public.table_holds(web_request_id) where web_request_id is not null;
-- Backend context is accepted ONLY from the actual privileged database role;
-- staff/anon cannot change this role through a custom setting or user_metadata.
create or replace function private.staff_restaurant() returns uuid language sql stable security definer set search_path='' as $$
 select case when auth.uid() is not null then (select restaurant_id from public.staff_profiles where user_id=auth.uid() and active)
 when current_setting('role',true)='service_role' then nullif(current_setting('rm015.restaurant',true),'')::uuid else null end
$$;
-- Retain function identity, owner, ACL and search_path; strengthen NULL semantics.
do $$declare f record;body text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and p.prosrc ~ 'held_by[[:space:]]*<>' loop
  body:=regexp_replace(pg_get_functiondef(f.oid),'held_by[[:space:]]*<>','held_by IS DISTINCT FROM ','g');execute body;
 end loop;
end $$;
-- Own public hold can be revalidated. Every legacy/other-request hold still blocks.
do $$declare body text;begin
 body:=pg_get_functiondef('private.ranked_booking_sets(uuid,uuid[],integer,timestamptz,timestamptz)'::regprocedure);
 if position('h.web_request_id' in body)=0 then
  body:=replace(body,'where h.table_id=t.id and h.expires_at','where (h.web_request_id is null or h.web_request_id is distinct from p_reservation) and h.table_id=t.id and h.expires_at');
  if position('h.web_request_id' in body)=0 then raise exception 'RM015 candidate engine drift';end if;execute body;
 end if;
end $$;
create or replace function private.rm015_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;
create or replace function private.rm015_scope(p_restaurant uuid) returns void language plpgsql security invoker set search_path='' as $$begin
 if auth.uid() is null and current_setting('role',true) is distinct from 'service_role' then raise exception 'Accès refusé' using errcode='42501';end if;
 if auth.uid() is not null and (private.staff_restaurant() is distinct from p_restaurant or coalesce(private.current_staff_role(),'') not in ('fb_admin','reception')) then raise exception 'Accès refusé' using errcode='42501';end if;
 perform set_config('rm015.restaurant',p_restaurant::text,true);perform pg_advisory_xact_lock(hashtextextended('restaurant-mutation-v1:'||p_restaurant::text,0));
end $$;
do $$declare t text;begin
 foreach t in array array['rm015_settings','rm015_requests','rm015_operations','rm015_audit','rm015_mail','rm015_rate'] loop
  execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on private.%I to rm015_public_writer',t);
  execute format('drop policy if exists rm015_scope on private.%I',t);execute format('create policy rm015_scope on private.%I to rm015_public_writer using(restaurant_id=(select private.staff_restaurant())) with check(restaurant_id=(select private.staff_restaurant()))',t);
 end loop;
 drop policy if exists rm015_lookup on private.rm015_settings;create policy rm015_lookup on private.rm015_settings for select to rm015_public_writer using(true);
 drop policy if exists rm015_mail_queue on private.rm015_mail;create policy rm015_mail_queue on private.rm015_mail for select to rm015_public_writer using(true);
end $$;
grant select on private.booking_drafts_v3 to rm015_public_writer;
drop policy if exists rm015_arrival_drafts on private.booking_drafts_v3;
create policy rm015_arrival_drafts on private.booking_drafts_v3 for select to rm015_public_writer using(restaurant_id=(select private.staff_restaurant()));
grant usage,select on sequence private.rm015_audit_id_seq to rm015_public_writer;
grant select on public.restaurants,public.restaurant_hours,public.restaurant_tables,public.restaurant_rooms,public.reservations,public.reservation_tables,public.table_fusion_links,public.table_holds,public.service_closures to rm015_public_writer;
grant insert,update on public.reservations to rm015_public_writer;grant insert,delete on public.reservation_tables to rm015_public_writer;grant insert,update,delete on public.table_holds to rm015_public_writer;
grant execute on function private.ranked_booking_sets(uuid,uuid[],integer,timestamptz,timestamptz),private.check_fusion_selection(uuid[]) to rm015_public_writer;
do $$declare t text;col text;begin
 foreach t in array array['restaurants','restaurant_hours','restaurant_tables','restaurant_rooms','reservations','reservation_tables','table_fusion_links','table_holds','service_closures'] loop
  col:=case when t='restaurants' then 'id' else 'restaurant_id' end;execute format('drop policy if exists rm015_backend on public.%I',t);
  execute format('create policy rm015_backend on public.%I to rm015_public_writer using(%I=(select private.staff_restaurant())) with check(%I=(select private.staff_restaurant()))',t,col,col);
 end loop;
end $$;
create or replace function private.rm015_audit_event(p_id uuid,p_action text,p_old text,p_new text) returns void language plpgsql security invoker set search_path='' as $$begin
 insert into private.rm015_audit(restaurant_id,request_id,reservation_id,actor_id,actor_type,action,old_state,new_state) select restaurant_id,id,reservation_id,case when p_action='expire' then null else auth.uid() end,case when p_action='expire' then 'system' when auth.uid() is null then 'public_api' else 'staff' end,p_action,p_old,p_new from private.rm015_requests where id=p_id;
end $$;
create or replace function private.rm015_enqueue(p_id uuid,p_event text) returns void language sql security invoker set search_path='' as $$
 insert into private.rm015_mail(restaurant_id,request_id,version,event) select restaurant_id,id,version,p_event from private.rm015_requests where id=p_id and contact is not null on conflict do nothing
$$;
-- Rebuild the guest summary from the actual booking after staff intervention,
-- rejection or expiry of a proposed change. Never copy internal notes.
create or replace function private.rm015_booking_draft(b public.reservations) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('party',b.party_size,'date',(b.starts_at at time zone 'Europe/Paris')::date,'time',to_char(b.starts_at at time zone 'Europe/Paris','HH24:MI'),'service',case when (b.starts_at at time zone 'Europe/Paris')::time between (h.weekly_schedule->(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from b.starts_at at time zone 'Europe/Paris')::integer]->'lunch'->>'start')::time and (h.weekly_schedule->(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from b.starts_at at time zone 'Europe/Paris')::integer]->'lunch'->>'end')::time then 'lunch' else 'dinner' end)
 from public.restaurant_hours h where h.restaurant_id=b.restaurant_id
$$;
create or replace function private.rm015_restore(p_id uuid) returns void language sql security invoker set search_path='' as $$
 update private.rm015_requests q set draft=private.rm015_booking_draft(b),starts_at=b.starts_at,ends_at=b.ends_at,token_expires_at=b.starts_at+interval '7 days' from public.reservations b where q.id=p_id and b.id=q.reservation_id and b.restaurant_id=q.restaurant_id
$$;
create or replace function private.rm015_expire(p_restaurant uuid) returns void language plpgsql security invoker set search_path='' as $$declare r private.rm015_requests;begin
 for r in select * from private.rm015_requests where restaurant_id=p_restaurant and state in ('draft','pending','pending_change') and expires_at<=private.rm015_now() for update loop
  delete from public.table_holds where web_request_id=r.id;update private.rm015_requests set state=case when reservation_id is null then 'expired' else 'confirmed' end,version=version+1,updated_at=private.rm015_now(),last_result='expired' where id=r.id;
  perform private.rm015_restore(r.id);perform private.rm015_audit_event(r.id,'expire',r.state,case when r.reservation_id is null then 'expired' else 'confirmed' end);if r.contact is not null then perform private.rm015_enqueue(r.id,'expired');end if;
 end loop;
end $$;
create or replace function private.rm015_slot(p_restaurant uuid,p_date date,p_service text,p_time time,p_party integer,p_ignore uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c private.rm015_settings;h public.restaurant_hours;part jsonb;day_key text;start_at timestamptz;finish timestamptz;lo time;hi time;win_start timestamptz;win_end timestamptz;capacity integer;arrivals integer;lim integer;first_ids uuid[];ids uuid[];n integer:=0;lead_min integer;
begin
 select * into strict c from private.rm015_settings where restaurant_id=p_restaurant;select * into strict h from public.restaurant_hours where restaurant_id=p_restaurant;
 if (not c.enabled and not exists(select 1 from private.rm015_requests where id=p_ignore and (reservation_id is not null or state in ('pending','pending_change')))) or p_party is null or p_party not between 1 and c.max_party or p_service not in ('lunch','dinner') or p_date is null or p_time is null or p_date<(private.rm015_now() at time zone 'Europe/Paris')::date or p_date>(private.rm015_now() at time zone 'Europe/Paris')::date+c.horizon_days then return jsonb_build_object('available',false,'reason','invalid');end if;
 day_key:=(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from p_date)::integer];part:=h.weekly_schedule->day_key->p_service;
 if part is null or not coalesce((part->>'enabled')::boolean,false) then return jsonb_build_object('available',false,'reason','closed');end if;
 lo:=(part->>'start')::time;hi:=(part->>'end')::time;start_at:=(p_date+p_time) at time zone 'Europe/Paris';finish:=start_at+make_interval(mins=>h.duration);
 lead_min:=c.lead_minutes;
 if exists(select 1 from private.rm015_requests where id=p_ignore and starts_at=start_at and state in ('draft','pending','pending_change') and expires_at>private.rm015_now()) then lead_min:=0;end if;
 if p_time<lo or p_time>hi or extract(second from p_time)<>0 or extract(minute from p_time)::integer%15<>0
 or (start_at at time zone 'Europe/Paris') is distinct from p_date+p_time
 or ((start_at-interval '1 hour') at time zone 'Europe/Paris')=p_date+p_time or ((start_at+interval '1 hour') at time zone 'Europe/Paris')=p_date+p_time
 or start_at<private.rm015_now()+make_interval(mins=>lead_min)
 or exists(select 1 from public.service_closures where restaurant_id=p_restaurant and service_date=p_date) then return jsonb_build_object('available',false,'reason','closed');end if;
 select coalesce(sum(t.seats),0) into capacity from public.restaurant_tables t join public.restaurant_rooms m on m.id=t.room_id and m.restaurant_id=t.restaurant_id where t.restaurant_id=p_restaurant and t.active and m.active;
 if h.arrival_limit_percent is null or h.arrival_limit_percent not between 40 and 90 then return jsonb_build_object('available',false,'reason','configuration');end if;
 lim:=greatest(1,ceil(capacity*h.arrival_limit_percent/100.0)::integer);win_start:=greatest((p_date+lo) at time zone 'Europe/Paris',date_trunc('hour',start_at at time zone 'Europe/Paris') at time zone 'Europe/Paris');win_end:=least(win_start+interval '1 hour',((p_date+hi) at time zone 'Europe/Paris')+interval '1 minute');
 select coalesce(sum(party_size),0) into arrivals from public.reservations where restaurant_id=p_restaurant and id is distinct from p_ignore and status in ('reserved','confirmed','late','arrived','seated') and walkin_type is null and starts_at>=win_start and starts_at<win_end;
 select arrivals+coalesce(sum((q.draft->>'party')::integer),0) into arrivals from private.rm015_requests q where q.restaurant_id=p_restaurant and q.id is distinct from p_ignore and q.state in ('draft','pending','pending_change') and q.expires_at>private.rm015_now() and q.starts_at>=win_start and q.starts_at<win_end;
 select arrivals+coalesce(sum(d.guests),0) into arrivals from private.booking_drafts_v3 d where d.restaurant_id=p_restaurant and d.booking is null and d.expires>private.rm015_now() and d.starts>=win_start and d.starts<win_end and exists(select 1 from public.table_holds lease where lease.owner_token=d.lock_token and lease.held_by=d.staff and lease.expires_at>private.rm015_now());
 if arrivals+p_party>lim then return jsonb_build_object('available',false,'reason','arrivals');end if;
 for ids in select s.ids from private.ranked_booking_sets(p_ignore,null,p_party,start_at,finish) s where not exists(select 1 from public.reservation_tables a join public.reservations r on r.id=a.reservation_id and r.restaurant_id=a.restaurant_id where r.restaurant_id=p_restaurant and a.table_id=any(s.ids) and r.status='seated' and r.id is distinct from p_ignore) loop n:=n+1;if n=1 then first_ids:=ids;end if;exit when n>=2;end loop;
 if n=0 then return jsonb_build_object('available',false,'reason','full');end if;
 return jsonb_build_object('available',true,'level',case when n=1 or arrivals+p_party>=lim then 'limited' else 'available' end,'ids',to_jsonb(first_ids),'starts_at',start_at,'ends_at',finish,'manual',p_party>=4);
end $$;

create or replace function private.rm015_contact(p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 if jsonb_typeof(p) is distinct from 'object' or p->'accepted' is distinct from 'true'::jsonb
 or jsonb_typeof(p->'firstName') is distinct from 'string' or length(btrim(p->>'firstName')) not between 1 and 80
 or jsonb_typeof(p->'lastName') is distinct from 'string' or length(btrim(p->>'lastName')) not between 1 and 80
 or jsonb_typeof(p->'email') is distinct from 'string' or length(p->>'email')>254 or p->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or length(coalesce(p->>'phone',''))>30 or length(coalesce(p->>'notes',''))>500
 or position('[RESTOMANAGER:' in upper(coalesce(p->>'notes','')))>0 then raise exception 'Coordonnées invalides' using errcode='RM015',detail='INVALID';end if;
 return jsonb_build_object('firstName',btrim(p->>'firstName'),'lastName',btrim(p->>'lastName'),'email',lower(btrim(p->>'email')),'phone',coalesce(p->>'phone',''),'notes',coalesce(p->>'notes',''),'accepted',true);
end $$;
create or replace function private.rm015_view(p_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r private.rm015_requests;b public.reservations;c private.rm015_settings;booking jsonb;editable boolean;cancelable boolean;
begin
 select * into strict r from private.rm015_requests where id=p_id;select * into strict c from private.rm015_settings where restaurant_id=r.restaurant_id;
 select * into b from public.reservations where id=r.reservation_id;
 if b.id is not null then
  booking:=private.rm015_booking_draft(b)||jsonb_build_object('name',b.guest_name);
  editable:=b.status in ('reserved','confirmed','late') and b.starts_at>private.rm015_now()+make_interval(mins=>c.lead_minutes);
  cancelable:=b.status in ('reserved','confirmed','late') and b.starts_at>private.rm015_now()+make_interval(mins=>c.cancellation_minutes);
 else editable:=r.state='pending' and r.expires_at>private.rm015_now();cancelable:=editable;end if;
 return jsonb_build_object('secret_cipher',r.token_cipher,'data',jsonb_build_object('reference',r.reference,'state',r.state,'version',r.version,'draft',r.draft,'booking',booking,'contact',r.contact,'deadline',r.expires_at,'tokenExpiresAt',r.token_expires_at,'canModify',coalesce(editable,false),'canCancel',coalesce(cancelable,false),'lastResult',r.last_result,'emailStatus',(select state from private.rm015_mail where request_id=r.id order by created_at desc,id desc limit 1)));
end $$;
create or replace function private.rm015_hold(p_id uuid,p_slot jsonb,p_deadline timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare r private.rm015_requests;t uuid;ids uuid[];
begin
 select * into strict r from private.rm015_requests where id=p_id;
 select array_agg(value::uuid order by value) into ids from jsonb_array_elements_text(p_slot->'ids');
 if not coalesce((p_slot->>'available')::boolean,false) or coalesce(cardinality(ids),0)=0 or not private.check_fusion_selection(ids) then raise exception 'Créneau indisponible' using errcode='RM015',detail='FULL';end if;
 foreach t in array ids loop perform pg_advisory_xact_lock(hashtextextended(t::text,0));end loop;
 delete from public.table_holds where web_request_id=p_id;
 insert into public.table_holds(restaurant_id,table_id,held_by,starts_at,ends_at,expires_at,owner_token,draft_role,web_request_id)
 select r.restaurant_id,x,null,(p_slot->>'starts_at')::timestamptz,(p_slot->>'ends_at')::timestamptz,p_deadline,r.id,null,r.id from unnest(ids) x;
 update private.rm015_requests set table_ids=ids,starts_at=(p_slot->>'starts_at')::timestamptz,ends_at=(p_slot->>'ends_at')::timestamptz,expires_at=p_deadline where id=p_id;
end $$;
create or replace function private.rm015_commit(p_id uuid,p_slot jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare r private.rm015_requests;b public.reservations;ids uuid[];note text;oldstate text;
begin
 select * into strict r from private.rm015_requests where id=p_id for update;oldstate:=r.state;
 select array_agg(value::uuid order by value) into ids from jsonb_array_elements_text(p_slot->'ids');
 if not coalesce((p_slot->>'available')::boolean,false) or coalesce(cardinality(ids),0)=0 or not private.check_fusion_selection(ids) then raise exception 'Créneau indisponible' using errcode='RM015',detail='FULL';end if;
 select * into b from public.reservations where id=r.reservation_id for update;
 if b.id is not null and b.status not in ('reserved','confirmed','late') then raise exception 'Cette réservation ne peut plus être modifiée' using errcode='RM015',detail='LOCKED';end if;
 delete from public.table_holds where web_request_id=p_id;
 -- Keep the original reservation until this transaction can commit the complete replacement.
 update private.rm015_requests set state='confirmed',last_result=null,expires_at=private.rm015_now(),updated_at=private.rm015_now() where id=p_id;
 note:=coalesce(b.notes,'[RESTOMANAGER:EXTERIEUR]');
 if nullif(r.contact->>'notes','') is not null and position(r.contact->>'notes' in note)=0 then note:=note||E'\nDemande en ligne : '||(r.contact->>'notes');end if;
 if b.id is null then
  insert into public.reservations(id,restaurant_id,guest_name,hotel_room,party_size,starts_at,ends_at,status,notes,created_by,confirmed_at,source_channel)
  values(r.id,r.restaurant_id,(r.contact->>'firstName')||' '||(r.contact->>'lastName'),null,(r.draft->>'party')::integer,(p_slot->>'starts_at')::timestamptz,(p_slot->>'ends_at')::timestamptz,'confirmed',note,null,private.rm015_now(),'web');
 else
  update public.reservations set guest_name=(r.contact->>'firstName')||' '||(r.contact->>'lastName'),party_size=(r.draft->>'party')::integer,starts_at=(p_slot->>'starts_at')::timestamptz,ends_at=(p_slot->>'ends_at')::timestamptz,notes=note,status='confirmed',confirmed_at=private.rm015_now() where id=b.id;
  delete from public.reservation_tables where reservation_id=b.id;
 end if;
 insert into public.reservation_tables(restaurant_id,reservation_id,table_id) select r.restaurant_id,r.id,x from unnest(ids) x;
 update private.rm015_requests set reservation_id=r.id,starts_at=(p_slot->>'starts_at')::timestamptz,ends_at=(p_slot->>'ends_at')::timestamptz,token_expires_at=(p_slot->>'starts_at')::timestamptz+interval '7 days',version=version+1,updated_at=private.rm015_now() where id=r.id;
 perform private.rm015_audit_event(r.id,case when b.id is null then 'confirm' else 'modify' end,oldstate,'confirmed');
 perform private.rm015_enqueue(r.id,case when b.id is null then 'confirmed' else 'modified' end);
end $$;
create or replace function private.rm015_watch_booking() returns trigger language plpgsql security definer set search_path='' as $$
declare r private.rm015_requests;nextstate text;event text;
begin
 if new.source_channel is distinct from 'web' then return new;end if;
 -- Explicit administrator maintenance has no request identity; ordinary callers
 -- cannot reach these rows without the existing staff/backend RLS context.
 if auth.uid() is null and current_setting('role',true) is distinct from 'service_role' then return new;end if;
 select * into r from private.rm015_requests where id=new.id for update;if not found then raise exception 'Demande Web absente' using errcode='23514';end if;
 nextstate:=case when new.status in ('cancelled','no_show') then 'cancelled' else 'confirmed' end;
 if r.state='pending_change' and auth.uid() is not null then
  delete from public.table_holds where web_request_id=r.id;event:='change_superseded';
 elsif tg_op='INSERT' then event:='confirmed';
 elsif old.status is distinct from new.status and new.status='cancelled' then event:='cancelled';
 elsif row(old.guest_name,old.party_size,old.starts_at) is distinct from row(new.guest_name,new.party_size,new.starts_at) then event:='modified';end if;
 update private.rm015_requests set reservation_id=new.id,state=nextstate,version=version+1,updated_at=private.rm015_now(),last_result=case when event='change_superseded' then 'superseded' else last_result end where id=r.id;
 if auth.uid() is not null then perform private.rm015_restore(r.id);end if;
 if event is not null then perform private.rm015_enqueue(r.id,event);perform private.rm015_audit_event(r.id,event,r.state,nextstate);end if;
 return new;
end $$;
drop trigger if exists rm015_web_booking_watch on public.reservations;
create trigger rm015_web_booking_watch after insert or update on public.reservations for each row execute function private.rm015_watch_booking();

create or replace function public.rm015_rate_v1(p_key text,p_bucket text,p_limit integer,p_seconds integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer;stamp timestamptz:=private.rm015_now();zero uuid:='00000000-0000-0000-0000-000000000000';begin
 if current_setting('role',true) is distinct from 'service_role' or auth.uid() is not null then raise exception 'Accès refusé' using errcode='42501';end if;
 if p_key !~ '^[a-f0-9]{64}$' or length(p_bucket)>100 or p_limit not between 1 and 5000 or p_seconds not between 1 and 3600 then raise exception 'Invalid rate input' using errcode='22023';end if;
 perform set_config('rm015.restaurant',zero::text,true);
 insert into private.rm015_rate(restaurant_id,bucket,fingerprint,since,count) values(zero,p_bucket,p_key,stamp,1)
 on conflict(restaurant_id,bucket,fingerprint) do update set count=case when rm015_rate.since<stamp-make_interval(secs=>p_seconds) then 1 else least(p_limit+1,rm015_rate.count+1) end,since=case when rm015_rate.since<stamp-make_interval(secs=>p_seconds) then stamp else rm015_rate.since end returning count into n;
 delete from private.rm015_rate where restaurant_id=zero and since<stamp-interval '1 day';
 return jsonb_build_object('allowed',n<=p_limit,'count',n);
end $$;

create or replace function public.rm015_gateway_v1(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.rm015_settings;r private.rm015_requests;b public.reservations;slot jsonb;result jsonb;v_contact jsonb;op private.rm015_operations;
 fingerprint text;operation uuid;d jsonb;token text;requested_id uuid;deadline timestamptz;times jsonb:='[]';at_time time;part jsonb;daykey text;datevalue date;party integer;oldstate text;
begin
 if current_setting('role',true) is distinct from 'service_role' or auth.uid() is not null then raise exception 'Accès refusé' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16000 or p_action not in ('profile','availability','hold','recover','release','read','submit','modify','cancel') then raise exception 'Requête invalide' using errcode='RM015',detail='INVALID';end if;
 select * into c from private.rm015_settings where slug=p_payload->>'restaurant';if not found then raise exception 'Restaurant indisponible' using errcode='RM015',detail='UNAVAILABLE';end if;
 perform private.rm015_scope(c.restaurant_id);perform private.rm015_expire(c.restaurant_id);
 if p_action in ('profile','availability') and p_payload->>'token_hash' is not null then
  select * into r from private.rm015_requests where restaurant_id=c.restaurant_id and token_hash=p_payload->>'token_hash';
  if not found or r.token_expires_at<=private.rm015_now() then raise exception 'Lien indisponible' using errcode='RM015',detail='TOKEN';end if;
 end if;
 if p_action in ('profile','availability','hold') and not c.enabled and r.id is null then raise exception 'Réservations en ligne fermées' using errcode='RM015',detail='UNAVAILABLE';end if;
 if p_action='profile' then
  return jsonb_build_object('name',(select name from public.restaurants where id=c.restaurant_id),'slug',c.slug,'timezone','Europe/Paris','maxParty',c.max_party,'horizonDays',c.horizon_days,'leadMinutes',c.lead_minutes,'pendingMinutes',c.pending_minutes,'manualFrom',4,'privacyNotice',c.privacy_notice,'privacyContact',c.privacy_contact,'cancellationNotice',c.cancellation_notice,'today',(private.rm015_now() at time zone 'Europe/Paris')::date,'serverTime',private.rm015_now());
 end if;
 if p_action in ('read','modify','cancel') then
  select * into r from private.rm015_requests where restaurant_id=c.restaurant_id and token_hash=p_payload->>'token_hash' for update;
  if not found or r.token_expires_at<=private.rm015_now() then raise exception 'Lien indisponible ou expiré' using errcode='RM015',detail='TOKEN';end if;
 elsif p_action in ('recover','release','submit') then
  select * into r from private.rm015_requests where restaurant_id=c.restaurant_id and operation_id=(p_payload->>'key')::uuid and proof_hash=p_payload->>'proof_hash' for update;
  if not found or r.token_expires_at<=private.rm015_now() then raise exception 'Saisie introuvable' using errcode='RM015',detail='TOKEN';end if;
 end if;
 if p_action in ('read','recover') then return private.rm015_view(r.id);end if;
 if p_action='release' then
  if r.state='draft' then delete from public.table_holds where web_request_id=r.id;update private.rm015_requests set state='expired',version=version+1 where id=r.id;perform private.rm015_audit_event(r.id,'release_draft','draft','expired');end if;
  return private.rm015_view(r.id);
 end if;
 if p_action='submit' and r.state='expired' then raise exception 'Maintien expiré' using errcode='RM015',detail='EXPIRED';end if;
 if p_action in ('submit','modify','cancel') then
  operation:=(p_payload->>'operation')::uuid;fingerprint:=encode(sha256(convert_to((p_payload-'token_hash'-'proof_hash')::text,'UTF8')),'hex');
  select * into op from private.rm015_operations where restaurant_id=c.restaurant_id and request_id=r.id and operation_id=operation;
  if found then if op.action is distinct from p_action or op.fingerprint is distinct from fingerprint then raise exception 'Opération déjà utilisée' using errcode='RM015',detail='IDEMPOTENCY';end if;return private.rm015_view(r.id);end if;
  if operation is null or (p_payload->>'version')::integer is distinct from r.version then raise exception 'La réservation a changé. Vérifiez son récapitulatif.' using errcode='RM015',detail='STALE';end if;
 end if;
 if p_action='cancel' then
  result:=private.rm015_view(r.id);if not coalesce((result->'data'->>'canCancel')::boolean,false) then raise exception 'Annulation impossible. Contactez le restaurant.' using errcode='RM015',detail='LOCKED';end if;
  delete from public.table_holds where web_request_id=r.id;update public.reservations set status='cancelled' where id=r.reservation_id and status in ('reserved','confirmed','late');
  update private.rm015_requests set state='cancelled',version=version+1,updated_at=private.rm015_now() where id=r.id;
  perform private.rm015_audit_event(r.id,'cancel',r.state,'cancelled');perform private.rm015_enqueue(r.id,'cancelled');
 elsif p_action in ('availability','hold','submit','modify') then
  d:=p_payload->'draft';datevalue:=(d->>'date')::date;party:=(d->>'party')::integer;
  if p_action='availability' then
   daykey:=(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from datevalue)::integer];
   select weekly_schedule->daykey->(d->>'service') into part from public.restaurant_hours where restaurant_id=c.restaurant_id;
   if not coalesce((part->>'enabled')::boolean,false) then return jsonb_build_object('slots','[]'::jsonb,'serverTime',private.rm015_now());end if;
   at_time:=(part->>'start')::time;
   while at_time<=(part->>'end')::time loop
    slot:=private.rm015_slot(c.restaurant_id,datevalue,d->>'service',at_time,party,r.id);
    times:=times||jsonb_build_array(jsonb_build_object('time',to_char(at_time,'HH24:MI'),'available',coalesce((slot->>'available')::boolean,false),'level',slot->>'level','manual',party>=4));
    exit when at_time>='23:45';at_time:=at_time+interval '15 minutes';
   end loop;
   return jsonb_build_object('slots',times,'serverTime',private.rm015_now());
  end if;
  if p_action='hold' then
   operation:=(p_payload->>'key')::uuid;
   select * into r from private.rm015_requests where restaurant_id=c.restaurant_id and operation_id=operation for update;
   if found then if r.proof_hash is distinct from p_payload->>'proof_hash' or r.draft is distinct from d then raise exception 'Saisie déjà utilisée' using errcode='RM015',detail='IDEMPOTENCY';end if;return private.rm015_view(r.id);end if;
   if (select count(*) from private.rm015_requests where restaurant_id=c.restaurant_id and ip_hash=p_payload->>'ip_hash' and state='draft' and expires_at>private.rm015_now())>=2 then raise exception 'Trop de saisies en cours' using errcode='RM015',detail='RATE';end if;
   slot:=private.rm015_slot(c.restaurant_id,datevalue,d->>'service',(d->>'time')::time,party);
   if not coalesce((slot->>'available')::boolean,false) then raise exception 'Ce créneau vient de changer. Choisissez un autre horaire.' using errcode='RM015',detail='FULL';end if;
   requested_id:=gen_random_uuid();deadline:=private.rm015_now()+interval '3 minutes';
   insert into private.rm015_requests(id,restaurant_id,operation_id,proof_hash,token_hash,token_cipher,reference,state,draft,starts_at,ends_at,expires_at,token_expires_at,ip_hash)
   values(requested_id,c.restaurant_id,operation,p_payload->>'proof_hash',p_payload->>'token_hash',p_payload->>'token_cipher','WEB-'||upper(left(replace(requested_id::text,'-',''),12)),'draft',d,(slot->>'starts_at')::timestamptz,(slot->>'ends_at')::timestamptz,deadline,(slot->>'starts_at')::timestamptz+interval '7 days',p_payload->>'ip_hash');
   perform private.rm015_hold(requested_id,slot,deadline);perform private.rm015_audit_event(requested_id,'hold',null,'draft');return private.rm015_view(requested_id);
  end if;
  if p_action='submit' and r.state is distinct from 'draft' then raise exception 'Cette saisie a déjà été traitée' using errcode='RM015',detail='LOCKED';end if;
  if p_action='submit' and (r.expires_at<=private.rm015_now() or r.draft is distinct from d) then raise exception 'Maintien expiré. Vérifiez votre horaire.' using errcode='RM015',detail='EXPIRED';end if;
  if p_action='modify' then result:=private.rm015_view(r.id);if not coalesce((result->'data'->>'canModify')::boolean,false) then raise exception 'Modification impossible. Contactez le restaurant.' using errcode='RM015',detail='LOCKED';end if;end if;
  v_contact:=private.rm015_contact(p_payload->'contact');
  if r.contact is not null and v_contact->>'email' is distinct from r.contact->>'email' then raise exception 'Contactez le restaurant pour changer votre email.' using errcode='RM015',detail='EMAIL_LOCKED';end if;
  if p_action='submit' and (select count(*) from private.rm015_requests q where q.restaurant_id=c.restaurant_id and q.contact->>'email'=v_contact->>'email' and q.id<>r.id and q.state in ('confirmed','pending','pending_change') and (q.starts_at at time zone 'Europe/Paris')::date=datevalue)>=2 then raise exception 'Plusieurs réservations existent déjà. Contactez le restaurant.' using errcode='RM015',detail='RATE';end if;
  slot:=private.rm015_slot(c.restaurant_id,datevalue,d->>'service',(d->>'time')::time,party,r.id);
  if not coalesce((slot->>'available')::boolean,false) then raise exception 'Ce créneau vient de changer. Choisissez un autre horaire.' using errcode='RM015',detail='FULL';end if;
  update private.rm015_requests set contact=v_contact,draft=d,version=version+1,updated_at=private.rm015_now() where id=r.id;
  if party>=4 then
   deadline:=least(case when r.state in ('pending','pending_change') then r.expires_at else private.rm015_now()+make_interval(mins=>c.pending_minutes) end,(slot->>'starts_at')::timestamptz);
   perform private.rm015_hold(r.id,slot,deadline);oldstate:=r.state;
   update private.rm015_requests set state=case when reservation_id is null then 'pending' else 'pending_change' end,last_result=null where id=r.id;
   perform private.rm015_audit_event(r.id,'request_confirmation',oldstate,case when r.reservation_id is null then 'pending' else 'pending_change' end);perform private.rm015_enqueue(r.id,'pending');
  else perform private.rm015_commit(r.id,slot);end if;
 end if;
 result:=private.rm015_view(r.id);
 insert into private.rm015_operations(restaurant_id,request_id,operation_id,fingerprint,action,result) values(c.restaurant_id,r.id,operation,fingerprint,p_action,'{}');
 return result;
end $$;

create or replace function public.rm015_staff_v1(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid:=private.staff_restaurant();staff text:=private.current_staff_role();c private.rm015_settings;r private.rm015_requests;s jsonb;items jsonb;oldstate text;fingerprint text;
begin
 if auth.uid() is null or rid is null or staff not in ('fb_admin','reception') or p_action not in ('state','configure','approve','reject') then raise exception 'Accès refusé' using errcode='42501';end if;
 perform private.rm015_scope(rid);perform private.rm015_expire(rid);
 if p_action<>'state' and staff is distinct from 'fb_admin' then raise exception 'Action réservée au Restaurant' using errcode='42501';end if;
 select * into c from private.rm015_settings where restaurant_id=rid;
 if p_action='configure' then
  fingerprint:=encode(sha256(convert_to((p_payload-'operation')::text,'UTF8')),'hex');
  if c.last_operation=(p_payload->>'operation')::uuid then
   if c.last_fingerprint is distinct from fingerprint then raise exception 'Opération réutilisée' using errcode='RM015',detail='IDEMPOTENCY';end if;
   return public.rm015_staff_v1('state','{}');
  end if;
  if p_payload->>'operation' is null or coalesce(c.version,0) is distinct from (p_payload->>'version')::integer then raise exception 'Réglages modifiés. Actualisez avant de réessayer.' using errcode='RM015',detail='STALE';end if;
  if c.slug is not null and c.slug is distinct from p_payload->>'slug' and exists(select 1 from private.rm015_requests where restaurant_id=rid and token_expires_at>private.rm015_now() and state<>'draft') then raise exception 'Des liens de réservation utilisent cette adresse.' using errcode='RM015',detail='SLUG_LOCKED';end if;
  insert into private.rm015_settings(restaurant_id,slug,enabled,max_party,pending_minutes,horizon_days,lead_minutes,cancellation_minutes,privacy_notice,privacy_contact,cancellation_notice,last_operation,last_fingerprint)
  values(rid,p_payload->>'slug',(p_payload->>'enabled')::boolean,(p_payload->>'maxParty')::integer,coalesce((p_payload->>'pendingMinutes')::integer,60),coalesce((p_payload->>'horizonDays')::integer,60),coalesce((p_payload->>'leadMinutes')::integer,30),coalesce((p_payload->>'cancellationMinutes')::integer,0),coalesce(p_payload->>'privacyNotice',''),coalesce(p_payload->>'privacyContact',''),coalesce(p_payload->>'cancellationNotice',''),(p_payload->>'operation')::uuid,fingerprint)
  on conflict(restaurant_id) do update set slug=excluded.slug,enabled=excluded.enabled,max_party=excluded.max_party,pending_minutes=excluded.pending_minutes,horizon_days=excluded.horizon_days,lead_minutes=excluded.lead_minutes,cancellation_minutes=excluded.cancellation_minutes,privacy_notice=excluded.privacy_notice,privacy_contact=excluded.privacy_contact,cancellation_notice=excluded.cancellation_notice,updated_at=private.rm015_now(),version=rm015_settings.version+1,last_operation=excluded.last_operation,last_fingerprint=excluded.last_fingerprint;
  insert into private.rm015_audit(restaurant_id,actor_id,actor_type,action) values(rid,auth.uid(),'staff','configure');
 elsif p_action in ('approve','reject') then
  select * into r from private.rm015_requests where id=(p_payload->>'id')::uuid and restaurant_id=rid for update;
  if not found then raise exception 'Demande introuvable' using errcode='RM015',detail='TOKEN';end if;
  if r.state not in ('pending','pending_change') then return jsonb_build_object('processed',true,'state',r.state);end if;
  if (p_payload->>'version')::integer is distinct from r.version then raise exception 'Demande modifiée. Actualisez.' using errcode='RM015',detail='STALE';end if;
  oldstate:=r.state;
  if p_action='approve' then
   s:=private.rm015_slot(rid,(r.draft->>'date')::date,r.draft->>'service',(r.draft->>'time')::time,(r.draft->>'party')::integer,r.id);
   if not coalesce((s->>'available')::boolean,false) then raise exception 'La disponibilité ou le plafond d’arrivées a changé.' using errcode='RM015',detail='FULL';end if;
   perform private.rm015_commit(r.id,s);
  else
   delete from public.table_holds where web_request_id=r.id;
   update private.rm015_requests set state=case when reservation_id is null then 'rejected' else 'confirmed' end,version=version+1,updated_at=private.rm015_now(),last_result='rejected' where id=r.id;
   perform private.rm015_restore(r.id);perform private.rm015_enqueue(r.id,'rejected');
  end if;
  perform private.rm015_audit_event(r.id,p_action,oldstate,case when p_action='approve' or r.reservation_id is not null then 'confirmed' else 'rejected' end);
  return jsonb_build_object('processed',true);
 end if;
 select * into c from private.rm015_settings where restaurant_id=rid;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'reference',q.reference,'state',q.state,'version',q.version,'draft',q.draft,'deadline',q.expires_at,'createdAt',q.created_at,'contact',case when staff='fb_admin' then q.contact else jsonb_build_object('firstName',q.contact->>'firstName','lastName',q.contact->>'lastName') end) order by q.created_at,q.id),'[]') into items
 from private.rm015_requests q where q.restaurant_id=rid and q.state in ('pending','pending_change') and q.expires_at>private.rm015_now();
 return jsonb_build_object('schema',1,'restaurantId',rid,'role',staff,'settings',case when c.restaurant_id is null then jsonb_build_object('enabled',false,'pendingMinutes',60,'version',0) else jsonb_build_object('slug',c.slug,'enabled',c.enabled,'maxParty',c.max_party,'pendingMinutes',c.pending_minutes,'horizonDays',c.horizon_days,'leadMinutes',c.lead_minutes,'cancellationMinutes',c.cancellation_minutes,'privacyNotice',c.privacy_notice,'privacyContact',c.privacy_contact,'cancellationNotice',c.cancellation_notice,'version',c.version) end,'requests',items,'events',(select coalesce(jsonb_agg(e),'[]') from (select distinct on(a.request_id) a.id,a.action,a.occurred_at,q.reference,q.reservation_id,q.draft,q.contact->>'firstName' as first_name,q.contact->>'lastName' as last_name from private.rm015_audit a join private.rm015_requests q on q.id=a.request_id where a.restaurant_id=rid and a.actor_type='public_api' and a.action in ('confirm','modify','cancel') and a.occurred_at>private.rm015_now()-interval '7 days' order by a.request_id,a.id desc limit 100) e),'mailIssues',(select count(*) from private.rm015_mail where restaurant_id=rid and state in ('failed','uncertain')),'serverTime',private.rm015_now());
end $$;

create or replace function public.rm015_mail_v1(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.rm015_mail;r private.rm015_requests;c private.rm015_settings;claimed uuid;result jsonb:='[]';stamp timestamptz:=private.rm015_now();
begin
 if current_setting('role',true) is distinct from 'service_role' or auth.uid() is not null or p_action not in ('claim','ack','fail') then raise exception 'Accès refusé' using errcode='42501';end if;
 if p_action='claim' then
  for j in select * from private.rm015_mail where (state='queued' and next_at<=stamp) or (state='sending' and lease_until<stamp) order by restaurant_id,created_at,id limit 5 loop
   perform private.rm015_scope(j.restaurant_id);perform private.rm015_expire(j.restaurant_id);
   if j.created_at<stamp-interval '23 hours' then update private.rm015_mail set state='uncertain' where id=j.id and state in ('sending','queued');continue;end if;
   if exists(select 1 from private.rm015_mail newer where newer.request_id=j.request_id and newer.version>j.version and newer.state<>'superseded') then update private.rm015_mail set state='superseded' where id=j.id and state in ('queued','sending');continue;end if;
   claimed:=gen_random_uuid();
   update private.rm015_mail set state='sending',lease=claimed,lease_until=stamp+interval '90 seconds',attempts=attempts+1 where id=j.id and ((state='queued' and next_at<=stamp) or (state='sending' and lease_until<stamp));
   if not found then continue;end if;
   select * into strict r from private.rm015_requests where id=j.request_id;select * into strict c from private.rm015_settings where restaurant_id=j.restaurant_id;
   result:=result||jsonb_build_array(jsonb_build_object('id',j.id,'lease',claimed,'event',j.event,'email',r.contact->>'email','tokenCipher',r.token_cipher,'restaurant',c.slug,'restaurantName',(select name from public.restaurants where id=c.restaurant_id),'record',private.rm015_view(r.id)->'data'));
  end loop;return result;
 end if;
 select * into j from private.rm015_mail where id=(p_payload->>'id')::uuid;
 if not found then return jsonb_build_object('accepted',false);end if;perform private.rm015_scope(j.restaurant_id);
 if p_action='ack' then
  update private.rm015_mail set state='sent',sent_at=stamp,provider_id=left(p_payload->>'providerId',200),lease_until=null where id=j.id and lease=(p_payload->>'lease')::uuid and state='sending';
 else
  update private.rm015_mail set state=case when (p_payload->>'terminal')::boolean then 'failed' when attempts>=8 then 'uncertain' else 'queued' end,next_at=stamp+make_interval(secs=>least(3600,30*(2^least(attempts,7))::integer)),lease_until=null where id=j.id and lease=(p_payload->>'lease')::uuid and state='sending';
  if found then perform private.rm015_audit_event(j.request_id,'email_failure',null,null);end if;
 end if;
 return jsonb_build_object('accepted',found);
end $$;

-- Advertise the additive module only once the database contract is installed.
do $$declare body text;begin
 body:=pg_get_functiondef('private.rm012_sync_api()'::regprocedure);
 if position('public_booking' in body)=0 then
  body:=replace(body,'''service_regularization'', 1','''service_regularization'', 1, ''public_booking'', 1');
  body:=replace(body,'''service_regularization'',1','''service_regularization'',1,''public_booking'',1');
  if position('public_booking' in body)=0 then raise exception 'RM015 snapshot capability drift';end if;execute body;
 end if;
end $$;

-- No new function is executable anonymously. Backend and staff surfaces are separate.
do $$declare f record;begin
 for f in select p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'rm015_%' loop
  execute format('alter function %I.%I(%s) owner to rm015_public_writer',f.nspname,f.proname,f.args);
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',f.nspname,f.proname,f.args);
 end loop;
end $$;
grant execute on function public.rm015_gateway_v1(text,jsonb),public.rm015_rate_v1(text,text,integer,integer),public.rm015_mail_v1(text,jsonb) to service_role;
grant execute on function public.rm015_staff_v1(text,jsonb) to authenticated;
revoke update,delete on private.rm015_audit from rm015_public_writer;
revoke create on schema public,private from rm015_public_writer;
-- Audit changes share the existing tenant revision bus, without a new Realtime publication.
drop trigger if exists rm015_audit_revision on private.rm015_audit;
create trigger rm015_audit_revision after insert on private.rm015_audit for each row execute function private.signal_restaurant_change();
commit;
