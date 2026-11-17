'use strict';
// Actual pointer/touch input, frontend and authenticated boundary; loopback only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {open,server,configure,getCalls}=require('./rm013a-management.cjs');
const out=process.env.BROWSER_ARTIFACTS||path.resolve('test-results/rm014-dismiss'),results=[];
const raw=JSON.parse(fs.readFileSync('app-release.json','utf8'));
const card=(page,id)=>page.locator('[data-notification-id="'+id+'"]');
const close=page=>page.getByRole('button',{name:'Fermer les notifications',exact:true}).click();
const refresh=page=>page.evaluate(async()=>{await window.RestoRefreshSharedService();await window.RestoRefreshFbAlerts?.();window.RestoNotifications.refresh()});
async function capture(page,name){await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'})}
async function drag(page,target,{dx=-135,dy=0,cancel=false,preview,kind='touch'}={}){
 await target.scrollIntoViewIfNeeded();const r=await target.boundingBox(),x=r.x+r.width/2,y=r.y+25;
 if(kind==='mouse'){
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});if(preview)await capture(page,preview);await page.mouse.up();
 }else{
  const session=await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=12;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/12,y:y+dy*i/12}]});
  if(preview)await capture(page,preview);
  await session.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await session.detach();
 }
 await page.clock.runFor(450);
}
async function setup(page){
 configure(s=>{
  s.reservations=[{id:'swipe-booking',guest_name:'204',hotel_room:'204',party_size:2,starts_at:'2032-11-08T09:30:00Z',ends_at:'2032-11-08T10:30:00Z',status:'reserved',notes:'[RESTOMANAGER:HOTEL]',edit_version:'original'}];
  s.assignments=[{reservation_id:'swipe-booking',table_id:s.tables[0].id}];
  s.bookingAlerts=[{id:'swipe-created',restaurant_id:'fictional-venue',reservation_id:'swipe-booking',guest_name:'204',hotel_room:'204',party_size:2,starts_at:'2032-11-08T09:30:00Z',created_at:'2032-11-08T09:59:00Z',read_at:null}];s.changeAlerts=[];
 });
 await page.context().route('**/app-release.json?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...raw,releases:raw.releases.map((r,i)=>i?r:{...r,date:'2032-11-08'})})}));
 await refresh(page);await page.evaluate(()=>window.RestoAppRelease.check());await page.evaluate(()=>window.RestoScreens.show('tables'));await page.locator('.serviceBell').click();
}
async function exercise(page,role,width){
 const targetId=role==='fb_admin'?'event:swipe-booking':'release:'+raw.currentVersion,target=card(page,targetId),touch=width<=1024,kind=touch?'touch':'mouse';
 const countBefore=Number(await page.locator('.serviceBellCount').textContent()),before=JSON.stringify(getCalls());
 assert.equal(await target.count(),1);await target.scrollIntoViewIfNeeded();
 if([390,768,1440].includes(width))await capture(page,'before-'+role+'-'+width);
 await drag(page,target,{dx:-35,kind});assert.equal(await target.count(),1,'A short horizontal gesture snaps back');
 if(touch){await drag(page,target,{cancel:true});assert.equal(await target.count(),1,'A cancelled gesture keeps the notification')}
 await drag(page,target,{kind,preview:[390,768,1440].includes(width)?'swiping-'+role+'-'+width:undefined});
 assert.equal(await target.count(),0,'Long left swipe removes the notification');assert.equal(Number(await page.locator('.serviceBellCount').textContent()),countBefore-1);
 assert.equal(await page.locator('.rmNcUndo').isVisible(),true);assert.equal(JSON.stringify(getCalls()),before,'Dismissal sends no read marker, booking or closeout mutation');
 if([390,768,1440].includes(width))await capture(page,'removed-'+role+'-'+width);
 await page.getByRole('button',{name:'Annuler le retrait',exact:true}).click();assert.equal(await target.count(),1);assert.equal(Number(await page.locator('.serviceBellCount').textContent()),countBefore);
 await drag(page,target,{dx:135,kind});assert.equal(await target.count(),0,'Right swipe also removes');
 await close(page);await page.locator('.serviceBell').click();assert.equal(await target.count(),0,'Dismissal survives closing/reopening');
 await page.reload();await page.waitForFunction(()=>window.RestoSupabaseReady===true);await page.evaluate(()=>window.RestoAppRelease.check());await page.locator('.serviceBell').click();assert.equal(await target.count(),0,'Dismissal survives reload');
 // The public release history stays available even after hiding its announcement.
 await page.getByRole('button',{name:'Quoi de neuf ?',exact:true}).click();assert.ok(await page.locator('.rmNcHistoryEntry').count()>=2);assert.match(await page.locator('.rmNcHistoryEntry').first().innerText(),new RegExp(raw.releases[0].title));await page.getByRole('button',{name:'Retour aux notifications',exact:true}).click();
 if(role==='fb_admin'){
  configure(s=>s.changeAlerts.push({id:'swipe-changed',restaurant_id:'fictional-venue',reservation_id:'swipe-booking',event_type:'modified',guest_name:'204',hotel_room:'204',party_size:3,previous_party_size:2,changed_fields:['couverts'],starts_at:'2032-11-08T09:30:00Z',created_at:'2032-11-08T10:00:00Z',read_at:null}));await refresh(page);
  assert.equal(await target.count(),1,'A genuine new event reopens the dismissed reservation group');assert.match(await target.innerText(),/Non lue/);
  const remove=target.getByRole('button',{name:'Retirer la notification : Réservation modifiée',exact:true});await remove.focus();await page.keyboard.press('Enter');assert.equal(await target.count(),0);assert.equal(await page.getByRole('button',{name:'Annuler le retrait',exact:true}).evaluate(el=>el===document.activeElement),true,'Keyboard removal moves focus to Undo');
  await page.keyboard.press('Enter');assert.equal(await target.count(),1,'Keyboard undo restores notification');
  // The active late reminder remains the same through countdown refreshes.
  const late=card(page,'late:swipe-booking');await late.getByRole('button',{name:'Retirer la notification : Arrivée à vérifier',exact:true}).click();await page.clock.fastForward(60000);await refresh(page);assert.equal(await late.count(),0);await page.getByRole('button',{name:'Annuler le retrait',exact:true}).click();assert.equal(await late.count(),1);
 }
 // A persistence failure must not make a notification silently disappear.
 const failureTarget=role==='fb_admin'?target:card(page,'release:'+raw.currentVersion);
 if(!await failureTarget.count()){
  await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('restomanager:notifications:v1:'));localStorage.removeItem(key);dispatchEvent(new StorageEvent('storage',{key}))});
 }
 await page.evaluate(()=>{window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('restomanager:notifications:v1:'))throw new DOMException('Quota exceeded','QuotaExceededError');return window.__setItem.call(this,key,value)}});
 await failureTarget.getByRole('button',{name:/^Retirer la notification :/}).click();assert.equal(await failureTarget.count(),1);assert.match(await page.locator('.rmNcStatus').innerText(),/ne peuvent pas être conservées/);await page.evaluate(()=>Storage.prototype.setItem=window.__setItem);
 await page.evaluate(()=>{window.RestoSyncState='error';dispatchEvent(new Event('restomanager:connection-state'))});const sync=card(page,'important:sync');assert.equal(await sync.locator('.rmNcDismiss').count(),0);await drag(page,sync,{kind});assert.equal(await sync.count(),1,'Active connection warning remains visible');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('.rmNcScroll').scrollWidth<=document.querySelector('.rmNcScroll').clientWidth+1));
 assert.equal(await page.locator('#serviceReminderPanel [data-lucide]').count(),0,'Dismiss icon is in local Lucide library');
 await close(page);await page.evaluate(()=>{window.RestoSyncState='ok';dispatchEvent(new Event('restomanager:connection-state'))});
 await page.evaluate(()=>{window.__unregisterError=window.RestoNotifications.registerSource('error-fixture',{roles:['fb_admin','reception'],collect(){throw Error('Fixture unavailable')}})});
 await page.locator('.serviceBell').click();assert.equal(await card(page,'error-fixture:unavailable').count(),1);assert.equal(await card(page,'error-fixture:unavailable').locator('.rmNcDismiss').count(),0,'An unavailable source cannot be hidden');await close(page);await page.evaluate(()=>window.__unregisterError());
 if(touch){
  await page.evaluate(()=>{window.__unregisterSwipe=window.RestoNotifications.registerSource('scroll-fixture',{roles:['fb_admin','reception'],collect:({context})=>Array.from({length:12},(_,i)=>({id:String(i),restaurantId:context.restaurantId,title:'Information fictive '+i,body:'Défilement vertical sans retrait.',createdAt:100+i,priority:'normal'}))})});
  await page.locator('.serviceBell').click();await page.locator('.rmNcScroll').evaluate(el=>el.scrollTop=0);
  const first=page.locator('.rmNcCard').first(),all=await page.locator('.rmNcCard').count();await drag(page,first,{dx:5,dy:-130});assert.equal(await page.locator('.rmNcCard').count(),all,'Vertical scrolling never dismisses');assert.ok(await page.locator('.rmNcScroll').evaluate(el=>el.scrollTop>10),'Native touch scroll still works');await close(page);await page.evaluate(()=>window.__unregisterSwipe());
 }
 assert.ok(!getCalls().some(c=>c.table||c.name&&c.name!=='booking_draft_v3'),'All dismissal tests preserve shared data and reading state');
}
async function storageIsolation(page,origin){
 const targetId='event:swipe-booking',target=card(page,targetId),second=await page.context().newPage();
 await second.clock.install({time:new Date('2032-11-08T10:00:00Z')});await second.goto(origin+'/v3-connected.html');await second.waitForFunction(()=>window.RestoSupabaseReady===true);
 const welcome=second.locator('#restoTourWelcome');if(await welcome.isVisible())await second.getByRole('button',{name:'Plus tard',exact:true}).click();
 await second.evaluate(()=>window.RestoAppRelease.check());await page.locator('.serviceBell').click();await second.locator('.serviceBell').click();assert.equal(await card(second,targetId).count(),1);
 await target.getByRole('button',{name:/^Retirer la notification :/}).click();await card(second,targetId).waitFor({state:'detached'});
 await page.getByRole('button',{name:'Annuler le retrait',exact:true}).click();await card(second,targetId).waitFor({state:'visible'});
 await target.getByRole('button',{name:/^Retirer la notification :/}).click();await card(second,targetId).waitFor({state:'detached'});
 const before=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('restomanager:notifications:v1:'));return {key,value:localStorage.getItem(key)}});
 await page.evaluate(()=>{window.RestoNotificationContext={...window.RestoNotificationContext,userId:'other-user'};dispatchEvent(new Event('restomanager:notification-context'))});await page.waitForFunction(()=>window.RestoNotificationContext===null);
 assert.equal(await page.locator('.serviceBell').isVisible(),false);assert.equal(await page.locator('.rmNcUndo').isVisible(),false);assert.equal(await page.evaluate(key=>localStorage.getItem(key),before.key),before.value,'Changing identity never rewrites another account’s preferences');
 await second.close();
}
(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
 for(const width of (process.env.RM014_WIDTH?[Number(process.env.RM014_WIDTH)]:[360,390,430,768,1024,1440,1920]))for(const role of ['fb_admin','reception']){
  const v=await open(browser,origin,width,role);try{await setup(v.page);await exercise(v.page,role,width);if(width===390&&role==='fb_admin')await storageIsolation(v.page,origin);assert.deepEqual(v.errors,[])}catch(error){await capture(v.page,'failure-'+role+'-'+width);throw error}finally{await v.context.close()}
  results.push({width,role,status:'passed'});console.log('PASS personal dismissal, actual gestures, undo, persistence and no shared mutation '+role+' '+width);
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,failed:0,network:'Loopback only; real frontend, simulated authenticated service',results},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
