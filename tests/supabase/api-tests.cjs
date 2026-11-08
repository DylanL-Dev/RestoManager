'use strict';

// Real Auth/PostgREST tests. The runner owns a disposable local Supabase stack.
// Never accept a hosted URL, never log credentials, JWTs, client notes or rows.
const {randomUUID}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const nodeAssert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

async function run({url,anonKey,accounts,sql,day,assert=nodeAssert}){
 const endpoint=new URL(url);
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname),'API tests require a loopback Supabase URL');
 assert.ok(['http:','https:'].includes(endpoint.protocol),'API tests require HTTP(S)');
 assert.ok(typeof sql==='function','A disposable local SQL fixture callback is required');
 assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(day),'A future Paris date is required');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 assert.ok(day>today,'The test date must be in the future');
 const aId='10000000-0000-4000-8000-000000000001',bId='10000000-0000-4000-8000-000000000002';
 const account=(rid,role)=>accounts.find(a=>a.restaurantId===rid&&a.role===role);
 const admin=account(aId,'fb_admin'),reception=account(aId,'reception'),foreign=account(bId,'fb_admin'),foreignReception=account(bId,'reception');
 assert.ok(admin&&reception&&foreign&&foreignReception,'Four role/tenant Auth accounts are required');
 const peerAdmin=accounts.find(a=>a.restaurantId===aId&&a.role==='fb_admin'&&a.userId!==admin.userId&&a.client)||admin;
 const clients=[admin,reception,foreign,foreignReception];
 for(const a of clients)assert.ok(a.client&&a.userId,'Accounts must have real signed-in clients');
 const tag='API-'+randomUUID().slice(0,8),rooms=[randomUUID(),randomUUID()];
 const labelBase=900000000+Number.parseInt(randomUUID().slice(0,8),16);
 const ownTables=Array.from({length:9},()=>randomUUID()),otherTables=Array.from({length:3},()=>randomUUID());
 const keys=new Set(),reservationIds=new Set(),results=[];
 const artifactDirectory=process.env.MISSION3_ARTIFACTS||path.join(os.tmpdir(),'restomanager-mission3-api-'+process.pid);
 const artifactFile=path.join(artifactDirectory,'api-results.json');
 function persist(){
  const passed=results.filter(r=>r.status==='passed').length;
  fs.mkdirSync(artifactDirectory,{recursive:true,mode:0o700});
  fs.writeFileSync(artifactFile,JSON.stringify({passed,failed:results.length-passed,results},null,2),{mode:0o600});
 }
 function recordFailure(name,error){
  const code=String(error?.code||'ASSERTION').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40);
  // All assertion messages below are fixed labels/codes. Avoid serializing
  // arbitrary thrown objects: they can carry HTTP request bodies or sessions.
  const message=error?.name==='AssertionError'?String(error.message||'Assertion failed').split('\n')[0].slice(0,260):'Unexpected failure (request and row details omitted)';
  results.push({name,status:'failed',code,message});persist();
  console.log('FAIL '+name+' ['+code+'] '+message);
 }
 const quote=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'";
 const uuidArray=ids=>'array['+ids.map(quote).join(',')+']::uuid[]';
 async function db(query){
  const response=await sql(query);
  if(typeof response==='string')return response.trim();
  assert.ok(response&&(!('code' in response)||response.code===0),'Local SQL fixture operation failed');
  return String(response.stdout??response.output??'').trim();
 }
 const json=async query=>JSON.parse(await db(query));
 const safeCode=result=>String(result?.error?.code||result?.status||'UNKNOWN').replace(/[^A-Za-z0-9_-]/g,'').slice(0,30);
 function success(result,label){assert.ok(!result.error,label+' failed ('+safeCode(result)+')');return result.data;}
 function rejection(result,codes,label){
  assert.ok(result.error,label+' must be refused');
  if(codes)assert.ok(codes.includes(result.error.code),label+' returned unexpected code '+safeCode(result));
  return result.error;
 }
 async function test(name,fn){
  try{await fn();results.push({name,status:'passed'});persist();console.log('PASS '+name);}
  catch(error){recordFailure(name,error);}
 }
 function slot(offset){
  const date=new Date(day+'T12:00:00.000Z');date.setUTCDate(date.getUTCDate()+offset);
  const dateText=date.toISOString().slice(0,10);
  // Noon UTC is 13:00/14:00 Paris; use Intl to resolve the Paris noon offset.
  const z=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',timeZoneName:'shortOffset',hour:'2-digit'}).formatToParts(date).find(p=>p.type==='timeZoneName').value;
  const m=/GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(z);assert.ok(m,'Paris offset must be available');
  const minutes=(m[1]==='+'?1:-1)*(Number(m[2])*60+Number(m[3]||0));
  const start=new Date(Date.parse(dateText+'T12:00:00.000Z')-minutes*60000).toISOString();
  return {start,end:new Date(Date.parse(start)+90*60000).toISOString()};
 }
 const rpc=(a,name,args={})=>a.client.rpc(name,args);
 async function hold(a,tables,when,guests=2,key=randomUUID()){
  keys.add(key);
  const data=success(await rpc(a,'booking_draft_v3',{p_key:key,p_action:'hold',p_start:when.start,p_end:when.end,p_guests:guests,p_tables:tables}), 'Draft hold');
  assert.ok(Array.isArray(data.tables)&&data.tables.length>0,'A real hold must return assigned tables');
  return {key,data};
 }
 async function confirm(a,key,changes={}){
  const data=success(await rpc(a,'booking_draft_v3',{p_key:key,p_action:'confirm',p_name:tag+'-client',p_room:null,p_notes:'[RESTOMANAGER:EXTERIEUR]',...changes}),'Draft confirm');
  assert.ok(data.booking,'Confirmation must return a reservation UUID');reservationIds.add(data.booking);return data;
 }
 async function create(a,tables,when,changes={},guests=2){const d=await hold(a,tables,when,guests);return confirm(a,d.key,changes);}
 async function row(a,id){return success(await a.client.from('reservations').select('*').eq('id',id).single(),'Read reservation');}
 function editArgs(record,tables,changes={}){
  return {p_reservation_id:record.id,p_expected_version:record.edit_version,p_guest_name:record.guest_name,
   p_hotel_room:record.hotel_room,p_party_size:record.party_size,p_starts_at:record.starts_at,p_ends_at:record.ends_at,
   p_table_ids:tables,p_notes:record.notes,...changes};
 }
 function receptionArgs(record,changes={}){const args=editArgs(record,[],changes);delete args.p_table_ids;return args;}
 const anon=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
 let originalHours=[];
 let retryClient;
 try{
  persist();
  await test('Final isolated Mission 3 migration reapplies twice without schema drift',async()=>{
   const migration=fs.readFileSync(path.resolve(__dirname,'../../supabase/scripts/mission3_validation_integration.sql'),'utf8');
   await db(migration);await db(migration);
  });
  originalHours=await json(`select coalesce(json_agg(h),'[]'::json) from (select restaurant_id,id,lunch_enabled,lunch_start,lunch_end,dinner_enabled,dinner_start,dinner_end from public.restaurant_hours where restaurant_id in (${quote(aId)},${quote(bId)})) h;`);
  // Fixtures are deliberately outside the seed IDs and are removed in finally.
  // All dates/notes/names are fictitious. Direct SQL is only the local fixture layer.
  await db(`begin;select set_config('request.jwt.claim.sub',${quote(admin.userId)},true);insert into public.restaurant_rooms(id,name,restaurant_id) values (${quote(rooms[0])},${quote(tag+'-A')},${quote(aId)}),(${quote(rooms[1])},${quote(tag+'-B')},${quote(bId)});
   insert into public.restaurant_tables(id,room_id,label,seats,restaurant_id) values ${ownTables.map((id,i)=>`(${quote(id)},${quote(rooms[0])},'Table ${labelBase+i}',${i===8?50:2},${quote(aId)})`).concat(otherTables.map((id,i)=>`(${quote(id)},${quote(rooms[1])},'Table ${labelBase+100+i}',2,${quote(bId)})`)).join(',')};
   update public.restaurant_hours set lunch_enabled=true,lunch_start='11:00',lunch_end='15:00',dinner_enabled=true,dinner_start='18:00',dinner_end='23:00' where restaurant_id in (${quote(aId)},${quote(bId)});
   insert into public.table_fusion_links(table_a,table_b,restaurant_id) values
    (least(${quote(ownTables[4])}::uuid,${quote(ownTables[5])}::uuid),greatest(${quote(ownTables[4])}::uuid,${quote(ownTables[5])}::uuid),${quote(aId)});
   select set_config('request.jwt.claim.sub',${quote(foreign.userId)},true);
   insert into public.table_fusion_links(table_a,table_b,restaurant_id) values
    (least(${quote(otherTables[0])}::uuid,${quote(otherTables[1])}::uuid),greatest(${quote(otherTables[0])}::uuid,${quote(otherTables[1])}::uuid),${quote(bId)});commit;`);
  const initial=slot(0),aReservation=randomUUID(),bReservation=randomUUID();reservationIds.add(aReservation);reservationIds.add(bReservation);
  await db(`insert into public.reservations(id,guest_name,party_size,starts_at,ends_at,notes,restaurant_id) values
   (${quote(aReservation)},${quote(tag+'-seed-A')},2,${quote(initial.start)},${quote(initial.end)},'[RESTOMANAGER:EXTERIEUR]',${quote(aId)}),
   (${quote(bReservation)},${quote(tag+'-seed-B')},2,${quote(initial.start)},${quote(initial.end)},'[RESTOMANAGER:EXTERIEUR]',${quote(bId)});
   insert into public.reservation_tables(reservation_id,table_id,restaurant_id) values (${quote(aReservation)},${quote(ownTables[0])},${quote(aId)}),(${quote(bReservation)},${quote(otherTables[0])},${quote(bId)});
   insert into public.table_holds(table_id,held_by,starts_at,ends_at,expires_at,restaurant_id,draft_role,owner_token) values
    (${quote(ownTables[7])},${quote(admin.userId)},${quote(initial.start)},${quote(initial.end)},clock_timestamp()+interval '3 minutes',${quote(aId)},'fb_admin',gen_random_uuid()),
    (${quote(otherTables[2])},${quote(foreign.userId)},${quote(initial.start)},${quote(initial.end)},clock_timestamp()+interval '3 minutes',${quote(bId)},'fb_admin',gen_random_uuid());`);

  await test('Real Auth sessions identify all four tenant/role accounts',async()=>{
   for(const a of clients){const data=success(await a.client.auth.getUser(),'Auth getUser');assert.ok(data.user?.id===a.userId,'Auth identity must match the provisioned account');const profile=success(await a.client.from('staff_profiles').select('role,restaurant_id,active').eq('user_id',a.userId).single(),'Own staff profile');assert.ok(profile.role===a.role&&profile.restaurant_id===a.restaurantId&&profile.active,'Profile must match tenant and role');}
  });
  const collections=['reservations','reservation_tables','restaurant_rooms','restaurant_tables','table_holds','table_fusion_links','restaurant_hours'];
  const readableHoldColumns='id,table_id,draft_role,held_by,starts_at,ends_at,expires_at,created_at';
  for(const collection of collections)await test('Authenticated REST RLS isolates '+collection+' in both tenants and roles',async()=>{
   for(const a of clients){
    const other=a.restaurantId===aId?bId:aId;
    if(collection==='table_holds'){
     // Holds deliberately expose neither tenant IDs nor the session owner token.
     // Validate membership against the separately authorized table collection.
     const visibleTables=success(await a.client.from('restaurant_tables').select('id'),'Own table identifiers');
     const ownIds=new Set(visibleTables.map(t=>t.id));
     const data=success(await a.client.from(collection).select(readableHoldColumns),'Tenant hold read');
     assert.ok(data.length>0,'Populated own holds must be readable');assert.ok(data.every(h=>ownIds.has(h.table_id)),'Every hold must reference a visible own-tenant table');
     const foreignIds=a.restaurantId===aId?otherTables:ownTables;
     const hidden=success(await a.client.from(collection).select(readableHoldColumns).in('table_id',foreignIds),'Cross tenant hold read');assert.ok(hidden.length===0,'Foreign table holds must be hidden');
    }else{
     const data=success(await a.client.from(collection).select('*'),'Tenant collection read');assert.ok(data.length>0,'Populated own collection must be readable');assert.ok(data.every(r=>r.restaurant_id===a.restaurantId),'Every returned row must belong to this tenant');const hidden=success(await a.client.from(collection).select('*').eq('restaurant_id',other),'Cross tenant collection read');assert.ok(hidden.length===0,'Explicit foreign tenant query must return no rows');
    }
   }
  });
  await test('Hold REST column permissions hide owner tokens and tenant IDs',async()=>{
   for(const a of clients)for(const column of ['owner_token','restaurant_id'])rejection(await a.client.from('table_holds').select(column),['42501'],'Private hold column read');
  });
  await test('Anonymous REST and protected RPC reveal no restaurant data',async()=>{
   for(const collection of collections){const result=await anon.from(collection).select('*');assert.ok(result.error||result.data?.length===0,'Anonymous collection must be empty or forbidden');}
   rejection(await anon.rpc('service_sync_state_v1'),['42501','PGRST301'],'Anonymous sync');
   rejection(await anon.rpc('booking_draft_status_v1',{p_key:randomUUID()}),['42501','PGRST301'],'Anonymous draft recovery');
  });
  await test('Restaurant and Reception mutation permissions are enforced over HTTP',async()=>{
   rejection(await rpc(reception,'update_restaurant_table_v3',{p_table_id:ownTables[0],p_label:'Table 810001',p_seats:2,p_room_id:rooms[0]}),['42501'],'Reception table configuration');
   rejection(await rpc(reception,'set_restaurant_table_active_v3',{p_table_id:ownTables[0],p_active:false}),['42501'],'Reception table deactivate');
   rejection(await rpc(reception,'change_fusion_link_v3',{p_old:null,p_new:[ownTables[0],ownTables[1]]}),['42501'],'Reception fusion');
   const record=await row(admin,aReservation);
   rejection(await rpc(reception,'update_reservation_v4',editArgs(record,[ownTables[0]])),['42501'],'Reception Restaurant editor');
   rejection(await rpc(admin,'reception_update_reservation_v4',receptionArgs(record)),['42501'],'Restaurant Reception editor');
   rejection(await rpc(reception,'change_reservation_status_v3',{p_reservation_id:aReservation,p_expected:'reserved',p_status:'seated'}),['42501'],'Reception installation');
   success(await rpc(reception,'change_reservation_status_v3',{p_reservation_id:aReservation,p_expected:'reserved',p_status:'confirmed'}),'Reception confirmation');
  });
  await test('Authenticated direct table/fusion writes cannot bypass protected RPC',async()=>{
   for(const a of [admin,reception]){
    rejection(await a.client.from('restaurant_tables').update({seats:1}).eq('id',ownTables[0]).select('id'),['42501'],'Direct table PATCH');
    rejection(await a.client.from('table_fusion_links').insert({table_a:[ownTables[0],ownTables[1]].sort()[0],table_b:[ownTables[0],ownTables[1]].sort()[1],restaurant_id:aId}),['42501'],'Direct fusion POST');
   }
   const data=success(await admin.client.from('restaurant_tables').select('seats').eq('id',ownTables[0]).single(),'Table guard verify');assert.ok(data.seats===2,'Rejected PATCH must preserve capacity');
  });
  await test('Foreign reservation mutation and foreign table attribution are refused by RPC',async()=>{
   const b=await row(foreign,bReservation);
   rejection(await rpc(admin,'update_reservation_v4',editArgs(b,[otherTables[0]])),['P0002','42501'],'Foreign reservation update');
   rejection(await rpc(admin,'cancel_reservation_v3',{p_reservation_id:bReservation}),['P0002','42501'],'Foreign reservation cancel');
   const a=await row(admin,aReservation);
   rejection(await rpc(admin,'update_reservation_v4',editArgs(a,[otherTables[0]])),['22023','42501'],'Foreign table attribution');
   const after=await row(foreign,bReservation);assert.ok(after.edit_version===b.edit_version&&after.status===b.status,'Foreign data must remain unchanged');
  });
  await test('HTTP stale editor is rejected RM001 and preserves allergy, notes and edited hotel room',async()=>{
   const created=await create(admin,[ownTables[0]],slot(1),{p_room:'API301',p_notes:'Note fictive\nALLERGIES À VÉRIFIER : Noix\n[RESTOMANAGER:HOTEL]'});
   const before=await row(admin,created.booking),receptionBefore=await row(reception,created.booking);
   const updatedNotes='Note fictive actualisée\nALLERGIES À VÉRIFIER : Arachide\n[RESTOMANAGER:HOTEL]';
   success(await rpc(admin,'update_reservation_v4',editArgs(before,[ownTables[0]],{p_hotel_room:'API302',p_notes:updatedNotes})),'Restaurant edit');
   rejection(await rpc(reception,'reception_update_reservation_v4',receptionArgs(receptionBefore,{p_guest_name:tag+'-stale'})),['RM001'],'Stale Reception edit');
   const after=await row(admin,created.booking);assert.ok(after.hotel_room==='API302','Edited room must persist');assert.ok(after.notes===updatedNotes,'New allergy and note must persist');assert.ok(after.guest_name===before.guest_name,'Stale name must not overwrite record');assert.ok(after.edit_version!==before.edit_version,'Version must change');
   success(await rpc(reception,'reception_update_reservation_v4',receptionArgs(after,{p_hotel_room:'API303'})),'Reception fresh edit');
   const final=await row(admin,created.booking);assert.ok(final.hotel_room==='API303'&&final.notes===updatedNotes,'Fresh Reception edit must preserve notes and save room');
  });
  await test('Hotel creation rejects an empty room and rolls back while preserving the hold',async()=>{
   const draft=await hold(admin,[ownTables[0]],slot(2));
   rejection(await rpc(admin,'booking_draft_v3',{p_key:draft.key,p_action:'confirm',p_name:tag+'-empty-hotel',p_room:'',p_notes:'[RESTOMANAGER:HOTEL]'}),['22023'],'Hotel room required');
   const state=success(await rpc(admin,'booking_draft_status_v1',{p_key:draft.key}),'Draft state after invalid input');assert.ok(state.state==='pending','Rejected confirmation must not commit or abandon a valid hold');
   await confirm(admin,draft.key,{p_room:'API304',p_notes:'[RESTOMANAGER:HOTEL]'});
  });
  await test('Duplicate hotel room conflicts across different tables without partial creation',async()=>{
   const when=slot(3);await create(admin,[ownTables[0]],when,{p_room:'API305',p_notes:'[RESTOMANAGER:HOTEL]'});
   const draft=await hold(admin,[ownTables[1]],when);
   rejection(await rpc(admin,'booking_draft_v3',{p_key:draft.key,p_action:'confirm',p_name:tag+'-duplicate-room',p_room:'API305',p_notes:'[RESTOMANAGER:HOTEL]'}),['23P01'],'Duplicate hotel room');
   const count=await db(`select count(*) from public.reservations where restaurant_id=${quote(aId)} and hotel_room='API305' and starts_at=${quote(when.start)};`);assert.ok(count==='1','Room conflict must leave exactly the original booking');
   success(await rpc(admin,'booking_draft_v3',{p_key:draft.key,p_action:'release'}),'Release failed room booking');
  });
  await test('Numeric exterior clients remain roomless through real create and Reception edit',async()=>{
   const created=await create(admin,[ownTables[0]],slot(4),{p_name:'755',p_room:null,p_notes:'Extérieur fictif\nALLERGIES À VÉRIFIER : Lait\n[RESTOMANAGER:EXTERIEUR]'});
   const before=await row(reception,created.booking);assert.ok(before.hotel_room===null,'Numeric exterior name must not become a room');
   success(await rpc(reception,'reception_update_reservation_v4',receptionArgs(before,{p_guest_name:'756'})),'Exterior Reception edit');
   const after=await row(admin,created.booking);assert.ok(after.hotel_room===null&&after.notes===before.notes,'Exterior classification and allergy must persist');
  });
  await test('Simultaneous HTTP holds for the same table have exactly one winner',async()=>{
   const when=slot(5),left=randomUUID(),right=randomUUID();keys.add(left);keys.add(right);
   const actors=[admin,peerAdmin];
   const attempts=await Promise.all([left,right].map((key,i)=>rpc(actors[i],'booking_draft_v3',{p_key:key,p_action:'hold',p_start:when.start,p_end:when.end,p_guests:2,p_tables:[ownTables[0]]})));
   assert.ok(attempts.filter(r=>!r.error).length===1,'Exactly one same-table hold must succeed');
   const winnerIndex=attempts[0].error?1:0,winner=[left,right][winnerIndex];rejection(attempts.find(r=>r.error),['23P01','22023'],'Second same-table hold');
   await confirm(actors[winnerIndex],winner);
   const count=await db(`select count(*) from public.reservation_tables a join public.reservations r on r.id=a.reservation_id where a.table_id=${quote(ownTables[0])} and r.starts_at=${quote(when.start)} and r.status='reserved';`);assert.ok(count==='1','Exactly one assignment must exist');
  });
  await test('Simultaneous HTTP confirmations on different tables both commit',async()=>{
   const when=slot(6),actors=[admin,peerAdmin];const drafts=await Promise.all([hold(admin,[ownTables[0]],when),hold(peerAdmin,[ownTables[1]],when)]);
   const committed=await Promise.all(drafts.map((d,i)=>confirm(actors[i],d.key)));assert.ok(committed[0].booking!==committed[1].booking,'Different-table bookings must have distinct IDs');
   const count=await db(`select count(*) from public.reservation_tables a join public.reservations r on r.id=a.reservation_id where a.table_id=any(${uuidArray(ownTables.slice(0,2))}) and r.starts_at=${quote(when.start)} and r.status='reserved';`);assert.ok(count==='2','Both different-table bookings must be assigned');
  });
  await test('Restaurant and Reception create concurrently without incompatible table assignments',async()=>{
   // Establish the explicit Restaurant hold before asking auto-allocation. Racing
   // these two acquisitions would legitimately let Reception take that table.
   // The independent role clients then commit their actual creations together.
   const when=slot(7);const drafts=[await hold(admin,[ownTables[0]],when),await hold(reception,null,when)];
   const committed=await Promise.all([confirm(admin,drafts[0].key),confirm(reception,drafts[1].key)]);
   assert.ok(committed[0].tables.every(t=>!committed[1].tables.includes(t)),'Reception must choose a table outside the Restaurant hold');
  });
  await test('Restaurant and Reception racing for the only compatible table have one winner',async()=>{
   // Only this fixture can seat 50: original seed tables seat six and all
   // enabled fusion sets contain at most three small tables. No shared fixture
   // needs deactivation just to force the allocator into a contested choice.
   const when=slot(15),draftKeys=[randomUUID(),randomUUID()],actors=[admin,reception];
   draftKeys.forEach(key=>keys.add(key));
   const attempts=await Promise.all(actors.map((a,i)=>rpc(a,'booking_draft_v3',{p_key:draftKeys[i],p_action:'hold',p_start:when.start,p_end:when.end,p_guests:50,p_tables:i===0?[ownTables[8]]:null})));
   assert.ok(attempts.filter(r=>!r.error).length===1,'Exactly one role may hold the only compatible table');
   const winner=attempts[0].error?1:0;rejection(attempts[1-winner],['23P01','22023'],'Other role contested allocation');
   await confirm(actors[winner],draftKeys[winner]);
   const count=await db(`select count(*) from public.reservation_tables a join public.reservations r on r.id=a.reservation_id where a.table_id=${quote(ownTables[8])} and r.starts_at=${quote(when.start)} and r.status='reserved';`);assert.ok(count==='1','The contested auto-allocation must create one compatible assignment');
  });
  await test('Draft ownership, abandon and forced expiry are enforced by real RPC',async()=>{
   const when=slot(8),draft=await hold(admin,[ownTables[0]],when);
   const hidden=success(await rpc(reception,'booking_draft_status_v1',{p_key:draft.key}),'Other staff draft status');assert.ok(hidden.state==='missing','Another account must not inspect the draft');
   const otherTenant=success(await rpc(foreign,'booking_draft_status_v1',{p_key:draft.key}),'Foreign tenant draft status');assert.ok(otherTenant.state==='missing','Another tenant must not inspect the draft');
   rejection(await rpc(reception,'booking_draft_v3',{p_key:draft.key,p_action:'release'}),['42501'],'Other staff release');
   success(await rpc(admin,'booking_draft_v3',{p_key:draft.key,p_action:'release'}),'Owner abandon');
   const missing=success(await rpc(admin,'booking_draft_status_v1',{p_key:draft.key}),'Abandoned draft status');assert.ok(missing.state==='missing','Abandoned draft must be gone');
   const expired=await hold(admin,[ownTables[0]],when);
   await db(`update public.table_holds set expires_at=clock_timestamp()-interval '1 second' where owner_token=(select lock_token from private.booking_drafts_v3 where key=${quote(expired.key)});update private.booking_drafts_v3 set expires=clock_timestamp()-interval '1 second' where key=${quote(expired.key)};`);
   const state=success(await rpc(admin,'booking_draft_status_v1',{p_key:expired.key}),'Expired draft state');assert.ok(state.state==='expired','Server clock must govern expiration');
   rejection(await rpc(admin,'booking_draft_v3',{p_key:expired.key,p_action:'confirm',p_name:tag+'-expired',p_room:null,p_notes:'[RESTOMANAGER:EXTERIEUR]'}),['23P01','22023'],'Expired confirmation');
   const replacement=await hold(admin,[ownTables[0]],when);await confirm(admin,replacement.key);
  });
  await test('Repeated confirm key returns one persisted booking after release and expiry',async()=>{
   const draft=await hold(admin,[ownTables[0]],slot(9));const first=await confirm(admin,draft.key);
   const repeats=await Promise.all([confirm(admin,draft.key),confirm(admin,draft.key)]);assert.ok(repeats.every(r=>r.booking===first.booking),'All repeated keys must return the original booking');
   success(await rpc(admin,'booking_draft_v3',{p_key:draft.key,p_action:'release'}),'Release committed draft');
   await db(`update private.booking_drafts_v3 set expires=clock_timestamp()-interval '2 days' where key=${quote(draft.key)};`);
   const state=success(await rpc(admin,'booking_draft_status_v1',{p_key:draft.key}),'Committed recovery after expiry');assert.ok(state.state==='committed'&&state.reservation_id===first.booking,'Committed identity must survive hold expiry');
   const again=await confirm(admin,draft.key);assert.ok(again.booking===first.booking,'Committed replay after expiry must remain idempotent');
  });
  await test('Committed HTTP response deliberately lost is recovered by original key without duplicate',async()=>{
   let lose=false;
   retryClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,options)=>{
    const response=await fetch(input,options);
    const action=options?.body&&typeof options.body==='string'?JSON.parse(options.body).p_action:null;
    const resource=typeof input==='string'?input:input?.url||String(input);
    if(lose&&resource.includes('/rpc/booking_draft_v3')&&action==='confirm'&&response.ok){lose=false;await response.arrayBuffer();throw new TypeError('Deliberately discarded local integration response');}
    return response;
   }}});
   success(await retryClient.auth.signInWithPassword({email:admin.email,password:admin.password}),'Independent retry Auth session');
   const retryAccount={...admin,client:retryClient},draft=await hold(retryAccount,[ownTables[0]],slot(10));
   lose=true;const lost=await rpc(retryAccount,'booking_draft_v3',{p_key:draft.key,p_action:'confirm',p_name:tag+'-lost-response',p_room:null,p_notes:'[RESTOMANAGER:EXTERIEUR]'});assert.ok(lost.error,'Caller must observe the deliberately lost HTTP response');
   const recovered=success(await rpc(admin,'booking_draft_status_v1',{p_key:draft.key}),'Recover original send key');assert.ok(recovered.state==='committed'&&recovered.reservation_id,'Server must report the committed booking');reservationIds.add(recovered.reservation_id);
   const replay=await confirm(admin,draft.key);assert.ok(replay.booking===recovered.reservation_id,'Replay must resolve to the same booking');
   const count=await db(`select count(*) from public.reservations where guest_name=${quote(tag+'-lost-response')};`);assert.ok(count==='1','A lost HTTP response must not create duplicate bookings');
  });
  await test('Concurrent edit and cancellation cannot reactivate or partially overwrite a reservation',async()=>{
   const created=await create(admin,[ownTables[0]],slot(11));const before=await row(admin,created.booking);
   const [edited,cancelled]=await Promise.all([rpc(admin,'update_reservation_v4',editArgs(before,[ownTables[0]],{p_notes:'Note fictive concurrente\nALLERGIES À VÉRIFIER : Noix\n[RESTOMANAGER:EXTERIEUR]'})),rpc(reception,'cancel_reservation_v3',{p_reservation_id:created.booking})]);
   success(cancelled,'Concurrent cancel');if(edited.error)rejection(edited,['RM001','22023'],'Cancelled stale edit');
   const after=await row(admin,created.booking);assert.ok(after.status==='cancelled','Final status must remain cancelled');assert.ok(after.edit_version!==before.edit_version,'Cancellation/edit must invalidate the original version');
   rejection(await rpc(admin,'update_reservation_v4',editArgs(before,[ownTables[0]])),['RM001'],'Original editor after cancellation');
  });
  await test('Two and three table fusions commit complete atomic assignments',async()=>{
   success(await rpc(admin,'change_fusion_link_v3',{p_old:null,p_new:[ownTables[5],ownTables[6]]}),'Create third-table fusion link');
   const pair=await create(admin,ownTables.slice(4,6),slot(12),{},4),triple=await create(admin,ownTables.slice(4,7),slot(13),{},6);
   for(const [booking,count] of [[pair,2],[triple,3]]){
    const assignments=success(await admin.client.from('reservation_tables').select('table_id').eq('reservation_id',booking.booking),'Fusion assignments');assert.ok(assignments.length===count&&new Set(assignments.map(a=>a.table_id)).size===count,'Every fusion table must be assigned exactly once');
   }
   const collision=randomUUID();keys.add(collision);rejection(await rpc(admin,'booking_draft_v3',{p_key:collision,p_action:'hold',p_start:slot(13).start,p_end:slot(13).end,p_guests:2,p_tables:[ownTables[5]]}),['23P01','22023'],'Hold on fused occupied table');
  });
  await test('Service revision handshake reflects successful mutations and preserves tenant scope',async()=>{
   const before=success(await rpc(admin,'service_sync_state_v1'),'Sync state before mutation');
   assert.ok(typeof before.revision==='string'&&before.capabilities?.reservation_edits===4&&before.capabilities?.booking_recovery===1,'Server must expose required capabilities');
   const otherBefore=success(await rpc(foreign,'service_sync_state_v1'),'Foreign sync before');
   await create(admin,[ownTables[0]],slot(14));
   const after=success(await rpc(admin,'service_sync_state_v1'),'Sync state after mutation'),otherAfter=success(await rpc(foreign,'service_sync_state_v1'),'Foreign sync after');
   assert.ok(after.revision!==before.revision,'Own tenant revision must change after commit');assert.ok(otherAfter.revision===otherBefore.revision,'Unrelated tenant revision must remain unchanged');
  });
  await test('Final local invariants contain no incompatible overlap or orphan assignment',async()=>{
   const count=await db(`select count(*) from public.reservation_tables a join public.reservations r on r.id=a.reservation_id join public.reservation_tables b on b.table_id=a.table_id and b.reservation_id>a.reservation_id join public.reservations s on s.id=b.reservation_id where a.table_id=any(${uuidArray(ownTables.concat(otherTables))}) and r.status in ('reserved','confirmed','late','arrived','seated') and s.status in ('reserved','confirmed','late','arrived','seated') and r.starts_at<s.ends_at and s.starts_at<r.ends_at;`);assert.ok(count==='0','Integration scenario set must leave no overlapping active assignment');
   const orphans=await db(`select count(*) from public.reservation_tables a left join public.reservations r on r.id=a.reservation_id left join public.restaurant_tables t on t.id=a.table_id where (r.id is null or t.id is null);`);assert.ok(orphans==='0','No orphan assignment may exist');
  });
 }catch(error){
  recordFailure('Local API fixture setup or unhandled suite operation',error);
 }finally{
  // No session material or row content is logged by cleanup.
  try{
   await retryClient?.auth.signOut({scope:'local'});
   await db(`delete from private.booking_drafts_v3 where key=any(${uuidArray([...keys])});delete from public.table_holds where table_id=any(${uuidArray(ownTables.concat(otherTables))});delete from public.reservations where id=any(${uuidArray([...reservationIds])}) or guest_name like ${quote(tag+'%')};delete from public.table_fusion_links where table_a=any(${uuidArray(ownTables.concat(otherTables))}) or table_b=any(${uuidArray(ownTables.concat(otherTables))});delete from public.restaurant_tables where id=any(${uuidArray(ownTables.concat(otherTables))});delete from public.restaurant_rooms where id=any(${uuidArray(rooms)});`);
  }catch(error){recordFailure('Local API fixture cleanup',error);}
  try{
   for(const h of originalHours)await db(`update public.restaurant_hours set lunch_enabled=${h.lunch_enabled},lunch_start=${quote(h.lunch_start)},lunch_end=${quote(h.lunch_end)},dinner_enabled=${h.dinner_enabled},dinner_start=${quote(h.dinner_start)},dinner_end=${quote(h.dinner_end)} where restaurant_id=${quote(h.restaurant_id)} and id=${Number(h.id)};`);
  }catch(error){recordFailure('Restore local restaurant hours',error);}
  persist();
 }
 const passed=results.filter(r=>r.status==='passed').length,failed=results.length-passed;
 if(failed){const error=Error('Supabase API integration failed: '+results.filter(r=>r.status==='failed').map(r=>r.name+' ['+r.code+'] '+r.message).join('; '));error.results=results;error.passed=passed;throw error;}
 return {passed,failed,results};
}

module.exports={run};
