'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),m=require('../service-v3-closeout-model.js');
const day=(extra={})=>({date:'2032-11-07',ended:true,can_close:false,pending:5,occupied_tables:2,awaited:2,arrived:1,unsupported:0,active_holds:0,total:5,served_covers:0,closure:null,revision:'v1',items:[],audit:[],...extra});
const context={role:'fb_admin',restaurantId:'venue-a'};
const response=()=>({schema:1,restaurant_id:'venue-a',today:'2032-11-08',server_time:'2032-11-08T10:00Z',revision:'1',services:[day()],notification_days:[day()],history:[],selected:day()});
test('RM-012: formats exact civil date without browser locale ambiguity',()=>{
 assert.equal(m.formatDate('2032-11-07'),'07/11/2032');for(const d of ['2032-02-30','2032-13-01','07/11/2032','0000-01-01',''])assert.equal(m.formatDate(d),'Date à vérifier');
});
test('RM-012: contextual actions never infer an absence, departure or finished day',()=>{
 assert.deepEqual(m.available({status:'seated'},day()),['release_table']);assert.deepEqual(m.available({status:'arrived'},day()),['mark_served','correct_arrival']);
 assert.deepEqual(m.available({status:'confirmed'},day()),['mark_absent','mark_served']);
 for(const state of ['cancelled','no_show','completed','released','departed','unknown'])assert.deepEqual(m.available({status:state},day()),[]);
 assert.deepEqual(m.available({status:'seated'},day({ended:false})),[]);assert.deepEqual(m.available({status:'seated'},day({closure:{id:'closed'}})),[]);
 assert.equal(m.actions.correct_arrival.reason,true);assert.equal(m.actions.mark_served.reason,true);
});
test('RM-012: server contract fails closed on other venue, partial data or impossible closure',()=>{
 assert.equal(m.validate(response(),'venue-a'),true);assert.equal(m.validate(response(),'venue-b'),false);
 for(const patch of [{schema:2},{notification_days:null},{server_time:'invalid'},{revision:1}])assert.equal(m.validate({...response(),...patch},'venue-a'),false);
 for(const patch of [{pending:-1},{active_holds:'0'},{date:'2032-02-30'},{can_close:true}])assert.equal(m.validate({...response(),selected:day(patch)},'venue-a'),false);
});
test('RM-012: one protected alert per service, regardless of duplicated source rows',()=>{
 const alerts=m.notifications([day(),day()],context);assert.equal(alerts.length,1);assert.equal(alerts[0].id,'service:2032-11-07');assert.equal(alerts[0].dismissible,false);assert.equal(alerts[0].priority,'high');assert.equal(alerts[0].serviceDate,'2032-11-07');assert.match(alerts[0].body,/2 tables.*3 réservations/);
});
test('RM-012: alert persists through treated blockers until the day is really closed',()=>{
 const clear=day({pending:0,occupied_tables:0,awaited:0,arrived:0,can_close:true});assert.equal(m.notifications([clear],context).length,1);assert.match(m.notifications([clear],context)[0].body,/clôture reste à confirmer/);
 assert.deepEqual(m.notifications([{...clear,closure:{id:'archive'}}],context),[]);assert.deepEqual(m.notifications([day({ended:false})],context),[]);
});
test('RM-012: notifications are Restaurant-only, venue-scoped, nonconfidential and explicitly stale offline',()=>{
 assert.deepEqual(m.notifications([day()],{...context,role:'reception'}),[]);
 const item=m.notifications([day({notes:'SECRET NOTES',guest_name:'PRIVATE CLIENT'})],context,{stale:true})[0];assert.equal(item.restaurantId,context.restaurantId);assert.ok(!JSON.stringify(item).includes('SECRET')&&!JSON.stringify(item).includes('PRIVATE'));assert.match(item.body,/reconnexion/);
});
test('RM-012: business revision changes without creating another notification identity',()=>{
 const [a]=m.notifications([day()],context),[b]=m.notifications([day({pending:4,revision:'v2'})],context);assert.equal(a.id,b.id);assert.notEqual(a.revision,b.revision);assert.equal(a.createdAt,b.createdAt);
});
test('RM-012: automatic legacy closure is removed, existing manual confirmation remains',()=>{
 const source=fs.readFileSync('service-v3-shared-closure.js','utf8');assert.ok(!source.includes("close(at.date,'automatic')"));assert.match(source,/RestoDialog.confirm/);assert.match(source,/RestoCloseout\?\.enabled/);
});
test('RM-012: app refresh includes uncertain administrative operations in the shared PWA guard',()=>{
 assert.match(fs.readFileSync('service-v3-refresh.js','utf8'),/RestoCloseout\?\.isBusy/);
});
