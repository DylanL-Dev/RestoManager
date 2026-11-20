-- RM-015.8 PREPARED. Shared DEV application requires explicit approval (#173 section 9.C).
-- No existing booking, restaurant setting, hour or closure is reclassified or enabled.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
do $$begin execute format('grant rm015_public_writer to %I with inherit true, set true',current_user);end$$;
grant create on schema private to rm015_public_writer;
alter table private.rm015_settings add column if not exists hotel_guests_enabled boolean not null default false;
create or replace function private.rm015_contact(p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$declare kind text;room text;pending boolean;begin
 if jsonb_typeof(p) is distinct from 'object' or p->'accepted' is distinct from 'true'::jsonb
 or jsonb_typeof(p->'firstName') is distinct from 'string' or length(btrim(p->>'firstName')) not between 1 and 80
 or jsonb_typeof(p->'lastName') is distinct from 'string' or length(btrim(p->>'lastName')) not between 1 and 80
 or jsonb_typeof(p->'email') is distinct from 'string' or length(p->>'email')>254 or p->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or length(coalesce(p->>'phone',''))>30 or length(coalesce(p->>'notes',''))>500
 or position('[RESTOMANAGER:' in upper(coalesce(p->>'notes','')))>0 then raise exception 'Coordonnées invalides' using errcode='RM015',detail='INVALID';end if;
 kind:=coalesce(p->>'guestType','external');room:=btrim(coalesce(p->>'hotelRoom',''));pending:=case when jsonb_typeof(p->'roomPending')='boolean' then (p->>'roomPending')::boolean else false end;
 if kind not in ('hotel','external') or (p ? 'guestType' and jsonb_typeof(p->'guestType') is distinct from 'string') or (p ? 'hotelRoom' and jsonb_typeof(p->'hotelRoom') is distinct from 'string') or (p ? 'roomPending' and jsonb_typeof(p->'roomPending') is distinct from 'boolean')
 or (kind='external' and (room<>'' or pending)) or (kind='hotel' and ((pending and room<>'') or (not pending and (room='' or length(room)>20 or room !~ '^[[:alnum:] ._-]+$')))) then raise exception 'Informations du séjour invalides' using errcode='RM015',detail='INVALID';end if;
 return jsonb_build_object('firstName',btrim(p->>'firstName'),'lastName',btrim(p->>'lastName'),'email',lower(btrim(p->>'email')),'phone',coalesce(p->>'phone',''),'notes',coalesce(p->>'notes',''),'accepted',true,'guestType',kind,'hotelRoom',room,'roomPending',pending);
end $$;

create or replace function private.rm015_booking_draft(b public.reservations) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('guestType',case when nullif(btrim(b.hotel_room),'') is not null or position('[RESTOMANAGER:HOTEL]' in coalesce(b.notes,''))>0 then 'hotel' else 'external' end,'hotelRoom',coalesce(b.hotel_room,''),'roomPending',(nullif(btrim(b.hotel_room),'') is null and position('[RESTOMANAGER:HOTEL]' in coalesce(b.notes,''))>0),'party',b.party_size,'date',(b.starts_at at time zone 'Europe/Paris')::date,'time',to_char(b.starts_at at time zone 'Europe/Paris','HH24:MI'),'service',case when (b.starts_at at time zone 'Europe/Paris')::time between (h.weekly_schedule->(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from b.starts_at at time zone 'Europe/Paris')::integer]->'lunch'->>'start')::time and (h.weekly_schedule->(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from b.starts_at at time zone 'Europe/Paris')::integer]->'lunch'->>'end')::time then 'lunch' else 'dinner' end)
 from public.restaurant_hours h where h.restaurant_id=b.restaurant_id
$$;

create or replace function private.rm015_restore(p_id uuid) returns void language sql security invoker set search_path='' as $$
 update private.rm015_requests q set contact=case when q.contact is null then null else q.contact||jsonb_build_object('guestType',private.rm015_booking_draft(b)->'guestType','hotelRoom',private.rm015_booking_draft(b)->'hotelRoom','roomPending',private.rm015_booking_draft(b)->'roomPending') end,draft=private.rm015_booking_draft(b),starts_at=b.starts_at,ends_at=b.ends_at,token_expires_at=b.starts_at+interval '7 days' from public.reservations b where q.id=p_id and b.id=q.reservation_id and b.restaurant_id=q.restaurant_id
$$;

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
 return jsonb_build_object('secret_cipher',r.token_cipher,'data',jsonb_build_object('reference',r.reference,'state',r.state,'version',r.version,'draft',r.draft,'booking',booking,'contact',case when r.state='confirmed' and b.id is not null and r.contact is not null then r.contact||jsonb_build_object('guestType',booking->'guestType','hotelRoom',booking->'hotelRoom','roomPending',booking->'roomPending') else r.contact end,'deadline',r.expires_at,'tokenExpiresAt',r.token_expires_at,'canModify',coalesce(editable,false),'canCancel',coalesce(cancelable,false),'lastResult',r.last_result,'emailStatus',(select state from private.rm015_mail where request_id=r.id order by created_at desc,id desc limit 1)));
end $$;

create or replace function private.rm015_commit(p_id uuid,p_slot jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare r private.rm015_requests;b public.reservations;ids uuid[];note text;marker text;oldstate text;
begin
 select * into strict r from private.rm015_requests where id=p_id for update;oldstate:=r.state;
 select array_agg(value::uuid order by value) into ids from jsonb_array_elements_text(p_slot->'ids');
 if not coalesce((p_slot->>'available')::boolean,false) or coalesce(cardinality(ids),0)=0 or not private.check_fusion_selection(ids) then raise exception 'Créneau indisponible' using errcode='RM015',detail='FULL';end if;
 select * into b from public.reservations where id=r.reservation_id for update;
 if b.id is not null and b.status not in ('reserved','confirmed','late') then raise exception 'Cette réservation ne peut plus être modifiée' using errcode='RM015',detail='LOCKED';end if;
 delete from public.table_holds where web_request_id=p_id;
 -- Keep the original reservation until this transaction can commit the complete replacement.
 update private.rm015_requests set state='confirmed',last_result=null,expires_at=private.rm015_now(),updated_at=private.rm015_now() where id=p_id;
 -- Replace only the classification marker; keep internal text and whitespace verbatim.
 marker:=case when r.contact->>'guestType'='hotel' then '[RESTOMANAGER:HOTEL]' else '[RESTOMANAGER:EXTERIEUR]' end;
 note:=replace(coalesce(b.notes,''),case when r.contact->>'guestType'='hotel' then '[RESTOMANAGER:EXTERIEUR]' else '[RESTOMANAGER:HOTEL]' end,marker);
 if position(marker in note)=0 then note:=note||case when note='' or right(note,1)=E'\n' then '' else E'\n' end||marker;end if;
 if b.id is null then
  insert into public.reservations(id,restaurant_id,guest_name,hotel_room,party_size,starts_at,ends_at,status,notes,created_by,confirmed_at,source_channel,guest_request_notes)
  values(r.id,r.restaurant_id,(r.contact->>'firstName')||' '||(r.contact->>'lastName'),case when r.contact->>'guestType'='hotel' then nullif(r.contact->>'hotelRoom','') else null end,(r.draft->>'party')::integer,(p_slot->>'starts_at')::timestamptz,(p_slot->>'ends_at')::timestamptz,'confirmed',note,null,private.rm015_now(),'web',coalesce(r.contact->>'notes',''));
 else
  update public.reservations set hotel_room=case when r.contact->>'guestType'='hotel' then nullif(r.contact->>'hotelRoom','') else null end,guest_name=(r.contact->>'firstName')||' '||(r.contact->>'lastName'),party_size=(r.draft->>'party')::integer,starts_at=(p_slot->>'starts_at')::timestamptz,ends_at=(p_slot->>'ends_at')::timestamptz,notes=note,guest_request_notes=coalesce(r.contact->>'notes',''),status='confirmed',confirmed_at=private.rm015_now() where id=b.id;
  delete from public.reservation_tables where reservation_id=b.id;
 end if;
 insert into public.reservation_tables(restaurant_id,reservation_id,table_id) select r.restaurant_id,r.id,x from unnest(ids) x;
 update private.rm015_requests set reservation_id=r.id,starts_at=(p_slot->>'starts_at')::timestamptz,ends_at=(p_slot->>'ends_at')::timestamptz,token_expires_at=(p_slot->>'starts_at')::timestamptz+interval '7 days',version=version+1,updated_at=private.rm015_now() where id=r.id;
 if b.id is null or row(b.hotel_room,position('[RESTOMANAGER:HOTEL]' in coalesce(b.notes,''))>0) is distinct from row(case when r.contact->>'guestType'='hotel' then nullif(r.contact->>'hotelRoom','') else null end,r.contact->>'guestType'='hotel') then insert into private.rm015_audit(restaurant_id,request_id,reservation_id,actor_type,action,old_state,new_state) values(r.restaurant_id,r.id,r.id,'public_api','guest_profile_change',case when b.id is null then null else jsonb_build_object('hotelRoom',b.hotel_room,'hotel',position('[RESTOMANAGER:HOTEL]' in coalesce(b.notes,''))>0)::text end,jsonb_build_object('guestType',r.contact->>'guestType','hotelRoom',r.contact->>'hotelRoom','roomPending',r.contact->'roomPending')::text);end if;
 perform private.rm015_audit_event(r.id,case when b.id is null then 'confirm' else 'modify' end,oldstate,'confirmed');
 perform private.rm015_enqueue(r.id,case when b.id is null then 'confirmed' else 'modified' end);
end $$;

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
  if p_payload ? 'hotelGuestsEnabled' and jsonb_typeof(p_payload->'hotelGuestsEnabled') is distinct from 'boolean' then raise exception 'Choix Hôtel invalide' using errcode='RM015',detail='INVALID';end if;
  insert into private.rm015_settings(restaurant_id,slug,enabled,max_party,pending_minutes,horizon_days,lead_minutes,cancellation_minutes,privacy_notice,privacy_contact,cancellation_notice,cover_path,cover_alt,public_profile,hotel_guests_enabled,last_operation,last_fingerprint)
  values(rid,p_payload->>'slug',(p_payload->>'enabled')::boolean,(p_payload->>'maxParty')::integer,coalesce((p_payload->>'pendingMinutes')::integer,60),coalesce((p_payload->>'horizonDays')::integer,60),coalesce((p_payload->>'leadMinutes')::integer,30),coalesce((p_payload->>'cancellationMinutes')::integer,0),coalesce(p_payload->>'privacyNotice',''),coalesce(p_payload->>'privacyContact',''),coalesce(p_payload->>'cancellationNotice',''),p_payload->>'coverPath',coalesce(p_payload->>'coverAlt',''),p_payload->'publicProfile',coalesce((p_payload->>'hotelGuestsEnabled')::boolean,c.hotel_guests_enabled,false),(p_payload->>'operation')::uuid,fingerprint)
  on conflict(restaurant_id) do update set slug=excluded.slug,enabled=excluded.enabled,max_party=excluded.max_party,pending_minutes=excluded.pending_minutes,horizon_days=excluded.horizon_days,lead_minutes=excluded.lead_minutes,cancellation_minutes=excluded.cancellation_minutes,privacy_notice=excluded.privacy_notice,privacy_contact=excluded.privacy_contact,cancellation_notice=excluded.cancellation_notice,cover_path=excluded.cover_path,cover_alt=excluded.cover_alt,public_profile=excluded.public_profile,hotel_guests_enabled=excluded.hotel_guests_enabled,updated_at=private.rm015_now(),version=rm015_settings.version+1,last_operation=excluded.last_operation,last_fingerprint=excluded.last_fingerprint;
  if coalesce(c.hotel_guests_enabled,false) is distinct from coalesce((p_payload->>'hotelGuestsEnabled')::boolean,c.hotel_guests_enabled,false) then insert into private.rm015_audit(restaurant_id,actor_id,actor_type,action,old_state,new_state) values(rid,(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid),'staff','hotel_guest_mode_change',coalesce(c.hotel_guests_enabled,false)::text,coalesce((p_payload->>'hotelGuestsEnabled')::boolean,c.hotel_guests_enabled,false)::text);end if;
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
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'reference',q.reference,'state',q.state,'version',q.version,'draft',q.draft,'deadline',q.expires_at,'createdAt',q.created_at,'contact',case when staff='fb_admin' then q.contact else jsonb_build_object('firstName',q.contact->>'firstName','lastName',q.contact->>'lastName','guestType',q.contact->>'guestType','hotelRoom',q.contact->>'hotelRoom','roomPending',q.contact->'roomPending') end) order by q.created_at,q.id),'[]') into items
 from private.rm015_requests q where q.restaurant_id=rid and q.state in ('pending','pending_change') and q.expires_at>private.rm015_now();
 return jsonb_build_object('schema',1,'mediaEnabled',true,'profileEnabled',true,'hotelGuestsCapability',true,'openingHours',private.rm015_public_hours(rid),'restaurantId',rid,'role',staff,'settings',case when c.restaurant_id is null then jsonb_build_object('enabled',false,'pendingMinutes',60,'version',0) else jsonb_build_object('slug',c.slug,'enabled',c.enabled,'maxParty',c.max_party,'pendingMinutes',c.pending_minutes,'horizonDays',c.horizon_days,'leadMinutes',c.lead_minutes,'cancellationMinutes',c.cancellation_minutes,'privacyNotice',c.privacy_notice,'privacyContact',c.privacy_contact,'cancellationNotice',c.cancellation_notice,'coverPath',c.cover_path,'coverAlt',c.cover_alt,'publicProfile',c.public_profile,'hotelGuestsEnabled',c.hotel_guests_enabled,'version',c.version) end,'requests',items,'events',(select coalesce(jsonb_agg(e),'[]') from (select distinct on(a.request_id) a.id,a.action,a.occurred_at,q.reference,q.reservation_id,q.draft,q.contact->>'firstName' as first_name,q.contact->>'lastName' as last_name from private.rm015_audit a join private.rm015_requests q on q.id=a.request_id where a.restaurant_id=rid and a.actor_type='public_api' and a.action in ('confirm','modify','cancel') and a.occurred_at>private.rm015_now()-interval '7 days' order by a.request_id,a.id desc limit 100) e),'mailIssues',(select count(*) from private.rm015_mail where restaurant_id=rid and state in ('failed','uncertain')),'serverTime',private.rm015_now());
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
  return jsonb_build_object('name',coalesce(nullif(c.public_profile->>'name',''),(select name from public.restaurants where id=c.restaurant_id)),'slug',c.slug,'timezone','Europe/Paris','maxParty',c.max_party,'horizonDays',c.horizon_days,'leadMinutes',c.lead_minutes,'pendingMinutes',c.pending_minutes,'manualFrom',4,'hotelGuestsEnabled',c.hotel_guests_enabled,'privacyNotice',c.privacy_notice,'privacyContact',c.privacy_contact,'cancellationNotice',c.cancellation_notice,'coverPath',c.cover_path,'coverAlt',c.cover_alt,'publicProfile',c.public_profile,'openingHours',private.rm015_public_hours(c.restaurant_id),'today',(private.rm015_now() at time zone 'Europe/Paris')::date,'serverTime',private.rm015_now());
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
  v_contact:=private.rm015_contact(case when r.contact is not null and not (p_payload->'contact' ? 'guestType') then (p_payload->'contact')||coalesce(case when r.state='confirmed' then (select private.rm015_booking_draft(actual)-array['party','date','time','service'] from public.reservations actual where actual.id=r.reservation_id and actual.restaurant_id=r.restaurant_id) end,jsonb_build_object('guestType',coalesce(r.contact->>'guestType','external'),'hotelRoom',coalesce(r.contact->>'hotelRoom',''),'roomPending',coalesce((r.contact->>'roomPending')::boolean,false))) else p_payload->'contact' end);
  if v_contact->>'guestType'='hotel' and not c.hotel_guests_enabled and coalesce(r.contact->>'guestType','external')<>'hotel' and not exists(select 1 from public.reservations actual where actual.id=r.reservation_id and actual.restaurant_id=r.restaurant_id and (nullif(btrim(actual.hotel_room),'') is not null or position('[RESTOMANAGER:HOTEL]' in coalesce(actual.notes,''))>0)) then raise exception 'Le parcours Hôtel n’est pas proposé par cet établissement' using errcode='RM015',detail='INVALID';end if;
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
revoke create on schema private from rm015_public_writer;
do $$begin execute format('grant rm015_public_writer to %I with inherit false, set true',current_user);end$$;
commit;
