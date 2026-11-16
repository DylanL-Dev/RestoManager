'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const m=require('../service-v3-notification-model.js');
const now=Date.parse('2026-11-16T12:00:00Z'); // 13:00 Paris
const interval=(date,time,duration)=>[Date.parse(date+'T'+time+':00+01:00'),Date.parse(date+'T'+time+':00+01:00')+duration*60000];
const r=(props={})=>({id:'one',date:'2026-11-16',time:'12:30',duration:60,guests:2,tables:[1],client:'Client fictif',hotelRoom:'204',notes:'SECRET NOTES',allergies:'SECRET ALLERGIES',status:'reserved',...props});
const collect=(reservations,role='fb_admin',at=now)=>m.reminders({reservations,role,now:at,interval});
const event=(props={})=>({id:'event-1',reservation_id:'one',created_at:new Date(now-60000).toISOString(),starts_at:'2026-11-16T11:30:00Z',party_size:2,hotel_room:'204',read_at:null,...props});
test('source permissions: Reception cannot see restaurant reminders or reception events',()=>{
 assert.deepEqual(collect([r(),r({status:'seated'})],'reception'),[]);
 assert.deepEqual(m.events({role:'reception',bookings:[event()],changes:[event()],now}),[]);
 assert.deepEqual(collect([r()],'unknown'),[]);
});
test('state scope requires authenticated account and venue; separates account, venue and role',()=>{
 assert.equal(m.scope({userId:'u',role:'fb_admin'}),null);
 const base={userId:'u',restaurantId:'a',role:'fb_admin'};
 assert.notEqual(m.scope(base),m.scope({...base,userId:'v'}));assert.notEqual(m.scope(base),m.scope({...base,restaurantId:'b'}));assert.notEqual(m.scope(base),m.scope({...base,role:'reception'}));
});
test('a late arrival is stable across repeated snapshots, filters and time slots; resolving arrival removes it',()=>{
 const a=collect([r()])[0];assert.equal(a.type,'late');assert.equal(a.priority,'high');
 const b=collect([r()],'fb_admin',now+60000)[0];assert.equal(a.id,b.id);
 assert.equal(m.project([a,b,a]).length,1);
 assert.equal(collect([r({status:'arrived'})]).length,0);assert.equal(collect([r({status:'seated',seatedAt:new Date(now).toISOString()})]).length,0);
});
test('a reminder read once remains visible and does not become unread on refresh',()=>{
 const a=collect([r()])[0],state={[a.id]:{readAt:now}};
 assert.equal(m.project([a],state)[0].read,true);
 assert.equal(m.project(collect([r()],'fb_admin',now+60000),state)[0].read,true);
});
test('reporting is temporary; expires without creating a new identity and stops after resolution',()=>{
 const a=collect([r()])[0],state={[a.id]:{snoozedUntil:now+600000}};
 assert.equal(m.project([a],state,now)[0].snoozed,true);
 assert.equal(m.project([a],state,now+600001)[0].snoozed,false);
 assert.deepEqual(m.project(collect([r({status:'arrived'})]),state),[]);
});
test('seated yesterday remains overdue after Paris midnight until table really released',()=>{
 const seated=r({date:'2026-11-15',time:'23:00',status:'seated',seatedAt:'2026-11-15T22:00:00Z'}),at=Date.parse('2026-11-15T23:10:00Z');
 assert.equal(m.day(at),'2026-11-16');assert.equal(collect([seated],'fb_admin',at)[0].type,'departure');
 assert.equal(collect([{...seated,status:'released'}],'fb_admin',at).length,0);
});
test('Paris civil date respects winter and summer offset; yesterday late arrival is not reissued',()=>{
 assert.equal(m.day('2026-11-15T23:01:00Z'),'2026-11-16');assert.equal(m.day('2026-07-15T22:01:00Z'),'2026-07-16');
 assert.equal(collect([r({date:'2026-11-15'})]).length,0);
});
test('departure estimation follows actual seating; only future conflicts raise priority',()=>{
 const seated=r({status:'seated',seatedAt:new Date(now-50*60000).toISOString()});
 assert.equal(collect([seated])[0].priority,'normal');
 const previous=r({id:'past',time:'11:00',status:'completed'});assert.equal(collect([seated,previous])[0].priority,'normal');
 const next=r({id:'next',time:'13:15'});assert.equal(collect([seated,next])[0].priority,'high');
});
test('duplicate event identities do not inflate count and latest event supplies context',()=>{
 const a=event(),b=event({id:'change-1',event_type:'modified',created_at:new Date(now).toISOString(),changed_fields:['consignes','couverts'],previous_party_size:1});
 const result=m.events({role:'fb_admin',bookings:[a,a],changes:[b,b],reservations:[r()],now});
 assert.equal(result.length,1);assert.equal(result[0].groupedCount,2);assert.equal(result[0].title,'Réservation modifiée');assert.equal(result[0].read,false);
 assert.equal(result[0].refs.length,2);assert.ok(result[0].body.includes('Consignes ou allergies modifiées'));
 assert.ok(!result[0].body.includes('SECRET'));
});
test('server read marker is authoritative; a subsequent genuine event reopens the grouped unread state',()=>{
 const a=event({read_at:new Date(now).toISOString()});const f=changes=>m.events({role:'fb_admin',bookings:[a],changes,now});
 assert.equal(f([])[0].read,true);assert.equal(f([event({id:'new',event_type:'modified'})])[0].read,false);
 assert.equal(m.project(f([event({id:'new',event_type:'modified'})]),{'event:one':{readAt:now}})[0].read,false);
});
test('cancellation supersedes creation and navigates context without mutating the reservation',()=>{
 const result=m.events({role:'fb_admin',bookings:[event()],changes:[event({id:'cancel',event_type:'cancelled',created_at:new Date(now).toISOString()})],reservations:[r({status:'cancelled'})],now});
 assert.equal(result.length,1);assert.equal(result[0].type,'cancelled');assert.equal(result[0].priority,'high');assert.equal(result[0].action,'reservation');
});
test('terminated bookings and expired events do not pollute the active service',()=>{
 assert.equal(m.events({role:'fb_admin',bookings:[event()],reservations:[r({status:'completed'})],now}).length,0);
 assert.equal(m.events({role:'fb_admin',bookings:[event({created_at:new Date(now-8*86400000).toISOString()})],now}).length,0);
 assert.equal(m.events({role:'fb_admin',bookings:[event({read_at:new Date(now-3*86400000).toISOString()})],now}).length,0);
});
test('priority ordering is stable: important, service, news; unread before read within a priority',()=>{
 const result=m.project([{id:'news',priority:'low',createdAt:now},{id:'normal',priority:'normal',createdAt:now},{id:'important',priority:'high',createdAt:now-1},{id:'read',priority:'normal',read:true,createdAt:now+1}]);
 assert.deepEqual(result.map(n=>n.id),['important','normal','read','news']);
});
test('invalid dates and uninstalled future service sources do not create fictitious business alerts',()=>{
 assert.deepEqual(collect([r({time:'invalid'})]),[]);assert.deepEqual(m.events({role:'fb_admin',now}),[]);assert.deepEqual(m.project([]),[]);
});
