-- RM-015.6 PREPARED: explicit approval before shared DEV application.
-- Public editorial information only. Does not change any restaurant hour or booking.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$begin execute format('grant rm015_public_writer to %I with inherit true, set true',current_user);end$$;
grant create on schema private to rm015_public_writer;
create or replace function private.rm015_profile_validate(p jsonb) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb:='{}';key text;value jsonb;content text;maximum integer;begin
 if p is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>8000 or p-array['name','description','address','phone']<>'{}'::jsonb then raise exception 'Informations publiques invalides' using errcode='RM015',detail='INVALID';end if;
 for key,value in select * from jsonb_each(p) loop
  if jsonb_typeof(value) is distinct from 'string' then raise exception 'Informations publiques invalides' using errcode='RM015',detail='INVALID';end if;
  content:=btrim(p->>key);maximum:=case key when 'name' then 180 when 'description' then 1200 when 'address' then 300 when 'phone' then 40 end;
  if length(content)>maximum then raise exception 'Information publique trop longue' using errcode='RM015',detail='INVALID';end if;
  if key='name' then content:=regexp_replace(content,E'[\r\n]+',' ','g');end if;
  if key='phone' then content:=regexp_replace(translate(content,chr(160)||chr(8239),'  '),'\s+',' ','g');end if;
  if key='phone' and content<>'' and (content !~ '^\+?[0-9 ().-]+$' or length(regexp_replace(content,'[^0-9]','','g')) not between 6 and 15) then raise exception 'Indiquez un numéro de téléphone valide' using errcode='RM015',detail='INVALID';end if;
  result:=result||jsonb_build_object(key,content);
 end loop;
 return result;
end$$;
alter function private.rm015_profile_validate(jsonb) owner to rm015_public_writer;
revoke all on function private.rm015_profile_validate(jsonb) from public,anon,authenticated,service_role;
alter table private.rm015_settings add column if not exists public_profile jsonb not null default '{}';
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='private.rm015_settings'::regclass and conname='rm015_public_profile_valid') then
  alter table private.rm015_settings add constraint rm015_public_profile_valid check(public_profile=private.rm015_profile_validate(public_profile));
 end if;
end$$;
-- Same validated weekly plan read by rm015_slot. No invented closing time or internal capacity.
create or replace function private.rm015_public_hours(p_restaurant uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare plan jsonb;day text;service text;part jsonb;parts jsonb;result jsonb:='[]';begin
 select weekly_schedule into plan from public.restaurant_hours where restaurant_id=p_restaurant;
 if plan is null or jsonb_typeof(plan) is distinct from 'object' then return result;end if;
 foreach day in array array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] loop
  parts:='{}';
  foreach service in array array['lunch','dinner'] loop
   part:=plan->day->service;
   if jsonb_typeof(part->'enabled') is distinct from 'boolean' or coalesce(part->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(part->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return '[]'::jsonb;end if;
   parts:=parts||jsonb_build_object(service,case when (part->>'enabled')::boolean then jsonb_build_object('enabled',true,'start',part->>'start','lastArrival',part->>'end') else jsonb_build_object('enabled',false) end);
  end loop;
  result:=result||jsonb_build_array(parts||jsonb_build_object('day',day));
 end loop;
 return result;
end$$;
alter function private.rm015_public_hours(uuid) owner to rm015_public_writer;
revoke all on function private.rm015_public_hours(uuid) from public,anon,authenticated,service_role;

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
  p_payload:=p_payload||jsonb_build_object('publicProfile',private.rm015_profile_validate(case when p_payload ? 'publicProfile' then p_payload->'publicProfile' else coalesce(c.public_profile,'{}') end));
  insert into private.rm015_settings(restaurant_id,slug,enabled,max_party,pending_minutes,horizon_days,lead_minutes,cancellation_minutes,privacy_notice,privacy_contact,cancellation_notice,cover_path,cover_alt,public_profile,last_operation,last_fingerprint)
  values(rid,p_payload->>'slug',(p_payload->>'enabled')::boolean,(p_payload->>'maxParty')::integer,coalesce((p_payload->>'pendingMinutes')::integer,60),coalesce((p_payload->>'horizonDays')::integer,60),coalesce((p_payload->>'leadMinutes')::integer,30),coalesce((p_payload->>'cancellationMinutes')::integer,0),coalesce(p_payload->>'privacyNotice',''),coalesce(p_payload->>'privacyContact',''),coalesce(p_payload->>'cancellationNotice',''),p_payload->>'coverPath',coalesce(p_payload->>'coverAlt',''),p_payload->'publicProfile',(p_payload->>'operation')::uuid,fingerprint)
  on conflict(restaurant_id) do update set slug=excluded.slug,enabled=excluded.enabled,max_party=excluded.max_party,pending_minutes=excluded.pending_minutes,horizon_days=excluded.horizon_days,lead_minutes=excluded.lead_minutes,cancellation_minutes=excluded.cancellation_minutes,privacy_notice=excluded.privacy_notice,privacy_contact=excluded.privacy_contact,cancellation_notice=excluded.cancellation_notice,cover_path=excluded.cover_path,cover_alt=excluded.cover_alt,public_profile=excluded.public_profile,updated_at=private.rm015_now(),version=rm015_settings.version+1,last_operation=excluded.last_operation,last_fingerprint=excluded.last_fingerprint;
  if coalesce(c.public_profile,'{}') is distinct from p_payload->'publicProfile' then insert into private.rm015_audit(restaurant_id,actor_id,actor_type,action,old_state,new_state) values(rid,(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid),'staff','public_profile_change',coalesce(c.public_profile,'{}')::text,(p_payload->'publicProfile')::text);end if;
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
 return jsonb_build_object('schema',1,'mediaEnabled',true,'profileEnabled',true,'openingHours',private.rm015_public_hours(rid),'restaurantId',rid,'role',staff,'settings',case when c.restaurant_id is null then jsonb_build_object('enabled',false,'pendingMinutes',60,'version',0) else jsonb_build_object('slug',c.slug,'enabled',c.enabled,'maxParty',c.max_party,'pendingMinutes',c.pending_minutes,'horizonDays',c.horizon_days,'leadMinutes',c.lead_minutes,'cancellationMinutes',c.cancellation_minutes,'privacyNotice',c.privacy_notice,'privacyContact',c.privacy_contact,'cancellationNotice',c.cancellation_notice,'coverPath',c.cover_path,'coverAlt',c.cover_alt,'publicProfile',c.public_profile,'version',c.version) end,'requests',items,'events',(select coalesce(jsonb_agg(e),'[]') from (select distinct on(a.request_id) a.id,a.action,a.occurred_at,q.reference,q.reservation_id,q.draft,q.contact->>'firstName' as first_name,q.contact->>'lastName' as last_name from private.rm015_audit a join private.rm015_requests q on q.id=a.request_id where a.restaurant_id=rid and a.actor_type='public_api' and a.action in ('confirm','modify','cancel') and a.occurred_at>private.rm015_now()-interval '7 days' order by a.request_id,a.id desc limit 100) e),'mailIssues',(select count(*) from private.rm015_mail where restaurant_id=rid and state in ('failed','uncertain')),'serverTime',private.rm015_now());
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
  return jsonb_build_object('name',coalesce(nullif(c.public_profile->>'name',''),(select name from public.restaurants where id=c.restaurant_id)),'slug',c.slug,'timezone','Europe/Paris','maxParty',c.max_party,'horizonDays',c.horizon_days,'leadMinutes',c.lead_minutes,'pendingMinutes',c.pending_minutes,'manualFrom',4,'privacyNotice',c.privacy_notice,'privacyContact',c.privacy_contact,'cancellationNotice',c.cancellation_notice,'coverPath',c.cover_path,'coverAlt',c.cover_alt,'publicProfile',c.public_profile,'openingHours',private.rm015_public_hours(c.restaurant_id),'today',(private.rm015_now() at time zone 'Europe/Paris')::date,'serverTime',private.rm015_now());
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

create or replace function public.rm015_mail_v1(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.rm015_mail;r private.rm015_requests;c private.rm015_settings;claimed uuid;result jsonb:='[]';stamp timestamptz:=private.rm015_now();
begin
 if current_setting('role',true) is distinct from 'service_role' or (coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid) is not null or p_action not in ('claim','ack','fail') then raise exception 'Accès refusé' using errcode='42501';end if;
 if p_action='claim' then
  for j in select * from private.rm015_mail where (state='queued' and next_at<=stamp) or (state='sending' and lease_until<stamp) order by restaurant_id,created_at,id limit 5 loop
   perform private.rm015_scope(j.restaurant_id);perform private.rm015_expire(j.restaurant_id);
   if j.created_at<stamp-interval '23 hours' then update private.rm015_mail set state='uncertain' where id=j.id and state in ('sending','queued');continue;end if;
   if exists(select 1 from private.rm015_mail newer where newer.request_id=j.request_id and newer.version>j.version and newer.state<>'superseded') then update private.rm015_mail set state='superseded' where id=j.id and state in ('queued','sending');continue;end if;
   claimed:=gen_random_uuid();
   update private.rm015_mail set state='sending',lease=claimed,lease_until=stamp+interval '90 seconds',attempts=attempts+1 where id=j.id and ((state='queued' and next_at<=stamp) or (state='sending' and lease_until<stamp));
   if not found then continue;end if;
   select * into strict r from private.rm015_requests where id=j.request_id;select * into strict c from private.rm015_settings where restaurant_id=j.restaurant_id;
   result:=result||jsonb_build_array(jsonb_build_object('id',j.id,'lease',claimed,'event',j.event,'email',r.contact->>'email','tokenCipher',r.token_cipher,'restaurant',c.slug,'restaurantName',coalesce(nullif(c.public_profile->>'name',''),(select name from public.restaurants where id=c.restaurant_id)),'restaurantProfile',c.public_profile,'record',private.rm015_view(r.id)->'data'));
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
revoke create on schema private from rm015_public_writer;
do $$begin execute format('grant rm015_public_writer to %I with inherit false, set true',current_user);end$$;
commit;
