'use strict';
// RM-AUDIT-02 phase 2 — simulated dinner service on the disposable local Supabase stack.
// Fictitious establishment C: 15 tables / 54 seats, real Auth accounts (Restaurant + Reception),
// real PostgREST RPCs and real Realtime. Loopback only, no hosted URL, no client data, no secrets
// logged. Every step records PASS/FAIL with a fixed label; unknown contracts are OBSERVATIONS.
const {randomUUID}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const nodeAssert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const C='10000000-0000-4000-8000-000000000003';
const LAYOUT=[...Array(6).fill(2),...Array(6).fill(4),...Array(3).fill(6)]; // 54 seats
const ACTIVE=['reserved','confirmed','late','arrived','seated'];

async function run({url,anonKey,accounts,sql,day,admin,assert=nodeAssert}){
 const endpoint=new URL(url);
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname),'Service simulation requires a loopback Supabase URL');
 assert.ok(admin&&typeof sql==='function'&&/^\d{4}-\d{2}-\d{2}$/.test(day),'Local admin client, SQL fixture and future date are required');
 const tag='SIM-'+randomUUID().slice(0,8);
 const results=[],observations=[],latencies=[];
 const artifactDirectory=process.env.MISSION3_ARTIFACTS;
 const persist=()=>{if(!artifactDirectory)return;fs.mkdirSync(artifactDirectory,{recursive:true,mode:0o700});fs.writeFileSync(path.join(artifactDirectory,'service-simulation-results.json'),JSON.stringify(summary(),null,2),{mode:0o600});};
 const safeCode=r=>String(r?.error?.code||r?.code||r?.status||'UNKNOWN').replace(/[^A-Za-z0-9_-]/g,'').slice(0,30);
 const pass=(name,detail)=>{results.push({name,status:'passed',...(detail?{detail}:{})});persist();console.log('PASS SIM '+name+(detail?' — '+JSON.stringify(detail):''));};
 const fail=(name,error)=>{const message=error?.name==='AssertionError'?String(error.message||'').split('\n')[0].slice(0,220):'Unexpected failure ('+safeCode(error)+')';results.push({name,status:'failed',message});persist();console.log('FAIL SIM '+name+' — '+message);};
 const observe=(name,detail)=>{observations.push({name,...detail});persist();console.log('OBS SIM '+name+' — '+JSON.stringify(detail));};
 async function step(name,fn){try{const detail=await fn();pass(name,detail);}catch(error){fail(name,error);}}
 function summary(){const passed=results.filter(r=>r.status==='passed').length;return {scenario:'RM-AUDIT-02 service-simulation 54 places',establishment:'fictitious C',passed,failed:results.length-passed,results,observations,propagationMs:stats(latencies)};}
 function stats(values){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b);return {count:s.length,median:s[Math.floor(s.length/2)],max:s[s.length-1]};}
 const quote=v=>v==null?'null':"'"+String(v).replaceAll("'","''")+"'";
 async function db(query){const r=await sql(query);if(typeof r==='string')return r.trim();assert.ok(r&&(!('code' in r)||r.code===0),'Local SQL fixture operation failed');return String(r.stdout??r.output??'').trim();}
 function paris(offsetDays,hm){
  const base=new Date(day+'T12:00:00.000Z');base.setUTCDate(base.getUTCDate()+offsetDays);
  const guess=new Date(base.toISOString().slice(0,10)+'T'+hm+':00.000Z');
  const z=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',timeZoneName:'shortOffset',hour:'2-digit'}).formatToParts(guess).find(p=>p.type==='timeZoneName').value;
  const m=/GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?/.exec(z);const minutes=m&&m[1]?(m[1]==='+'?1:-1)*(Number(m[2])*60+Number(m[3]||0)):0;
  return new Date(guess.getTime()-minutes*60000);
 }
 const slot=(offsetDays,hm,minutes=90)=>{const s=paris(offsetDays,hm);return {start:s.toISOString(),end:new Date(s.getTime()+minutes*60000).toISOString()};};
 const rpc=(client,name,args={})=>client.rpc(name,args);
 const ok=(r,label)=>{assert.ok(!r.error,label+' failed ('+safeCode(r)+')');return r.data;};
 const keys=[];
 async function hold(client,when,guests,tables=null){const key=randomUUID();keys.push(key);const r=await rpc(client,'booking_draft_v3',{p_key:key,p_action:'hold',p_start:when.start,p_end:when.end,p_guests:guests,p_tables:tables});return {key,r};}
 async function book(client,when,guests,{hotel=false,room=null,label}){
  const h=await hold(client,when,guests);if(h.r.error)return {error:h.r.error};
  const r=await rpc(client,'booking_draft_v3',{p_key:h.key,p_action:'confirm',p_name:tag+'-'+label,p_room:hotel?room:null,p_notes:hotel?'[RESTOMANAGER:HOTEL]':'[RESTOMANAGER:EXTERIEUR]'});
  if(r.error){await rpc(client,'booking_draft_v3',{p_key:h.key,p_action:'release'});return {error:r.error};}
  return {id:r.data?.booking,tables:h.r.data?.tables||[]};
 }
 const tableIds=LAYOUT.map(()=>randomUUID()),roomId=randomUUID();
 const seatsOf=Object.fromEntries(tableIds.map((id,i)=>[id,LAYOUT[i]]));
 let restaurant,reception,channels=[];
 try{
  // ---------- Fixture: fictitious establishment C (local SQL fixture layer only) ----------
  const created=[];
  for(const [role,email] of [['fb_admin','service-sim-fb@accounts.restomanager.example.com'],['reception','service-sim-reception@accounts.restomanager.example.com']]){
   const password=randomUUID()+randomUUID();const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ok(!error,'Fictitious account creation failed');created.push({role,email,password,userId:data.user.id});
  }
  await db(`insert into public.restaurants(id,name) values(${quote(C)},'Restaurant fictif C — 54 places');`);
  await db(`insert into public.staff_profiles(user_id,role,display_name,restaurant_id,active) values ${created.map(a=>`(${quote(a.userId)},${quote(a.role)},${quote('Simulation '+a.role)},${quote(C)},true)`).join(',')};`);
  await db(`do $$begin update public.restaurant_hours set lunch_enabled=true,lunch_start='12:00',lunch_end='14:30',dinner_enabled=true,dinner_start='19:00',dinner_end='21:30',duration=90 where restaurant_id=${quote(C)};
   if not found then insert into public.restaurant_hours(restaurant_id,id,lunch_enabled,lunch_start,lunch_end,dinner_enabled,dinner_start,dinner_end,duration) values (${quote(C)},1,true,'12:00','14:30',true,'19:00','21:30',90);end if;end$$;`);
  await db(`begin;select set_config('request.jwt.claim.sub',${quote(created[0].userId)},true);
   insert into public.restaurant_rooms(id,name,restaurant_id) values (${quote(roomId)},'Salle simulation',${quote(C)});
   insert into public.restaurant_tables(id,room_id,label,seats,restaurant_id) values ${tableIds.map((id,i)=>`(${quote(id)},${quote(roomId)},'Table ${3001+i}',${LAYOUT[i]},${quote(C)})`).join(',')};commit;`);
  const signIn=async a=>{const client=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});const {error}=await client.auth.signInWithPassword({email:a.email,password:a.password});assert.ok(!error,'Fictitious sign-in failed');return {...a,client};};
  restaurant=await signIn(created[0]);reception=await signIn(created[1]);
  for(const a of [restaurant,reception]){
   let ready=false;for(let i=0;i<30&&!ready;i++){const r=await rpc(a.client,'service_sync_state_v1');ready=!r.error&&r.data?.capabilities?.reservation_edits===4;if(!ready)await new Promise(res=>setTimeout(res,500));}
   assert.ok(ready,'Service capabilities must be ready for '+a.role);
  }
  pass('S0 Fixture: fictitious establishment C, 15 tables / 54 seats, Restaurant + Reception signed in',{tables:LAYOUT.length,seats:LAYOUT.reduce((s,n)=>s+n,0)});

  // ---------- S1 Realtime: each role listens to the other's changes ----------
  const seen=new Map(); // reservation id -> {at, by}
  function listen(account,label){
   return new Promise(resolve=>{
    const channel=account.client.channel(tag+'-'+label).on('postgres_changes',{event:'*',schema:'public',table:'reservations',filter:'restaurant_id=eq.'+C},payload=>{const id=payload?.new?.id||payload?.old?.id;if(id&&!seen.has(label+':'+id))seen.set(label+':'+id,Date.now());});
    channels.push({account,channel});let settled=false;
    channel.subscribe(status=>{if(!settled&&status==='SUBSCRIBED'){settled=true;resolve(true);}if(!settled&&['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){settled=true;resolve(false);}});
    setTimeout(()=>{if(!settled){settled=true;resolve(false);}},20000);
   });
  }
  let realtime=false;
  await step('S1 Realtime: Restaurant and Reception sessions subscribe to their establishment',async()=>{
   const [a,b]=await Promise.all([listen(restaurant,'restaurant'),listen(reception,'reception')]);
   assert.ok(a&&b,'Both Realtime subscriptions must reach SUBSCRIBED');realtime=true;
  });
  const waitSeen=async(label,id,timeout=15000)=>{const t=Date.now();while(Date.now()-t<timeout){if(seen.has(label+':'+id))return seen.get(label+':'+id);await new Promise(r=>setTimeout(r,100));}return null;};

  // ---------- S2 Fill the 19:00 wave to 54 seats, then a 20:45 wave ----------
  const D=10;const waveA=slot(D,'19:00'),waveB=slot(D,'20:45');
  const bookings=[];let roomNo=500;
  async function wave(when,sizes,prefix){
   let n=0;
   for(const guests of sizes){
    n++;const byReception=n%2===0;const who=byReception?reception:restaurant;const hotel=byReception;
    const t0=Date.now();const b=await book(who.client,when,guests,{hotel,room:hotel?String(++roomNo):null,label:prefix+n});
    if(b.error){bookings.push({wave:prefix,guests,by:who.role,error:safeCode(b)});continue;}
    bookings.push({wave:prefix,guests,by:who.role,id:b.id,tables:b.tables});
    if(realtime){const other=byReception?'restaurant':'reception';const at=await waitSeen(other,b.id);if(at)latencies.push(Math.max(0,at-t0));else latencies.push(null);}
   }
  }
  await step('S2a 19:00 wave: 15 bookings fill exactly 54 seats (Restaurant exterior / Reception hotel alternately)',async()=>{
   await wave(waveA,[6,6,6,4,4,4,4,4,4,2,2,2,2,2,2],'A');
   const okA=bookings.filter(b=>b.wave==='A'&&b.id);const covers=okA.reduce((s,b)=>s+b.guests,0);
   assert.equal(okA.length,15,'All 15 bookings of the 19:00 wave must be confirmed (refused: '+JSON.stringify(bookings.filter(b=>b.wave==='A'&&b.error).map(b=>b.error))+')');
   assert.equal(covers,54,'The 19:00 wave must hold 54 covers');
   return {bookings:okA.length,covers};
  });
  await step('S2b 20:45 wave: 9 further bookings on released capacity (24 bookings in total)',async()=>{
   await wave(waveB,[6,4,4,4,2,2,2,2,2],'B');
   const okB=bookings.filter(b=>b.wave==='B'&&b.id);
   assert.equal(okB.length,9,'All 9 bookings of the 20:45 wave must be confirmed (refused: '+JSON.stringify(bookings.filter(b=>b.wave==='B'&&b.error).map(b=>b.error))+')');
   return {bookings:bookings.filter(b=>b.id).length,covers:bookings.filter(b=>b.id).reduce((s,b)=>s+b.guests,0)};
  });
  await step('S2c Propagation: every booking reaches the other role through Realtime within 15 s',async()=>{
   assert.ok(realtime,'Realtime subscriptions unavailable');
   const missing=latencies.filter(v=>v===null).length;const measured=latencies.filter(v=>v!==null);latencies.length=0;latencies.push(...measured);
   assert.equal(missing,0,missing+' booking event(s) not received by the other role within 15 s');
   return stats(measured);
  });
  await step('S2d No table is assigned twice in the same interval and every assignment stays in establishment C',async()=>{
   const overlaps=await db(`select count(*) from public.reservation_tables a join public.reservations r on r.id=a.reservation_id join public.reservation_tables b on b.table_id=a.table_id and b.reservation_id>a.reservation_id join public.reservations s on s.id=b.reservation_id where r.restaurant_id=${quote(C)} and r.status in ('reserved','confirmed','late','arrived','seated') and s.status in ('reserved','confirmed','late','arrived','seated') and r.starts_at<s.ends_at and s.starts_at<r.ends_at;`);
   const foreign=await db(`select count(*) from public.reservation_tables a join public.restaurant_tables t on t.id=a.table_id join public.reservations r on r.id=a.reservation_id where r.restaurant_id=${quote(C)} and t.restaurant_id<>${quote(C)};`);
   assert.equal(overlaps,'0','No overlapping assignment on a table');assert.equal(foreign,'0','No assignment outside establishment C');
  });

  // ---------- S3 Peak ----------
  await step('S3 Peak 19:00-20:00 exceeds the 25-cover arrival threshold (45 % of 54) and is visible to both roles',async()=>{
   const peakStart=paris(D,'19:00').toISOString(),peakEnd=paris(D,'20:00').toISOString();
   const counts=[];
   for(const a of [restaurant,reception]){const r=await a.client.from('reservations').select('party_size').gte('starts_at',peakStart).lt('starts_at',peakEnd).in('status',ACTIVE);ok(r,'Peak read '+a.role);counts.push(r.data.reduce((s,x)=>s+x.party_size,0));}
   assert.equal(counts[0],counts[1],'Restaurant and Reception must read the same peak');assert.ok(counts[0]>25,'Peak must exceed 25 covers');
   return {peakCovers:counts[0],threshold:25};
  });

  // ---------- S4 Capacity, closed service, outside hours ----------
  await step('S4a Over-capacity: a 2-cover hold at 19:30 is refused while all 54 seats are taken',async()=>{
   const h=await hold(reception.client,slot(D,'19:30'),2);if(!h.r.error)await rpc(reception.client,'booking_draft_v3',{p_key:h.key,p_action:'release'});assert.ok(h.r.error,'Hold must be refused when no table is free');return {code:safeCode(h.r)};
  });
  await step('S4b Outside service hours: a 16:00 hold is refused',async()=>{
   const h=await hold(restaurant.client,slot(D,'16:00'),2);if(!h.r.error)await rpc(restaurant.client,'booking_draft_v3',{p_key:h.key,p_action:'release'});assert.ok(h.r.error,'Hold outside lunch/dinner must be refused');return {code:safeCode(h.r)};
  });
  await step('S4c Closed lunch: Restaurant closes lunch through the application path; a 12:30 hold is refused, then lunch reopens',async()=>{
   ok(await restaurant.client.from('restaurant_hours').update({lunch_enabled:false}).eq('id',1).select('id').single(),'Close lunch');
   const h=await hold(reception.client,slot(D+1,'12:30'),2);
   ok(await restaurant.client.from('restaurant_hours').update({lunch_enabled:true}).eq('id',1).select('id').single(),'Reopen lunch');
   if(!h.r.error)await rpc(reception.client,'booking_draft_v3',{p_key:h.key,p_action:'release'});
   assert.ok(h.r.error,'Hold on a closed lunch service must be refused');
   const again=await hold(reception.client,slot(D+1,'12:30'),2);assert.ok(!again.r.error,'Hold must succeed again once lunch reopens ('+safeCode(again.r)+')');
   await rpc(reception.client,'booking_draft_v3',{p_key:again.key,p_action:'release'});
   return {closedCode:safeCode(h.r)};
  });
  await step('S4d Reception cannot change opening hours',async()=>{
   const r=await reception.client.from('restaurant_hours').update({lunch_enabled:false}).eq('id',1).select('id');
   const unchanged=await db(`select lunch_enabled from public.restaurant_hours where restaurant_id=${quote(C)};`);
   if(unchanged!=='t')await db(`update public.restaurant_hours set lunch_enabled=true where restaurant_id=${quote(C)};`);
   assert.ok(r.error||(Array.isArray(r.data)&&r.data.length===0),'Reception hours update must be refused or affect no row');assert.equal(unchanged,'t','Lunch must remain open');
  });

  // ---------- S5 Disputed table ----------
  const extraIds=[];
  await step('S5 Restaurant and Reception race for the only free 6-seat table: exactly one wins',async()=>{
   // Two real 6-cover bookings occupy two of the three 6-seat tables (no fusion exists in C),
   // so a party of 6 has exactly one compatible table left.
   const when=slot(D+1,'19:00');
   for(const label of ['block-1','block-2']){const b=await book(restaurant.client,when,6,{label});assert.ok(!b.error,'Blocking booking failed ('+safeCode(b)+')');extraIds.push(b.id);}
   const used=new Set((await db(`select coalesce(string_agg(table_id::text,','),'') from public.reservation_tables where reservation_id in (${extraIds.map(quote).join(',')});`)).split(',').filter(Boolean));
   const lastSix=tableIds.find(id=>seatsOf[id]===6&&!used.has(id));assert.ok(lastSix,'One 6-seat table must remain free');
   const attempts=await Promise.all([hold(restaurant.client,when,6,[lastSix]),hold(reception.client,when,6)]);
   const winners=attempts.filter(a=>!a.r.error).length;
   await rpc(restaurant.client,'booking_draft_v3',{p_key:attempts[0].key,p_action:'release'});
   await rpc(reception.client,'booking_draft_v3',{p_key:attempts[1].key,p_action:'release'});
   assert.equal(winners,1,'Exactly one session may obtain the last 6-seat table');
   return {winner:attempts[0].r.error?'reception':'restaurant',loserCode:safeCode(attempts.find(a=>a.r.error)?.r)};
  });

  // ---------- S6 Service lifecycle ----------
  const waveAok=bookings.filter(b=>b.wave==='A'&&b.id);
  await step('S6a Reception confirms arrivals; Reception installation is refused (42501)',async()=>{
   for(const b of waveAok.slice(0,8))ok(await rpc(reception.client,'change_reservation_status_v3',{p_reservation_id:b.id,p_expected:'reserved',p_status:'confirmed'}),'Reception confirmation');
   const r=await rpc(reception.client,'change_reservation_status_v3',{p_reservation_id:waveAok[0].id,p_expected:'confirmed',p_status:'seated'});
   assert.ok(r.error&&r.error.code==='42501','Reception installation must be refused with 42501 ('+safeCode(r)+')');
   return {confirmed:8};
  });
  await step('S6b Restaurant installs, then releases tables; released 2-seat capacity is immediately bookable again',async()=>{
   const toSeat=waveAok.slice(0,8);for(const b of toSeat)ok(await rpc(restaurant.client,'change_reservation_status_v3',{p_reservation_id:b.id,p_expected:'confirmed',p_status:'seated'}),'Restaurant installation');
   const couple=waveAok.find(b=>b.guests===2);assert.ok(couple,'A 2-cover booking is required');
   ok(await rpc(restaurant.client,'change_reservation_status_v3',{p_reservation_id:couple.id,p_expected:'reserved',p_status:'confirmed'}),'Restaurant confirmation (couple)');
   ok(await rpc(restaurant.client,'change_reservation_status_v3',{p_reservation_id:couple.id,p_expected:'confirmed',p_status:'seated'}),'Restaurant installation (couple)');
   ok(await rpc(restaurant.client,'change_reservation_status_v3',{p_reservation_id:couple.id,p_expected:'seated',p_status:'released'}),'Restaurant release');
   // Same 19:00-20:30 interval as the full wave: only the released table can host the new couple.
   const h=await hold(reception.client,slot(D,'19:00'),2);const freed=!h.r.error;if(freed)await rpc(reception.client,'booking_draft_v3',{p_key:h.key,p_action:'release'});
   assert.ok(freed,'A released 2-seat table must accept a new 19:00 hold ('+safeCode(h.r)+')');
   return {seated:toSeat.length,released:1};
  });
  await step('S6c Reception sees the Restaurant installation through Realtime',async()=>{
   assert.ok(realtime,'Realtime subscriptions unavailable');
   const target=waveAok[11];
   ok(await rpc(restaurant.client,'change_reservation_status_v3',{p_reservation_id:target.id,p_expected:'reserved',p_status:'confirmed'}),'Restaurant confirmation');
   await new Promise(r=>setTimeout(r,1500));seen.delete('reception:'+target.id);
   const t0=Date.now();ok(await rpc(restaurant.client,'change_reservation_status_v3',{p_reservation_id:target.id,p_expected:'confirmed',p_status:'seated'}),'Restaurant installation');
   const at=await waitSeen('reception',target.id);assert.ok(at,'Reception must receive the installation event within 15 s');
   return {ms:Math.max(0,at-t0)};
  });
  await step('OBS S6d No-show on a confirmed booking (contract not specified for API)',async()=>{
   const target=waveAok[10];await rpc(restaurant.client,'change_reservation_status_v3',{p_reservation_id:target.id,p_expected:'reserved',p_status:'confirmed'});
   const r=await rpc(restaurant.client,'change_reservation_status_v3',{p_reservation_id:target.id,p_expected:'confirmed',p_status:'no_show'});
   observe('S6d no_show transition',{accepted:!r.error,code:r.error?safeCode(r):null});
  });

  // ---------- S8 Realtime loss and reconciliation ----------
  await step('S8 Reception loses Realtime, a booking happens meanwhile, the REST snapshot reconciles it and a new subscription receives the next change',async()=>{
   assert.ok(realtime,'Realtime subscriptions unavailable');
   const own=channels.find(c=>c.account===reception);await reception.client.removeChannel(own.channel);channels=channels.filter(c=>c!==own);
   const missed=await book(restaurant.client,slot(D,'21:15'),4,{label:'missed'});assert.ok(!missed.error,'Booking during disconnection failed ('+safeCode(missed)+')');extraIds.push(missed.id);
   const snap=await reception.client.from('reservations').select('id').eq('id',missed.id);ok(snap,'Snapshot read');assert.equal(snap.data.length,1,'Snapshot must contain the booking made during disconnection');
   assert.ok(await listen(reception,'reception-again'),'Re-subscription must succeed');
   const next=await book(restaurant.client,slot(D,'21:30'),4,{label:'after-reconnect'});assert.ok(!next.error,'Booking after reconnection failed ('+safeCode(next)+')');extraIds.push(next.id);
   assert.ok(await waitSeen('reception-again',next.id),'Re-subscribed Reception must receive the next change');
  });

  // ---------- S9 Isolation and invariants ----------
  await step('S9a Tenant isolation: establishment A cannot read or hold establishment C, and C cannot read A',async()=>{
   const foreign=accounts.find(a=>a.client&&a.role==='fb_admin'&&a.restaurantId!==C);assert.ok(foreign,'A foreign signed-in account is required');
   const r=await foreign.client.from('reservations').select('id').eq('restaurant_id',C);ok(r,'Foreign read');assert.equal(r.data.length,0,'Foreign tenant must see no C reservation');
   const h=await hold(foreign.client,slot(D+2,'19:00'),2,[tableIds[0]]);if(!h.r.error)await rpc(foreign.client,'booking_draft_v3',{p_key:h.key,p_action:'release'});assert.ok(h.r.error,'Foreign hold on a C table must be refused');
   const back=await reception.client.from('reservations').select('id').neq('restaurant_id',C);ok(back,'Reverse read');assert.equal(back.data.length,0,'C Reception must see no other establishment');
  });
  await step('S9b Final invariants: confirmed bookings persisted once, no orphan or overlapping assignment',async()=>{
   const expected=bookings.filter(b=>b.id).length+extraIds.length;
   const count=await db(`select count(*) from public.reservations where restaurant_id=${quote(C)} and guest_name like ${quote(tag+'%')};`);
   const orphans=await db(`select count(*) from public.reservation_tables a left join public.reservations r on r.id=a.reservation_id left join public.restaurant_tables t on t.id=a.table_id where (r.id is null or t.id is null);`);
   assert.equal(Number(count),expected,'Each confirmed booking must exist exactly once');assert.equal(orphans,'0','No orphan assignment');
   return {reservations:Number(count)};
  });
  observe('Not covered by this API scenario',{items:['arrival threshold 45 %→70 %→45 % (stored client-side settings; covered by MAIN unit tests RM-008 to RM-010)','weekend lunch closure columns (not used; closure verified with lunch_enabled)','UI rendering of the peak alert']});
 }catch(error){
  fail('Service simulation fixture or unhandled operation',error);
 }finally{
  for(const {account,channel} of channels){try{await account.client.removeChannel(channel);}catch{/* cleanup only */}}
  for(const a of [restaurant,reception]){try{await a?.client.auth.signOut({scope:'local'});}catch{/* cleanup only */}}
 }
 const out=summary();persist();console.log('SIMULATION '+JSON.stringify({passed:out.passed,failed:out.failed,propagationMs:out.propagationMs}));
 return out;
}
module.exports={run};
