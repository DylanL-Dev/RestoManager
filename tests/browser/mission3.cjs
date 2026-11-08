'use strict';
// Actual frontend, simulated service boundary, fictitious data, no remote access.
// Full-stack Auth/PostgREST/Realtime is covered separately by test:mission3:supabase.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),artifacts=process.env.BROWSER_ARTIFACTS;
const day='2032-11-08',clock='2032-11-07T10:59:00Z';
let records,calls,sequence=0,forcedError=null,lostResponse=false,passed=0,sharedChanges={};
const uuid=()=>crypto.randomUUID();
function reset({historical=false,overdue=false}={}){
 forcedError=null;lostResponse=false;calls=[];sharedChanges={};
 records=[{id:'fictional-hotel',guest_name:'101',hotel_room:'101',party_size:2,starts_at:day+'T11:00:00Z',ends_at:day+'T12:30:00Z',status:'reserved',
  notes:(historical?'Note fictive '.repeat(140).trim():'Note fictive')+'\nALLERGIES À VÉRIFIER : '+(historical?'Allergie fictive '.repeat(40).trim():'Noix')+'\n[RESTOMANAGER:HOTEL]',edit_version:uuid()},
 {id:'fictional-exterior',guest_name:'755',hotel_room:null,party_size:2,starts_at:day+'T11:00:00Z',ends_at:day+'T12:30:00Z',status:'reserved',notes:'Note extérieure\nALLERGIES À VÉRIFIER : Lait\n[RESTOMANAGER:EXTERIEUR]',edit_version:uuid()}];
 if(overdue)records=[10,12].map((party_size,i)=>({id:'overdue-'+i,guest_name:'Fictif '+i,hotel_room:null,party_size,starts_at:'2032-11-07T10:'+String(i*30).padStart(2,'0')+':00Z',ends_at:'2032-11-07T12:30:00Z',status:'reserved',notes:'[RESTOMANAGER:EXTERIEUR]',edit_version:uuid()}));
}
function snapshot(){return {syncSequence:++sequence,revision:String(sequence),serverTime:new Date().toISOString(),capabilities:{reservation_edits:4,booking_recovery:1,snapshot:1},
 hours:{lunch_enabled:true,lunch_start:sharedChanges.lunchStart||'11:00:00',lunch_end:'15:00:00',dinner_enabled:true,dinner_start:'18:00:00',dinner_end:'23:00:00',duration:sharedChanges.duration||90},
 rooms:[{id:'fictional-room',name:'Salle fictive',active:true,sort_order:0}],
 tables:Array.from({length:8},(_,i)=>({id:'table-'+(i+1),label:String(i+1),seats:i===0?(sharedChanges.firstTableSeats||6):i===7?12:6,active:true,room_id:'fictional-room'})),
 reservations:structuredClone(records),assignments:records.map((r,i)=>({reservation_id:r.id,table_id:'table-'+(i+1)})),holds:[],fusionLinks:sharedChanges.fusionLinks||[{table_a:'table-3',table_b:'table-4'},{table_a:'table-4',table_b:'table-5'}]}}
async function rpc(role,name,args){
 calls.push({role,name,args:structuredClone(args)});
 if(forcedError)return {data:null,error:forcedError};
 if(name==='booking_draft_v3')return {data:{tables:[],holds:[],seconds:180},error:null};
 const record=records.find(r=>r.id===args.p_reservation_id);
 if(!record)return {data:null,error:{code:'P0002',message:'internal private SQL object'}};
 if(name==='cancel_reservation_v3'){record.status='cancelled';record.edit_version=uuid();return {data:null,error:null}}
 assert.equal(name,role==='reception'?'reception_update_reservation_v4':'update_reservation_v4');
 if(record.edit_version!==args.p_expected_version)return {data:null,error:{code:'RM001',message:'update_reservation_v4 PostgreSQL stale internal'}};
 Object.assign(record,{guest_name:args.p_guest_name,hotel_room:args.p_hotel_room,party_size:args.p_party_size,starts_at:args.p_starts_at,ends_at:args.p_ends_at,notes:args.p_notes,edit_version:uuid()});
 if(lostResponse){lostResponse=false;return {data:null,error:{code:'NETWORK',message:'database response lost'}}}
 return {data:role==='reception'?{tables:['table-'+(records.indexOf(record)+1)],edit_version:record.edit_version}:record.edit_version,error:null};
}
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)||file.includes(path.sep+'.git'+path.sep)){res.writeHead(404);res.end();return}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data)});
});
async function open(browser,origin,role,viewport={width:390,height:844},timezoneId='Europe/Paris'){
 const context=await browser.newContext({viewport,isMobile:viewport.width<768,hasTouch:viewport.width<=768,serviceWorkers:'block',timezoneId});
 await context.addInitScript(role=>{window.__mission3Role=role},role);
 await context.exposeFunction('__mission3Snapshot',snapshot);await context.exposeFunction('__mission3Rpc',(name,args)=>rpc(role,name,args));
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
  if(url.pathname==='/supabase-service-bridge.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'mission3-bridge.mjs'),'utf8')});
  return route.continue();
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install({time:new Date(clock)});
 await page.goto(origin+'/v3-connected.html');await page.waitForFunction(()=>window.RestoSupabaseReady===true);
 return {context,page,errors};
}
async function edit(page){await page.evaluate(()=>window.RestoScreens.show('reservations'));await page.locator('#reservationShowAll').click();assert.match(await page.locator('#reservationDate').locator('..').innerText(),/Choisir une date/);await page.locator('[data-reservation-action=edit]').first().click();await page.locator('#editForm').waitFor({state:'visible'})}
async function submit(page){await page.locator('#editForm button[type=submit]').click()}
async function saved(page){await page.waitForFunction(()=>document.getElementById('editForm').hidden)}
async function message(page,match){await page.waitForFunction(value=>document.getElementById('reservationMessage').textContent.includes(value),match)}
async function push(page){await page.evaluate(()=>window.dispatchEvent(new Event('mission3:push')));await page.waitForFunction(()=>window.RestoSupabaseReady===true)}
async function clean(view){assert.deepEqual(view.errors,[]);await view.context.close()}
function pass(name){passed++;console.log('PASS mock UI '+name)}
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  for(const role of ['fb_admin','reception']){
   reset({historical:true});const view=await open(browser,origin,role);await edit(view.page);
   const before=records[0].notes;assert.ok((await view.page.locator('#editNotes').inputValue()).length>1000);assert.ok((await view.page.locator('#editAllergies').inputValue()).length>500);
   await view.page.locator('#editHotelRoom').fill('202');await submit(view.page);await saved(view.page);
   assert.equal(records[0].notes,before);assert.equal(records[0].hotel_room,'202');pass(role+' historical long notes/allergies preserved on room edit');
   await edit(view.page);const count=calls.length;await view.page.locator('#editNotes').fill('X'.repeat(1001));await submit(view.page);
   assert.equal(calls.length,count);assert.equal((await view.page.locator('#editNotes').inputValue()).length,1001);assert.equal(await view.page.locator('#editNotes').getAttribute('aria-invalid'),'true');
   assert.equal(records[0].notes,before);await view.page.locator('#editNotes').fill('Note raccourcie');await view.page.locator('#editAllergies').fill('Noix');await submit(view.page);await saved(view.page);pass(role+' explicit changed text limits preserve draft');await clean(view);
  }
  for(const pair of [['fb_admin','reception'],['reception','fb_admin']]){
   reset();const a=await open(browser,origin,pair[0]),b=await open(browser,origin,pair[1]);await edit(a.page);await edit(b.page);const opened=records[0].edit_version;
   await b.page.locator('#editClient').fill('Brouillon B');await a.page.locator('#editAllergies').fill('Arachide ajoutée par A');await submit(a.page);await saved(a.page);await push(b.page);
   await b.page.locator('#editConflict').waitFor({state:'visible'});await b.context.setOffline(true);await b.page.waitForFunction(()=>!window.RestoSupabaseReady);await b.context.setOffline(false);await b.page.waitForFunction(()=>window.RestoSupabaseReady);
   await submit(b.page);await message(b.page,'saisie est conservée');assert.equal(calls.filter(call=>call.role===pair[1]&&call.name.endsWith('reservation_v4')).at(-1).args.p_expected_version,opened);
   assert.match(records[0].notes,/Arachide ajoutée par A/);assert.equal(await b.page.locator('#editClient').inputValue(),'Brouillon B');
   await b.page.locator('#editReviewCurrent').click();await b.page.waitForFunction(()=>document.getElementById('editCurrentValues').textContent.includes('Arachide ajoutée par A'));
   await b.page.locator('#editReloadCurrent').click();const confirm=b.page.getByRole('alertdialog',{name:'Recharger la réservation'});await confirm.waitFor();assert.match(await confirm.getAttribute('aria-describedby'),/^restoNotice-/);const beforeScroll=await b.page.evaluate(()=>({x:scrollX,y:scrollY}));
   await b.page.keyboard.press('Shift+Tab');assert.equal(await b.page.evaluate(()=>document.activeElement.textContent),'Remplacer ma saisie');await b.page.keyboard.press('Tab');assert.equal(await b.page.evaluate(()=>document.activeElement.textContent),'Annuler');
   await b.page.keyboard.press('Escape');assert.equal(await b.page.evaluate(()=>document.activeElement.id),'editReloadCurrent');assert.deepEqual(await b.page.evaluate(()=>({x:scrollX,y:scrollY})),beforeScroll);assert.equal(await b.page.locator('#editClient').inputValue(),'Brouillon B');
   // A further change after review/while confirming requires a new explicit decision.
   await b.page.locator('#editReloadCurrent').click();records[0].notes=records[0].notes.replace('Arachide ajoutée par A','Arachide et lait ajoutés par A');records[0].edit_version=uuid();
   await b.page.getByRole('button',{name:'Remplacer ma saisie',exact:true}).click();await message(b.page,'encore changé');assert.equal(await b.page.locator('#editClient').inputValue(),'Brouillon B');
   await b.page.locator('#editReloadCurrent').click();await b.page.getByRole('button',{name:'Remplacer ma saisie',exact:true}).click();await b.page.waitForFunction(()=>document.getElementById('editConflict').hidden);
   assert.equal(await b.page.locator('#editAllergies').inputValue(),'Arachide et lait ajoutés par A');pass(pair.join('/')+' stale version, reconnect, review/reload race and explicit confirmation');await clean(a);await clean(b);
  }
  for(const role of ['fb_admin','reception']){
   reset();const view=await open(browser,origin,role);await edit(view.page);await view.page.locator('#editNotes').fill('Saisie non enregistrée');
   forcedError={code:'XX000',message:'PostgreSQL update_reservation_v4 private SQL secret object'};await submit(view.page);await message(view.page,'saisie est conservée');
   const visible=await view.page.locator('#reservationMessage').innerText();assert.doesNotMatch(visible,/PostgreSQL|SQL|RPC|Supabase|XX000|update_reservation/);assert.equal(await view.page.locator('#editNotes').inputValue(),'Saisie non enregistrée');
   forcedError=null;records[0].status='cancelled';records[0].edit_version=uuid();await push(view.page);await view.page.locator('#editReviewCurrent').click();await view.page.locator('#editReloadCurrent').click();await view.page.getByRole('button',{name:'Remplacer ma saisie',exact:true}).click();await message(view.page,'terminée ou annulée');assert.equal(await view.page.locator('#editNotes').inputValue(),'Saisie non enregistrée');pass(role+' safe error and cancellation cannot restore stale reservation');await clean(view);
  }
  reset();const management=await open(browser,origin,'fb_admin');
  await management.page.evaluate(()=>window.RestoScreens.show('administration'));await management.page.locator('#manageTables > summary').click();await management.page.locator('#administration > summary').click();
  sharedChanges={lunchStart:'11:30:00',duration:120,firstTableSeats:8,fusionLinks:[{table_a:'table-3',table_b:'table-4'}]};await push(management.page);
  await management.page.waitForFunction(()=>document.getElementById('shift-lunch-start').value==='11:30');
  assert.equal(await management.page.locator('#restaurantDefaultDuration').inputValue(),'120');assert.match(await management.page.locator('#tableAdminList').innerText(),/Table 1 · 1–8 places/);
  assert.deepEqual(await management.page.evaluate(()=>window.RestoFusion.pairs()),[[3,4]]);
  await management.page.evaluate(()=>{const input=document.getElementById('shift-lunch-start');input.value='11:45';input.dispatchEvent(new Event('input',{bubbles:true}))});await push(management.page);
  assert.equal(await management.page.locator('#shift-lunch-start').inputValue(),'11:45');pass('atomic snapshot refreshes hours, tables and fusions without resetting an unrelated unsaved hours draft');await clean(management);
  for(const role of ['fb_admin','reception'])for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){
   reset();const view=await open(browser,origin,role,viewport);
   for(const screen of ['tables','reservations','reservationForm','passages','administration']){
    await view.page.evaluate(screen=>window.RestoScreens.show(screen),screen);await view.page.clock.runFor(32);
    const layout=await view.page.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth,document:document.documentElement.scrollWidth,visible:[...document.querySelectorAll('.appScreen')].filter(screen=>!screen.hidden).length}));
    assert.equal(layout.visible,1);assert.ok(layout.body<=layout.viewport+1&&layout.document<=layout.viewport+1,JSON.stringify({role,viewport,screen,layout}));
   }
   // Responsive reservation action bar: preserve every role permission while
   // placing install/edit/change-table/options together on wide viewports.
   await view.page.evaluate(()=>window.RestoScreens.show('reservations'));
   await view.page.locator('#reservationShowAll').click();
   const toolbar=view.page.locator('.reservationItem').first().locator('.reservationActionsModern');
   const modify=toolbar.getByRole('button',{name:'Modifier',exact:true});
   const more=toolbar.getByRole('button',{name:/Plus d.actions pour/});
   const editBox=await modify.boundingBox(),moreBox=await more.boundingBox();
   assert.ok(editBox&&moreBox,'Edit and extra actions must remain visible');
   const cardBox=await view.page.locator('.reservationItem').first().boundingBox();
   for(const rect of [editBox,moreBox]){
    assert.ok(rect.x>=cardBox.x-1&&rect.x+rect.width<=cardBox.x+cardBox.width+1,
     'Action must fit inside the reservation card');
   }
   if(role==='fb_admin'){
    const install=toolbar.getByRole('button',{name:'Installer à table',exact:true});
    const change=toolbar.getByRole('button',{name:'Changer la table',exact:true});
    const installBox=await install.boundingBox(),changeBox=await change.boundingBox();
    assert.ok(installBox&&changeBox);
    if(viewport.width>=750){
     for(const rect of [editBox,changeBox,moreBox])
      assert.ok(Math.abs(rect.y-installBox.y)<=2,'Tablet/desktop actions must align on one horizontal row');
     assert.ok(installBox.x<editBox.x&&editBox.x<changeBox.x&&changeBox.x<moreBox.x,
      'Actions must follow install, edit, change table, extra order');
    }else{
     assert.ok(installBox.y+installBox.height<=editBox.y+2,
      'Mobile keeps main action above secondary actions');
    }
   }else{
    assert.equal(await toolbar.getByRole('button',{name:'Installer à table',exact:true}).count(),0);
    assert.equal(await toolbar.getByRole('button',{name:'Changer la table',exact:true}).count(),0);
    assert.ok(await toolbar.locator('.reservationPrimaryActions').count()===0,
     'Reception must not keep an empty primary column');
   }
   await more.click();
   await view.page.getByRole('dialog',{name:'Actions de la réservation'}).waitFor();
   await view.page.getByRole('button',{name:'Fermer les actions'}).click();
   await view.page.clock.runFor(240);
   await view.page.waitForFunction(()=>!document.querySelector('.reservationMenuOverlay'));
   pass(role+' '+viewport.width+'px reservation actions aligned without overflow and menu accessible');
   await edit(view.page);await view.page.locator('#editClient').fill('Fictif accessible');await view.page.locator('#editNotes').fill('Note fictive '.repeat(60));
   assert.ok((await view.page.locator('#editForm button[type=submit]').boundingBox()).height>=44);
   if(artifacts){fs.mkdirSync(artifacts,{recursive:true});await view.page.screenshot({path:path.join(artifacts,'mission3-'+role+'-'+viewport.width+'.png'),fullPage:true})}
   pass(role+' '+viewport.width+'x'+viewport.height+' five screens without horizontal overflow, editable form and touch target');await clean(view);
  }
  for(const role of ['fb_admin','reception']){
   reset({overdue:true});const view=await open(browser,origin,role);await view.page.evaluate(()=>window.RestoScreens.show('tables'));
   await view.page.waitForFunction(()=>document.getElementById('rushDashboard').textContent.includes('22 /'));
   await view.page.clock.fastForward(120000);const text=await view.page.locator('#rushDashboard').innerText();assert.match(text,/12:00.*13:00/s);assert.match(text,/22 couvert\(s\) attendus sur les créneaux précédents/);assert.match(text,/0 \/ /);
   assert.equal(await view.page.locator('#currentOccupancy').innerText().then(text=>/22/.test(text)),false);pass(role+' clock-controlled 11:59→12:01 keeps 22 overdue visible with zero current arrivals');await clean(view);
  }
  reset({overdue:true});const foreignClock=await open(browser,origin,'fb_admin',{width:390,height:844},'America/New_York');
  await foreignClock.page.clock.fastForward(120000);await foreignClock.page.locator('.serviceBell').click();
  assert.match(await foreignClock.page.locator('.serviceReminderPanel').innerText(),/Client en retard/);pass('Paris overdue notifications remain correct in a browser configured for New York');await clean(foreignClock);
  console.log(JSON.stringify({passed,failed:0,backend:'in-memory mock, external requests blocked; Auth/RLS/Realtime NOT validated',viewports:['390x844','768x1024','1440x900']}));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
