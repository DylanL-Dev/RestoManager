-- RM-015.5 PREPARED ONLY. Explicit owner approval before applying to shared DEV.
-- Adds public restaurant photos only. Never changes a booking, schedule or opening.
begin;
do $$begin execute format('grant rm015_public_writer to %I with inherit true, set true',current_user);end$$;
alter table private.rm015_settings add column if not exists cover_path text,add column if not exists cover_alt text not null default '';
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='private.rm015_settings'::regclass and conname='rm015_cover_valid') then
  alter table private.rm015_settings add constraint rm015_cover_valid check(length(cover_alt)<=160 and (cover_path is null or (cover_path ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$' and split_part(cover_path,'/',1)=restaurant_id::text)));
 end if;
end$$;
-- Dedicated public bucket: no private documents or reservation attachments belong here.
do $$begin
 if exists(select 1 from storage.buckets where id='rm015-covers' and (name is distinct from 'rm015-covers' or public is distinct from true or file_size_limit is distinct from 2097152 or allowed_mime_types is distinct from array['image/webp'])) then raise exception 'RM015 cover bucket already exists with incompatible settings; review before activation';end if;
end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('rm015-covers','rm015-covers',true,2097152,array['image/webp']) on conflict(id) do nothing;
grant create on schema private to rm015_public_writer;
grant usage on schema storage to rm015_public_writer;
grant select on storage.objects to rm015_public_writer;
-- The technical owner can inspect only the tenant selected by the existing business scope.
drop policy if exists rm015_cover_writer_read on storage.objects;
create policy rm015_cover_writer_read on storage.objects for select to rm015_public_writer using(bucket_id='rm015-covers' and split_part(name,'/',1)=private.staff_restaurant()::text);
drop policy if exists rm015_cover_writer_guard on storage.objects;
create policy rm015_cover_writer_guard on storage.objects as restrictive for select to rm015_public_writer using(bucket_id='rm015-covers' and split_part(name,'/',1)=private.staff_restaurant()::text);
create or replace function private.rm015_media_access(p_name text,p_action text) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare rid uuid:=private.staff_restaurant();begin
 if (coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid) is null or private.current_staff_role() is distinct from 'fb_admin' or rid is null or p_action not in ('read','write','delete') then return false;end if;
 if p_name is null or p_name !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$' or split_part(p_name,'/',1) is distinct from rid::text then return false;end if;
 if p_action in ('write','delete') then perform private.rm015_scope(rid);end if;
 if p_action='delete' then return not exists(select 1 from private.rm015_settings where restaurant_id=rid and cover_path=p_name);end if;
 if p_action='write' then return (select count(*)<20 from storage.objects where bucket_id='rm015-covers' and split_part(name,'/',1)=rid::text);end if;
 return true;
end$$;
revoke all on function private.rm015_media_access(text,text) from public,anon,authenticated,service_role;
grant execute on function private.rm015_media_access(text,text) to authenticated;
alter function private.rm015_media_access(text,text) owner to rm015_public_writer;
-- A restrictive guard also prevents an unrelated broad policy opening this bucket.
drop policy if exists rm015_cover_staff_read on storage.objects;
create policy rm015_cover_staff_read on storage.objects for select to authenticated using(bucket_id='rm015-covers' and private.rm015_media_access(name,'read'));
drop policy if exists rm015_cover_read_guard on storage.objects;
create policy rm015_cover_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'rm015-covers' or private.rm015_media_access(name,'read'));
drop policy if exists rm015_cover_staff_insert on storage.objects;
create policy rm015_cover_staff_insert on storage.objects for insert to authenticated with check(bucket_id='rm015-covers' and private.rm015_media_access(name,'write'));
drop policy if exists rm015_cover_insert_guard on storage.objects;
create policy rm015_cover_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'rm015-covers' or private.rm015_media_access(name,'write'));
drop policy if exists rm015_cover_staff_delete on storage.objects;
create policy rm015_cover_staff_delete on storage.objects for delete to authenticated using(bucket_id='rm015-covers' and private.rm015_media_access(name,'delete'));
drop policy if exists rm015_cover_delete_guard on storage.objects;
create policy rm015_cover_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'rm015-covers' or private.rm015_media_access(name,'delete'));
drop policy if exists rm015_cover_immutable on storage.objects;
create policy rm015_cover_immutable on storage.objects as restrictive for update to authenticated using(bucket_id<>'rm015-covers') with check(bucket_id<>'rm015-covers');
drop policy if exists rm015_cover_no_anon_metadata on storage.objects;
create policy rm015_cover_no_anon_metadata on storage.objects as restrictive for all to anon using(bucket_id<>'rm015-covers') with check(bucket_id<>'rm015-covers');

create or replace function public.rm015_staff_v1(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid:=private.staff_restaurant();staff text:=private.current_staff_role();c private.rm015_settings;r private.rm015_requests;s jsonb;items jsonb;oldstate text;fingerprint text;
begin
 if (coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid) is null or rid is null or staff not in ('fb_admin','reception') or p_action not in ('state','configure','approve','reject') then raise exception 'Accès refusé' using errcode='42501';end if;
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
  -- Old clients omit the photo fields: keep the currently published presentation.
  if not (p_payload ? 'coverPath') then p_payload:=p_payload||jsonb_build_object('coverPath',c.cover_path,'coverAlt',coalesce(c.cover_alt,''));end if;
  if (p_payload->>'coverPath' is not null and (not private.rm015_media_access(p_payload->>'coverPath','read') or not exists(select 1 from storage.objects o where o.bucket_id='rm015-covers' and o.name=p_payload->>'coverPath' and o.metadata->>'mimetype'='image/webp' and (o.metadata->>'size')::bigint between 1 and 2097152))) or length(coalesce(p_payload->>'coverAlt',''))>160 then raise exception 'Photo invalide ou non accessible' using errcode='RM015',detail='INVALID';end if;
  insert into private.rm015_settings(restaurant_id,slug,enabled,max_party,pending_minutes,horizon_days,lead_minutes,cancellation_minutes,privacy_notice,privacy_contact,cancellation_notice,cover_path,cover_alt,last_operation,last_fingerprint)
  values(rid,p_payload->>'slug',(p_payload->>'enabled')::boolean,(p_payload->>'maxParty')::integer,coalesce((p_payload->>'pendingMinutes')::integer,60),coalesce((p_payload->>'horizonDays')::integer,60),coalesce((p_payload->>'leadMinutes')::integer,30),coalesce((p_payload->>'cancellationMinutes')::integer,0),coalesce(p_payload->>'privacyNotice',''),coalesce(p_payload->>'privacyContact',''),coalesce(p_payload->>'cancellationNotice',''),p_payload->>'coverPath',coalesce(p_payload->>'coverAlt',''),(p_payload->>'operation')::uuid,fingerprint)
  on conflict(restaurant_id) do update set slug=excluded.slug,enabled=excluded.enabled,max_party=excluded.max_party,pending_minutes=excluded.pending_minutes,horizon_days=excluded.horizon_days,lead_minutes=excluded.lead_minutes,cancellation_minutes=excluded.cancellation_minutes,privacy_notice=excluded.privacy_notice,privacy_contact=excluded.privacy_contact,cancellation_notice=excluded.cancellation_notice,cover_path=excluded.cover_path,cover_alt=excluded.cover_alt,updated_at=private.rm015_now(),version=rm015_settings.version+1,last_operation=excluded.last_operation,last_fingerprint=excluded.last_fingerprint;
  if c.cover_path is distinct from p_payload->>'coverPath' or coalesce(c.cover_alt,'') is distinct from coalesce(p_payload->>'coverAlt','') then insert into private.rm015_audit(restaurant_id,actor_id,actor_type,action,old_state,new_state) values(rid,(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid),'staff','photo_change',jsonb_build_object('path',c.cover_path,'alt',c.cover_alt)::text,jsonb_build_object('path',p_payload->>'coverPath','alt',p_payload->>'coverAlt')::text);end if;
  insert into private.rm015_audit(restaurant_id,actor_id,actor_type,action) values(rid,(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid),'staff','configure');
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
 return jsonb_build_object('schema',1,'mediaEnabled',true,'restaurantId',rid,'role',staff,'settings',case when c.restaurant_id is null then jsonb_build_object('enabled',false,'pendingMinutes',60,'version',0) else jsonb_build_object('slug',c.slug,'enabled',c.enabled,'maxParty',c.max_party,'pendingMinutes',c.pending_minutes,'horizonDays',c.horizon_days,'leadMinutes',c.lead_minutes,'cancellationMinutes',c.cancellation_minutes,'privacyNotice',c.privacy_notice,'privacyContact',c.privacy_contact,'cancellationNotice',c.cancellation_notice,'coverPath',c.cover_path,'coverAlt',c.cover_alt,'version',c.version) end,'requests',items,'events',(select coalesce(jsonb_agg(e),'[]') from (select distinct on(a.request_id) a.id,a.action,a.occurred_at,q.reference,q.reservation_id,q.draft,q.contact->>'firstName' as first_name,q.contact->>'lastName' as last_name from private.rm015_audit a join private.rm015_requests q on q.id=a.request_id where a.restaurant_id=rid and a.actor_type='public_api' and a.action in ('confirm','modify','cancel') and a.occurred_at>private.rm015_now()-interval '7 days' order by a.request_id,a.id desc limit 100) e),'mailIssues',(select count(*) from private.rm015_mail where restaurant_id=rid and state in ('failed','uncertain')),'serverTime',private.rm015_now());
end $$;

create or replace function public.rm015_gateway_v1(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.rm015_settings;r private.rm015_requests;b public.reservations;slot jsonb;result jsonb;v_contact jsonb;op private.rm015_operations;
 fingerprint text;operation uuid;d jsonb;token text;requested_id uuid;deadline timestamptz;times jsonb:='[]';at_time time;part jsonb;daykey text;datevalue date;party integer;oldstate text;
begin
 if current_setting('role',true) is distinct from 'service_role' or (coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid) is not null then raise exception 'Accès refusé' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16000 or p_action not in ('profile','availability','hold','recover','release','read','submit','modify','cancel') then raise exception 'Requête invalide' using errcode='RM015',detail='INVALID';end if;
 select * into c from private.rm015_settings where slug=p_payload->>'restaurant';if not found then raise exception 'Restaurant indisponible' using errcode='RM015',detail='UNAVAILABLE';end if;
 perform private.rm015_scope(c.restaurant_id);perform private.rm015_expire(c.restaurant_id);
 if p_action in ('profile','availability') and p_payload->>'token_hash' is not null then
  select * into r from private.rm015_requests where restaurant_id=c.restaurant_id and token_hash=p_payload->>'token_hash';
  if not found or r.token_expires_at<=private.rm015_now() then raise exception 'Lien indisponible' using errcode='RM015',detail='TOKEN';end if;
 end if;
 if p_action in ('profile','availability','hold') and not c.enabled and r.id is null then raise exception 'Réservations en ligne fermées' using errcode='RM015',detail='UNAVAILABLE';end if;
 if p_action='profile' then
  return jsonb_build_object('name',(select name from public.restaurants where id=c.restaurant_id),'slug',c.slug,'timezone','Europe/Paris','maxParty',c.max_party,'horizonDays',c.horizon_days,'leadMinutes',c.lead_minutes,'pendingMinutes',c.pending_minutes,'manualFrom',4,'privacyNotice',c.privacy_notice,'privacyContact',c.privacy_contact,'cancellationNotice',c.cancellation_notice,'coverPath',c.cover_path,'coverAlt',c.cover_alt,'today',(private.rm015_now() at time zone 'Europe/Paris')::date,'serverTime',private.rm015_now());
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

-- CREATE OR REPLACE retains existing function identities, owners and grants.
-- Hosted Auth is managed: do not introduce a new auth schema USAGE requirement.
revoke create on schema private from rm015_public_writer;
do $$begin execute format('grant rm015_public_writer to %I with inherit false, set true',current_user);end$$;
commit;
