'use strict';
// Actual frontend, simulated service boundary, fictitious data, no remote access.
// Full-stack Auth/PostgREST/Realtime is covered separately by test:mission3:supabase.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),artifacts=process.env.BROWSER_ARTIFACTS;
const day='2032-11-08',clock='2032-11-07T10:59:00Z';
let records,calls,sequence=0,forcedError=null,lostResponse=false,passed=0,sharedChanges={},autoRightSize=false;
const uuid=()=>crypto.randomUUID();
function reset({historical=false,overdue=false}={}){
 forcedError=null;lostResponse=false;calls=[];sharedChanges={};autoRightSize=false;
 records=[{id:'fictional-hotel',guest_name:'101',hotel_room:'101',party_size:2,starts_at:day+'T11:00:00Z',ends_at:day+'T12:30:00Z',status:'reserved',
  notes:(historical?'Note fictive '.repeat(140).trim():'Note fictive')+'\nALLERGIES À VÉRIFIER : '+(historical?'Allergie fictive '.repeat(40).trim():'Noix')+'\n[RESTOMANAGER:HOTEL]',edit_version:uuid()},
 {id:'fictional-exterior',guest_name:'755',hotel_room:null,party_size:2,starts_at:day+'T11:00:00Z',ends_at:day+'T12:30:00Z',status:'reserved',notes:'Note extérieure\nALLERGIES À VÉRIFIER : Lait\n[RESTOMANAGER:EXTERIEUR]',edit_version:uuid()}];
 if(overdue)records=[10,12].map((party_size,i)=>({id:'overdue-'+i,guest_name:'Fictif '+i,hotel_room:null,party_size,starts_at:'2032-11-07T10:'+String(i*30).padStart(2,'0')+':00Z',ends_at:'2032-11-07T12:30:00Z',status:'reserved',notes:'[RESTOMANAGER:EXTERIEUR]',edit_version:uuid()}));
}
function snapshot(){return {syncSequence:++sequence,revision:String(sequence),serverTime:new Date().toISOString(),capabilities:{reservation_edits:4,booking_recovery:1,snapshot:1},
 hours:{lunch_enabled:true,lunch_start:sharedChanges.lunchStart||'11:00:00',lunch_end:'15:00:00',dinner_enabled:true,dinner_start:'18:00:00',dinner_end:'23:00:00',duration:sharedChanges.duration||90},
 rooms:[{id:'fictional-room',name:'Salle fictive',active:true,sort_order:0}],
 tables:Array.from({length:8},(_,i)=>({id:'table-'+(i+1),label:String(i+1),seats:i===0?(sharedChanges.firstTableSeats||6):i===7?12:6,active:true,room_id:'fictional-room'})),
 reservations:structuredClone(records),assignments:records.map((r,i)=>({reservation_id:r.id,table_id:r.assignedTableId||'table-'+(i+1)})),holds:[],fusionLinks:sharedChanges.fusionLinks||[{table_a:'table-3',table_b:'table-4'},{table_a:'table-4',table_b:'table-5'}]}}
async function rpc(role,name,args){
 calls.push({role,name,args:structuredClone(args)});
 if(forcedError)return {data:null,error:forcedError};
 if(name==='booking_draft_v3')return {data:{tables:[],holds:[],seconds:180},error:null};
 const record=records.find(r=>r.id===args.p_reservation_id);
 if(!record)return {data:null,error:{code:'P0002',message:'internal private SQL object'}};
 if(name==='cancel_reservation_v3'){record.status='cancelled';record.edit_version=uuid();return {data:null,error:null}}
 assert.equal(name,role==='reception'?'reception_update_reservation_v4':'update_reservation_v4');
 if(record.edit_version!==args.p_expected_version)return {data:null,error:{code:'RM001',message:'update_reservation_v4 PostgreSQL stale internal'}};
 const previousCovers=record.party_size;
 Object.assign(record,{guest_name:args.p_guest_name,hotel_room:args.p_hotel_room,party_size:args.p_party_size,starts_at:args.p_starts_at,ends_at:args.p_ends_at,notes:args.p_notes,edit_version:uuid()});
 if(role==='reception'&&autoRightSize&&record.id==='fictional-hotel'&&args.p_party_size!==previousCovers){
  record.assignedTableId=args.p_party_size>=10?'table-8':'table-3';
 }
 if(lostResponse){lostResponse=false;return {data:null,error:{code:'NETWORK',message:'database response lost'}}}
 return {data:role==='reception'?{tables:[record.assignedTableId||'table-'+(records.indexOf(record)+1)],edit_version:record.edit_version}:record.edit_version,error:null};
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
 // The tutorial is part of the real first-visit UI. Close it through its
 // accessible action before checking the underlying service controls.
 const welcome=page.locator('#restoTourWelcome');
 await welcome.waitFor({state:'visible',timeout:1500}).catch(()=>{});
 if(await welcome.isVisible()){
  await welcome.locator('.restoTourLater').click();
  await welcome.waitFor({state:'hidden'});
 }
 return {context,page,errors};
}
async function edit(page){await page.evaluate(()=>window.RestoScreens.show('reservations'));await page.locator('#reservationShowAll').click();assert.match(await page.locator('#reservationDate').locator('..').innerText(),/Choisir une date/);await page.locator('[data-reservation-action=edit]').first().click();await page.locator('#editForm').waitFor({state:'visible'})}
async function submit(page){await page.locator('#editForm button[type=submit]').click()}
async function saved(page){await page.waitForFunction(()=>document.getElementById('editForm').hidden)}
async function message(page,match){await page.waitForFunction(value=>document.getElementById('reservationMessage').textContent.includes(value),match)}
async function successToast(page,match){await page.waitForFunction(value=>{const toast=document.getElementById('editSuccessToast');return !toast.hidden&&toast.textContent.includes(value)&&!document.getElementById('reservationMessage').textContent.includes(value)},match)}
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
   assert.equal(records[0].notes,before);assert.equal(records[0].hotel_room,'202');await successToast(view.page,'Réservation modifiée.');pass(role+' historical long notes/allergies preserved on room edit');
   await edit(view.page);const count=calls.length;await view.page.locator('#editNotes').fill('X'.repeat(1001));await submit(view.page);
   assert.equal(calls.length,count);assert.equal((await view.page.locator('#editNotes').inputValue()).length,1001);assert.equal(await view.page.locator('#editNotes').getAttribute('aria-invalid'),'true');
   assert.equal(records[0].notes,before);await view.page.locator('#editNotes').fill('Note raccourcie');await view.page.locator('#editAllergies').fill('Noix');await submit(view.page);await saved(view.page);pass(role+' explicit changed text limits preserve draft');await clean(view);
  }
  // Simulated server reallocation; real selection logic is tested in isolated PostgreSQL.
  reset();autoRightSize=true;const resized=await open(browser,origin,'reception');await edit(resized.page);
  await resized.page.locator('#editGuests').fill('10');await submit(resized.page);await saved(resized.page);
  await successToast(resized.page,'table 8');
  assert.equal(records[0].assignedTableId,'table-8');
  await resized.page.waitForFunction(()=>window.RestoSharedReservations?.find(r=>r.id==='fictional-hotel')?.tables?.includes(8));
  await edit(resized.page);await resized.page.locator('#editGuests').fill('2');
  await submit(resized.page);await saved(resized.page);await successToast(resized.page,'table 3');
  assert.equal(records[0].assignedTableId,'table-3');
  pass('Reception 2→10→2 automatically reassigned table is shown in confirmation');await clean(resized);

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
   // Navigation is identical in order and destination on both profiles;
   // role-specific wording and icons must communicate distinct permissions.
   const expectedIds=['tables','reservations','reservationForm','passages','administration'];
   const expectedLabels=['Tables','Réservations','Ajouter un client',
    role==='reception'?'Suivi du service':'Passages','Gestion'];
   const sideNav=await view.page.locator('.sidebar a[href^="#"]').evaluateAll(items=>items.map(a=>({
    id:a.getAttribute('href').slice(1),label:a.textContent.trim(),
    svg:a.querySelector('svg')!==null
   })));
   assert.deepEqual(sideNav.map(item=>item.id),expectedIds);
   assert.deepEqual(sideNav.map(item=>item.label),expectedLabels);
   assert.ok(sideNav.every(item=>item.svg),'All navigation icons must render offline using Lucide');
   const mobileNav=await view.page.locator('.mobileNavItem').evaluateAll(items=>items.map(a=>({
    id:a.dataset.nav,label:a.textContent.trim(),aria:a.getAttribute('aria-label'),
    svg:a.querySelector('svg')!==null
   })));
   assert.deepEqual(mobileNav.map(item=>item.id),expectedIds);
   assert.equal(mobileNav[2].label,'Ajouter');
   assert.equal(mobileNav[2].aria,'Ajouter un client');
   assert.equal(mobileNav[3].label,role==='reception'?'Suivi':'Passage');
   assert.equal(mobileNav[3].aria,role==='reception'?'Suivi du service':'Passages');
   assert.ok(mobileNav.every(item=>item.svg),'Mobile navigation icons must render offline');
   assert.equal(await view.page.locator('.quickAction[href="#reservationForm"] span').innerText(),'Ajouter un client');
   pass(role+' '+viewport.width+'px coherent five-tab hierarchy and accessible Lucide icons');
   // NAV-01: functional Back on the actual browser history (and Android PWA).
   const appLink=async id=>{
    const selector=viewport.width<=900?'.mobileNavItem[data-nav="'+id+'"]':'.sidebar a[href="#'+id+'"]';
    await view.page.locator(selector).click();
   };
   assert.equal(await view.page.locator('#navBackBtn').isVisible(),false,'No back control on the initial screen');
   await appLink('reservations');
   assert.equal(await view.page.evaluate(()=>window.RestoScreens.current()),'reservations');
   assert.equal(await view.page.locator('#navBackBtn').isVisible(),true);
   assert.ok(await view.page.locator('#navBackBtn svg').count(),'Back control must render offline Lucide arrow-left');
   await view.page.locator('#navBackBtn').click();
   await view.page.waitForFunction(()=>window.RestoScreens.current()==='tables');
   assert.equal(await view.page.locator('#navBackBtn').isVisible(),false);
   await appLink('reservations');
   await view.page.goBack({waitUntil:'domcontentloaded'});
   await view.page.waitForFunction(()=>window.RestoScreens.current()==='tables');
   await appLink('reservations');
   await appLink('tables');
   assert.equal(await view.page.locator('#navBackBtn').isVisible(),false,'Back must be hidden on home even after navigation history');
   await appLink('reservationForm');
   if(role==='fb_admin'){
    await view.page.locator('.restoAddChoiceOverlay').waitFor({state:'visible'});
    await view.page.locator('.restoAddChoiceOption[data-choice="reservation"]').click();
   }
   await view.page.waitForFunction(()=>window.RestoScreens.current()==='reservationForm');
   await view.page.locator('#bookingClient').fill('Brouillon non enregistré');
   await appLink('reservations');
   const leaveWarning=view.page.locator('.rmNoticeOverlay');
   await leaveWarning.waitFor({state:'visible'});
   assert.match(await leaveWarning.innerText(),/modifications non enregistrées/i);
   await leaveWarning.getByRole('button',{name:'Annuler'}).click();
   assert.equal(await view.page.evaluate(()=>window.RestoScreens.current()),'reservationForm');
   assert.equal(await view.page.locator('#bookingClient').inputValue(),'Brouillon non enregistré');
   await appLink('reservations');
   await leaveWarning.waitFor({state:'visible'});
   await leaveWarning.getByRole('button',{name:'Quitter sans enregistrer'}).click();
   await view.page.waitForFunction(()=>window.RestoScreens.current()==='reservations');
   pass(role+' '+viewport.width+'px navigation browser/toolbar Back and protected booking draft');
   // Returning from an unsaved reservation editor must protect the local draft.
   await view.page.evaluate(()=>window.RestoScreens.show('reservations'));
   await view.page.locator('#reservationShowAll').click();
   await view.page.locator('[data-reservation-action="edit"]').first().click();
   await view.page.locator('#editForm').waitFor({state:'visible'});
   await view.page.locator('#editClient').fill('Nom provisoire non enregistré');
   await view.page.locator('#navBackBtn').click();
   await leaveWarning.waitFor({state:'visible'});
   await leaveWarning.getByRole('button',{name:'Annuler'}).click();
   assert.equal(await view.page.locator('#editForm').isVisible(),true,'Cancel must preserve editor');
   assert.equal(await view.page.locator('#editClient').inputValue(),'Nom provisoire non enregistré');
   await view.page.locator('#navBackBtn').click();
   await leaveWarning.waitFor({state:'visible'});
   await leaveWarning.getByRole('button',{name:'Quitter sans enregistrer'}).click();
   await view.page.waitForFunction(()=>document.getElementById('editForm').hidden);
   assert.equal(await view.page.evaluate(()=>window.RestoScreens.current()),'reservations');
   pass(role+' '+viewport.width+'px protected edit form Back and cancellation');
   if(role==='fb_admin'&&viewport.width===390){
    // Simulate Android/system Back while an unsaved reservation is open.
    await view.page.evaluate(()=>window.RestoScreens.show('reservationForm'));
    await view.page.locator('#bookingClient').fill('Brouillon du bouton Retour Android');
    await view.page.goBack({waitUntil:'domcontentloaded'});
    await leaveWarning.waitFor({state:'visible'});
    await leaveWarning.getByRole('button',{name:'Annuler'}).click();
    assert.equal(await view.page.evaluate(()=>window.RestoScreens.current()),'reservationForm');
    assert.equal(await view.page.locator('#bookingClient').inputValue(),'Brouillon du bouton Retour Android');
    await view.page.goBack({waitUntil:'domcontentloaded'});
    await leaveWarning.waitFor({state:'visible'});
    await leaveWarning.getByRole('button',{name:'Quitter sans enregistrer'}).click();
    await view.page.waitForFunction(()=>window.RestoScreens.current()==='reservations');
    pass('Android/browser Back native navigation protects dirty draft');
   }
   // The existing sidebar regression needs a long service screen to scroll.
   await view.page.evaluate(()=>window.RestoScreens.show('tables'));


   const sidebarInfo=await view.page.evaluate(()=>{
    const sidebar=document.querySelector('.shell > .sidebar');
    const footer=sidebar.querySelector('.sidebarFooter');
    const header=document.querySelector('body > header.top');
    const r=sidebar.getBoundingClientRect();
    return {visible:getComputedStyle(sidebar).display!=='none',
     position:getComputedStyle(sidebar).position,
     height:r.height,footerBottom:footer.getBoundingClientRect().bottom,
     footerRole:document.getElementById('sidebarRole').textContent,
     footerName:document.getElementById('sidebarVenue').textContent,
     footerIcon:!!footer.querySelector('svg'),
     headerHeight:header.getBoundingClientRect().height,
     windowHeight:innerHeight};
   });
   assert.equal(sidebarInfo.footerRole,role==='reception'?'Espace Réception':'Espace Restaurant');
   assert.equal(sidebarInfo.footerName,'À l’Épicerie — Mercure Rouen Centre Champ-de-Mars');
   assert.equal(sidebarInfo.footerIcon,true,'Sidebar establishment icon must render locally');
   if(viewport.width>900){
    assert.equal(sidebarInfo.position,'sticky');
    assert.ok(sidebarInfo.visible);
    assert.ok(sidebarInfo.height<=sidebarInfo.windowHeight-sidebarInfo.headerHeight+3,
     'Sidebar must be limited to viewport below header');
    assert.ok(sidebarInfo.footerBottom<=sidebarInfo.windowHeight+2,
     'Establishment details should finish inside the visible viewport');
    await view.page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
    await view.page.clock.runFor(200);
    const after=await view.page.evaluate(()=>{
     const sidebar=document.querySelector('.shell > .sidebar');
     return {top:sidebar.getBoundingClientRect().top,
      footerBottom:sidebar.querySelector('.sidebarFooter').getBoundingClientRect().bottom,
      headerBottom:document.querySelector('body > header.top').getBoundingClientRect().bottom,
      pageScrolled:window.scrollY};
    });
    assert.ok(after.pageScrolled>100,'Long service page should scroll independently of the sidebar');
    assert.ok(Math.abs(after.top-after.headerBottom)<=3,
     JSON.stringify({message:'Sidebar must remain under the fixed header while the page scrolls',role,viewport,after,sidebarInfo}));
    assert.ok(after.footerBottom<=viewport.height+2,
     'Sidebar footer remains accessible at the viewport bottom');
    await view.page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
   }else assert.equal(sidebarInfo.visible,false,'Mobile and compact tablets keep the bottom navigation');
   pass(role+' '+viewport.width+'px sticky viewport sidebar or mobile bottom navigation');

   const establishmentFull='À l’Épicerie — Mercure Rouen Centre Champ-de-Mars';
   assert.equal(await view.page.locator('#headerEstablishment').count(),0,
    'No establishment label should compete with the refresh and bell controls');
   assert.equal(await view.page.locator('#currentEstablishmentName').innerText(),establishmentFull);

   // BUG-01 — the private report form exists for both roles, without a public inbox.
   await view.page.evaluate(()=>window.RestoScreens.show('administration'));
   const feedbackGroup=view.page.locator('#manageFeedback');
   await feedbackGroup.waitFor({state:'attached'});
   await feedbackGroup.locator('summary').click();
   await feedbackGroup.locator('#reportIssueForm').waitFor({state:'visible'});
   assert.match(await feedbackGroup.innerText(),/Signaler un problème/);
   assert.equal(await feedbackGroup.locator('#reportIssueKind option').count(),3);
   assert.equal(await feedbackGroup.locator('#reportIssueSeverity option').count(),2);
   assert.equal(await feedbackGroup.locator('#reportIssueContact').getAttribute('maxlength'),'160');
   assert.ok(await feedbackGroup.locator('summary svg').count(),'Lucide bug icon available offline');
   assert.ok(await feedbackGroup.locator('#reportIssueSubmit svg').count(),'Lucide send icon available offline');
   assert.equal(await view.page.locator('#ownerInbox').count(),0,'Employees cannot access creator inbox');
   const formOverflow=await feedbackGroup.locator('#reportIssueForm').evaluate(el=>({
    scroll:el.scrollWidth,width:el.clientWidth,
    sendHeight:el.querySelector('button').getBoundingClientRect().height
   }));
   assert.ok(formOverflow.scroll<=formOverflow.width+2,'Report form must fit viewport');
   assert.ok(formOverflow.sendHeight>=44,'Report submit must remain touch-friendly');
   await view.page.evaluate(()=>window.RestoScreens.show('tables'));
   pass(role+' '+viewport.width+'px staff private report form without owner data access');
   assert.equal(await view.page.locator('#teamSpace span').innerText(),role==='reception'?'Espace Réception':'Espace Restaurant');
   assert.equal(await view.page.locator('#teamVenue').innerText(),establishmentFull);
   assert.equal(await view.page.locator('#teamVenue').getAttribute('title'),establishmentFull);
   assert.ok(await view.page.locator('#teamSpace svg').count(),'Role identity must have a Lucide icon');
   assert.ok(await view.page.locator('.serviceVenue svg').count(),'Establishment must have a Lucide icon');
   const dateExpected=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(clock));
   const displayedDate=await view.page.locator('#introDateText').innerText();
   assert.equal(displayedDate.toLocaleLowerCase('fr-FR'),dateExpected);
   assert.ok(await view.page.locator('.serviceIntroDate svg').count(),'Date must have a Lucide calendar icon');
   const presentation=await view.page.locator('.serviceIntro').evaluate(intro=>{
    const title=intro.querySelector('h1');
    const range=document.createRange();
    range.selectNodeContents(title);
    const lineRects=[...range.getClientRects()];
    const date=intro.querySelector('.serviceIntroDate');
    const hello=intro.querySelector('#teamGreeting');
    return {title:title.textContent,hasForcedBreaks:!!title.querySelector('br,span'),
     headlineWidth:title.getBoundingClientRect().width,
     textRectWidth:lineRects.length?Math.max(...lineRects.map(rect=>rect.width)):0,
     dateVisible:getComputedStyle(date).display!=='none',
     greetingHidden:getComputedStyle(hello).display==='none',
     width:document.documentElement.scrollWidth,viewport:innerWidth};
   });
   assert.equal(presentation.title,'Votre service, en un coup d’œil');
   assert.equal(presentation.hasForcedBreaks,false,'The headline must wrap naturally without explicit spans or breaks');
   assert.ok(presentation.textRectWidth<=presentation.headlineWidth+2,'Headline must fit the available width');
   assert.equal(presentation.dateVisible,viewport.width<=700,'Date should stay with mobile intro; desktop header keeps its date');
   assert.equal(presentation.greetingHidden,viewport.width<=700,'Mobile avoids redundant greeting');
   assert.ok(presentation.width<=presentation.viewport+1,'Intro must not create horizontal overflow');
   const headerLayout=await view.page.evaluate(()=>({
    viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    refresh:document.getElementById('refreshAppBtn').getBoundingClientRect().toJSON(),
    refreshDisplay:getComputedStyle(document.getElementById('refreshAppBtn')).display,
    profile:document.getElementById('mobileAccountToggle').getBoundingClientRect().toJSON(),
    mobileRefreshPresent:!!document.getElementById('mobileAccountRefresh')
   }));
   assert.ok(headerLayout.scrollWidth<=headerLayout.viewport+1,'Header must not overflow viewport');
   if(viewport.width<=900){
    assert.equal(headerLayout.refreshDisplay,'none','Compact header must hide the desktop refresh button');
    assert.ok(headerLayout.profile.width>=42,'Account menu trigger must keep its touch target');
    assert.equal(headerLayout.mobileRefreshPresent,true,'Refresh action must remain available in the account menu');
   }else{
    assert.ok(headerLayout.refresh.width>=42,'Desktop refresh button must keep its touch target');
   }
   pass(role+' '+viewport.width+'px responsive service identity and naturally wrapping heading');
   // Each indicator stays data-driven; only the Lucide presentation changes.
   const kpiTitles=['Clients présents','Clients attendus','Tables occupées','Places sur tables libres'];
   const iconChecks=await view.page.locator('#kpis .kpi').evaluateAll(cards=>cards.map(card=>({
    title:card.querySelector('.kpiLabel')?.textContent,
    svg:!!card.querySelector('.kpiHead svg'),
    value:card.querySelector('strong')?.textContent,
    compact:card.scrollWidth<=card.clientWidth+1
   })));
   assert.deepEqual(iconChecks.map(card=>card.title),kpiTitles);
   assert.ok(iconChecks.every(card=>card.svg&&card.compact),'Each KPI must have a visible local Lucide icon without clipping');
   assert.ok(iconChecks.every(card=>/^[0-9]+$/.test(card.value)),'KPI values must remain numeric');
   const current=await view.page.locator('#currentOccupancy').evaluate(block=>({
    title:block.querySelector('.occupancyTitleText')?.textContent,
    icon:!!block.querySelector('.occupancyTitleText svg'),
    count:block.querySelectorAll('[role="progressbar"]').length
   }));
   assert.equal(current.title,'Occupation actuelle');
   assert.equal(current.icon,true,'Occupation actuelle must use an offline Lucide icon');
   assert.equal(current.count,2,'Occupation chart must retain its existing two progress indicators');
   pass(role+' '+viewport.width+'px four KPI and occupancy icons displayed with unchanged values');
   // All service subsections use local Lucide without changing business metrics.
   if(role==='reception'){
    await view.page.evaluate(()=>window.RestoScreens.show('passages'));
    await view.page.waitForFunction(()=>document.querySelectorAll('.receptionServiceMetric').length===4);
    await view.page.waitForFunction(()=>document.querySelectorAll('.receptionServiceMetric svg').length===4);
    const overview=await view.page.locator('#receptionServiceOverview').evaluate(root=>({
     metrics:[...root.querySelectorAll('.receptionServiceMetric')].map(c=>({
      label:c.querySelector('.receptionMetricLabel')?.textContent,
      hasIcon:!!c.querySelector('.receptionMetricLabel svg'),
      value:c.querySelector('strong')?.textContent
     })),
     pressure:!!root.querySelector('.receptionServicePressure h3 svg'),
     arrivals:!!root.querySelector('.receptionServiceArrivals h3 svg'),
     progress:root.querySelectorAll('progress').length,
     width:document.documentElement.scrollWidth,viewport:innerWidth
    }));
    assert.deepEqual(overview.metrics.map(m=>m.label),[
     'Couverts encore attendus','Couverts installés','Réservations à venir','Tables non occupées']);
    assert.ok(overview.metrics.every(m=>m.hasIcon&&/^[0-9]+$/.test(m.value)));
    assert.ok(overview.pressure&&overview.arrivals,'Reception service headings must have Lucide icons');
    assert.equal(overview.progress,1,'Reception service pressure meter must remain intact');
    assert.ok(overview.width<=overview.viewport+1,'Reception overview must not overflow horizontally');
   }else{
    await view.page.waitForFunction(()=>document.querySelectorAll('.rushArrivalBreakdownItem').length===3);
    await view.page.waitForFunction(()=>document.querySelectorAll('.rushBreakdownLabel svg').length===3);
    const section=await view.page.locator('#rushDashboard').evaluate(root=>({
     heading:!!root.querySelector('.rushDashHead .serviceIconHeading svg'),
     limit:!!root.querySelector('.rushLoadLabel svg'),
     statusIcons:[...root.querySelectorAll('.rushBreakdownLabel')].map(x=>!!x.querySelector('svg')),
     statusLabels:[...root.querySelectorAll('.rushBreakdownLabel')].map(x=>x.textContent),
     progress:root.querySelectorAll('[role="progressbar"]').length
    }));
    assert.ok(section.heading&&section.limit&&section.statusIcons.every(Boolean));
    assert.deepEqual(section.statusLabels,['Encore à venir','Heure prévue dépassée','Déjà arrivés / installés']);
    assert.ok(section.progress>=1,'Arrival load progressbar must remain present');
    assert.ok(await view.page.locator('#tables .panelHead h1 svg').count());
    assert.ok(await view.page.locator('#upcoming').locator('xpath=..').locator('h2 svg').count());
   }
   pass(role+' '+viewport.width+'px service dashboard headings and status cards preserve metrics with Lucide');
   if(role==='fb_admin'){
    // UX-only change: use existing walk-in form and recommendation engine.
    await view.page.evaluate(()=>window.RestoScreens.show('passages'));
    const form=view.page.locator('#walkinForm');
    await form.waitFor({state:'visible'});
    assert.equal(await form.locator('.walkinTypeField legend').innerText(),'Type de client');
    assert.equal(await form.locator('.walkinGuestsField label').innerText(),'Nombre de personnes');
    assert.ok(await view.page.locator('.walkinPanel .muted').first().innerText().then(t=>!t.includes('PAX')));
    const customerCards=await form.locator('.walkinTypeChoices label').evaluateAll(items=>items.map(el=>({
     svg:!!el.querySelector('svg'),text:el.innerText.trim(),checked:el.querySelector('input').checked
    })));
    assert.deepEqual(customerCards.map(x=>x.text),['Client de l’hôtel','Client extérieur']);
    assert.ok(customerCards.every(x=>x.svg),'Both client types must have offline Lucide icons');
    assert.equal(customerCards[0].checked,true);
    assert.equal(await view.page.locator('#walkinRoomLabel').innerText(),'Chambre ou nom du client (facultatif)');
    assert.equal(await view.page.locator('#walkinGuests').inputValue(),'2');
    await form.locator('#walkinPlus').click();
    assert.equal(await view.page.locator('#walkinGuests').inputValue(),'3');
    assert.equal(await form.locator('[data-walkin-pax="3"]').getAttribute('aria-pressed'),'true');
    await form.locator('#walkinMinus').click();
    assert.equal(await view.page.locator('#walkinGuests').inputValue(),'2');
    await form.locator('[data-walkin-pax="1"]').click();
    assert.equal(await view.page.locator('#walkinGuests').inputValue(),'1');
    assert.equal(await view.page.locator('#walkinGuestUnit').innerText(),'personne');
    assert.equal(await form.locator('#walkinMinus').isDisabled(),true);
    await form.locator('#walkinGuests').fill('8');
    await form.locator('#walkinGuests').dispatchEvent('input');
    assert.equal(await view.page.locator('#walkinGuestUnit').innerText(),'personnes');
    assert.equal(await form.locator('[data-walkin-pax="1"]').getAttribute('aria-pressed'),'false');
    await form.locator('input[name=walkinType][value=exterieur]').check();
    assert.equal(await view.page.locator('#walkinRoomLabel').innerText(),'Nom du client (facultatif)');
    assert.equal(await view.page.locator('#walkinRoom').getAttribute('placeholder'),'Ex. Dupont');
    await form.locator('input[name=walkinType][value=hotel]').check();
    assert.equal(await view.page.locator('#walkinRoomLabel').innerText(),'Chambre ou nom du client (facultatif)');
    await form.locator('[data-walkin-pax="2"]').click();
    const state=await form.evaluate(el=>({
     n:Number(el.querySelector('#walkinGuests').value),
     text:el.querySelector('#walkinRecommendation').textContent,
     buttons:[...el.querySelectorAll('.walkinGuestStepper button')].every(x=>x.getBoundingClientRect().height>=44),
     width:el.scrollWidth,clientWidth:el.clientWidth
    }));
    assert.equal(state.n,2);
    assert.ok(state.text.length>0,'Existing table recommendation still updates');
    // RM-005 visual cards mirror the real table-availability select (single source of truth).
    const deck=await form.evaluate(el=>{
     const options=[...el.querySelectorAll('#walkinTable option')].filter(o=>o.value&&!o.disabled);
     const cards=[...el.querySelectorAll('#walkinTableDeck .walkinTableCard')];
     return {
      options:options.map(o=>o.value),
      cards:cards.map(o=>o.getAttribute('aria-label')),
      selected:cards.filter(o=>o.getAttribute('aria-pressed')==='true').length,
      summary:el.querySelector('#walkinSelectedText')?.textContent,
      heading:el.querySelector('.walkinDeckHeading h3')?.textContent
     };
    });
    assert.ok(deck.heading?.includes('Tables disponibles maintenant'),'Passage card deck must have a clear heading');
    const flexLayout=await form.evaluate(el=>{
     const recommended=el.querySelector('#walkinRecommendedCards');
     const other=el.querySelector('#walkinOtherCards');
     const cards=[...recommended.querySelectorAll('.walkinTableCard')];
     const rects=cards.map(card=>card.getBoundingClientRect());
     return {
      display:getComputedStyle(recommended).display,
      direction:getComputedStyle(recommended).flexDirection,
      otherDisplay:getComputedStyle(other).display,
      otherWrap:getComputedStyle(other).flexWrap,
      sameRow:rects.length<2||rects.every(rect=>Math.abs(rect.top-rects[0].top)<2),
      documentOverflow:document.documentElement.scrollWidth-innerWidth
     };
    });
    assert.equal(flexLayout.display,'flex','Recommended cards must render as flex');
    assert.equal(flexLayout.direction,'row','Recommended cards must stay horizontal');
    assert.equal(flexLayout.otherDisplay,'flex','Other available cards must render as flex');
    assert.equal(flexLayout.otherWrap,'wrap','Other tables should wrap within viewport');
    assert.ok(flexLayout.sameRow,'Recommended table cards must remain on one row');
    assert.ok(flexLayout.documentOverflow<=2,'Flex Row must not create horizontal page overflow');
    const shortlist=await form.evaluate(el=>({
     recommended:el.querySelectorAll('#walkinRecommendedCards .walkinTableCard').length,
     others:el.querySelectorAll('#walkinOtherCards .walkinTableCard').length,
     manual:!!el.querySelector('#walkinManualTable'),
     icon:!!el.querySelector('#walkinManualTable svg'),
     selected:el.querySelectorAll('#walkinTableDeck .walkinTableCard[aria-pressed="true"]').length
    }));
    assert.ok(shortlist.recommended<=3,'Maximum three recommendations');
    assert.ok(shortlist.others<=2,'Maximum two additional tables');
    assert.ok(shortlist.manual,'Full manual table picker must be available');
    assert.ok(shortlist.icon,'Manual picker must use Lucide icon');
    assert.ok(deck.cards.length<=5,'Shortlist must have five cards at most');
    assert.equal(deck.selected,deck.options.length?1:0,'Exactly one table must be selected if available');
    assert.ok(deck.summary,'Chosen table summary must remain visible');
    if(deck.options.length){
     await form.locator('#walkinManualTable').click();
     assert.equal(await view.page.locator('.tablePickerOverlay:not([hidden])').count(),1,
      'Manual button must open all table choices');
     assert.equal(await view.page.locator('.tablePickerGrid .tablePickerCard').count(),deck.options.length,
      'Manual picker must offer every available choice');
     await view.page.locator('.tablePickerClose').click();
    }
    if(deck.options.length>1){
     const other= form.locator('#walkinTableDeck .walkinTableCard[aria-pressed="false"]').first();
     await other.click();
     assert.equal(await form.locator('#walkinTableDeck .walkinTableCard[aria-pressed="true"]').count(),1);
    }
    // RM-005: never offer installation from a stale connected snapshot.
    await view.page.evaluate(()=>{window.RestoSupabaseReady=false;window.dispatchEvent(new Event('restomanager:connection-state'))});
    assert.equal(await form.locator('button[type=submit]').isDisabled(),true);
    assert.match(await view.page.locator('#walkinRecommendation').innerText(),/Synchronisation en cours ou connexion interrompue/);
    assert.equal(await view.page.locator('#walkinTable option').count(),0);
    // RM-005: the same sync guard must protect one-click table release.
    const releaseButtons=view.page.locator('#quickReleaseList .quickReleaseButton');
    if(await releaseButtons.count())assert.equal(await releaseButtons.first().isDisabled(),true,
     'Offline connected service must block one-click release');
    assert.equal(await view.page.locator('#quickReleaseFeedback').count(),1);
    await view.page.evaluate(()=>{window.RestoSupabaseReady=true;window.dispatchEvent(new Event('restomanager:connection-state'))});
    assert.doesNotMatch(await view.page.locator('#walkinRecommendation').innerText(),/connexion interrompue/);
    assert.ok(state.buttons,'Stepper touch targets must remain accessible');
    assert.ok(state.width<=state.clientWidth+2,'Walk-in form must fit responsive viewport');
    pass(role+' '+viewport.width+'px clearer client selection, guest stepper and recommendation kept');
   }



   for(const screen of ['tables','reservations','reservationForm','passages','administration']){
    await view.page.evaluate(screen=>window.RestoScreens.show(screen),screen);await view.page.clock.runFor(32);
    const layout=await view.page.evaluate(()=>({viewport:innerWidth,body:document.body.scrollWidth,document:document.documentElement.scrollWidth,visible:[...document.querySelectorAll('.appScreen')].filter(screen=>!screen.hidden).length}));
    assert.equal(layout.visible,1);assert.ok(layout.body<=layout.viewport+1&&layout.document<=layout.viewport+1,JSON.stringify({role,viewport,screen,layout}));
   }
   // Responsive reservation action bar: preserve every role permission while
   // placing install/edit/change-table/options together on wide viewports.
   await view.page.evaluate(()=>window.RestoScreens.show('reservations'));
   await view.page.locator('#reservationShowAll').click();
   // RM-005-REG-01: legacy 'active' notifications must open a real filter,
   // preserving the targeted booking even when a different date was selected.
   await view.page.evaluate(()=>{
    document.getElementById('reservationDate').value='2031-01-01';
    window.dispatchEvent(new CustomEvent('restomanager:open-reservation',{detail:{view:'active',reservationId:'fictional-hotel'}}));
   });
   assert.equal(await view.page.locator('#reservationDate').inputValue(),day);
   assert.equal(await view.page.locator('.reservationViewTab.isActive').innerText().then(s=>s.includes('À venir')),true);
   assert.equal(await view.page.locator('.reservationExpanded').count(),1);
   pass(role+' '+viewport.width+'px legacy active notification opens targeted upcoming booking');
   // The compact layout checks below expect a collapsed card, not its expanded detail.
   await view.page.locator('.rmBookingOpen').first().click();
   assert.equal(await view.page.locator('.reservationExpanded').count(),0);
   await view.page.locator('#reservationQuery').fill('');
   // Wait for the 230ms appScreenActive translateY entrance animation to finish.
   // Otherwise sequential boundingBox() calls capture different animation frames.
   await view.page.clock.runFor(330);
   // The user's reference requires Lucide's actual `hotel` glyph for
   // hotel customers, not the older bed-double substitute. Check the local
   // SVG path on real DOM elements in both role views.
   if(viewport.width===390){
    const icons=await view.page.evaluate(()=>{
     const hotel=document.querySelector('.rmBookingCard[data-type="hotel"] .rmBookingClient svg');
     const exterior=document.querySelector('.rmBookingCard[data-type="external"] .rmBookingClient svg')
       ||document.querySelector('.rmBookingCard[data-type="exterior"] .rmBookingClient svg');
     return {hotel:hotel?[...hotel.querySelectorAll('path')].map(p=>p.getAttribute('d')):null,
      exterior:exterior?[...exterior.querySelectorAll('path')].map(p=>p.getAttribute('d')):null};
    });
    assert.ok(icons.hotel?.includes('M10 22v-6.57'),
      'Hotel reservations must display the authentic local Lucide hotel icon');
    if(icons.exterior)assert.ok(!icons.exterior.includes('M10 22v-6.57'),
      'External customers must keep the person icon');
    pass(role+' mobile booking hotel guests display genuine Lucide hotel SVG');
   }
   // RM-005 screenshot regression: four filters in a true 2x2 grid and
   // phone cards aligned in three readable rows, without overlapping controls.
   if(viewport.width===390){
    const mobile=await view.page.evaluate(()=>{
     const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,centerY:r.y+r.height/2}};
     const tabs=[...document.querySelectorAll('#rmReservationFilters .reservationViewTab')].map(rect);
     const date=document.querySelector('#reservationDate').closest('label');
     const query=document.querySelector('#reservationQuery').closest('label');
     const allDates=document.querySelector('#reservationShowAll');
     const card=document.querySelector('.rmBookingCard');
     const grid=card?.querySelector('.rmBookingGrid');
     const chevron=card?.querySelector('.rmBookingMobileChevron');
     const toolRail=card?.querySelector('.reservationActionTools');
     const primary=card?.querySelector('.reservationPrimaryActions');
     return {tabs,date:rect(date),query:rect(query),allDates:rect(allDates),
      cells:grid?[...grid.children].map(rect):[],gridWidth:grid?.clientWidth,scrollWidth:grid?.scrollWidth,
      cardHeight:card?rect(card).height:null,
      chevron:chevron?rect(chevron):null,toolRail:toolRail?rect(toolRail):null,
      buttons:toolRail?[...toolRail.querySelectorAll('button')].map(rect):[],
      primary:primary?rect(primary):null,hasPrimaryAction:!!primary,
      hasIndicators:!!card?.querySelector('.rmBookingFlag')};
    });
    assert.equal(mobile.tabs.length,4,'Four reservation filter buttons must be present');
    assert.ok(Math.abs(mobile.tabs[0].y-mobile.tabs[1].y)<=2,'Mobile filters 1 and 2 must align');
    assert.ok(Math.abs(mobile.tabs[2].y-mobile.tabs[3].y)<=2,'Mobile filters 3 and 4 must align');
    assert.ok(mobile.tabs[2].y>mobile.tabs[0].y+24,'Mobile filter second row must follow first');
    assert.ok(Math.abs(mobile.tabs[0].width-mobile.tabs[3].width)<=3,'Mobile filters have equal column widths');
    assert.ok(Math.abs(mobile.date.y+mobile.date.height-(mobile.allDates.y+mobile.allDates.height))<=5,
     'Date and Toutes les dates buttons must align at the bottom');
    assert.ok(mobile.query.y>mobile.date.y+mobile.date.height-2,
     'Search belongs below the date controls on a phone');
    assert.equal(mobile.cells.length,8,'Mobile reservation card keeps all eight fields in DOM');
    assert.ok(mobile.scrollWidth<=mobile.gridWidth+2,'Mobile reservation grid must not overflow');
    assert.ok(mobile.cardHeight<=(mobile.hasPrimaryAction?245:195),
     'Compact mobile card must avoid the oversized vertical action rail');
    const cy=i=>mobile.cells[i].centerY;
    assert.ok(Math.abs(cy(1)-cy(0))<=14,
     'Phone header: time and client share the center of the first band');
    assert.ok(Math.abs(cy(2)-cy(0))<=28,
     'Phone covers stay inside the upper band, stacked over the table');
    assert.ok(mobile.cells[3].y>mobile.cells[2].y+mobile.cells[2].height-3,
     'Phone table stays below covers within the SAME upper band');
    assert.ok(mobile.cells[5].y>=mobile.cells[0].y+mobile.cells[0].height-2,
     'Phone lower band begins after the booking identity');
    assert.ok(mobile.chevron&&mobile.chevron.width>=43&&mobile.chevron.height>=43,
     'Phone booking detail chevron has a 44px accessible target');
    assert.ok(Math.abs(mobile.chevron.centerY-mobile.cells[0].centerY)<=14,
     'Phone chevron belongs to the compact upper band');
    assert.ok(mobile.toolRail&&mobile.toolRail.width>=90,
     'Phone actions share a single compact lower row');
    assert.ok(Math.abs(mobile.toolRail.centerY-mobile.cells[5].centerY)<=11,
     'Phone action row and status badge must align vertically');
    assert.ok(mobile.buttons.length>=2,'Edit and overflow must both remain accessible');
    for(const b of mobile.buttons)assert.ok(b.width>=43&&b.height>=43,
     'Touch action targets remain 44px');
    assert.ok(Math.abs(mobile.buttons[0].y-mobile.buttons[1].y)<=2,
     'Edit and overflow buttons are now HORIZONTAL on the bottom row');
    assert.ok(mobile.buttons[0].x+mobile.buttons[0].width<=mobile.buttons[1].x+2,
     'Buttons must not overlap one another');
    if(mobile.hasIndicators){
     assert.ok(mobile.cells[6].y>=mobile.cells[5].y+mobile.cells[5].height-2,
      'Notes/allergies go below the status only when they exist');
    }else{
     assert.ok(mobile.cells[6].height<1,'Empty notes row should be collapsed entirely');
    }
    if(mobile.hasPrimaryAction){
     assert.ok(mobile.primary.y>=mobile.cells[5].y+mobile.cells[5].height-1,
      'Reception confirmation stays visible after the action/status line');
    }
    pass(role+' 390px compact two-band card, horizontal actions and conditional indicators');
   }
   // RM-005: sort arrow stays inside its own header (Couverts/Table(s)).
   if(viewport.width>=768){
    const columns=await view.page.evaluate(()=>{
     const heading=document.querySelector('#reservationList .rmBookingColumns');
     if(!heading)return null;
     return [...heading.children].map(col=>{
      const a=col.getBoundingClientRect();
      const arrow=col.querySelector('.rmBookingSort svg');
      const b=arrow?.getBoundingClientRect();
      return {x:a.x,right:a.right,visible:!!b&&b.width>0&&b.height>0,
       arrow:b?{x:b.x,right:b.right}:null};
     });
    });
    assert.equal(columns?.length,8,'Eight booking header columns must render on tablet/desktop');
    for(const index of [0,1,2,3]){
     const cell=columns[index];
     if(!cell.visible)continue;
     assert.ok(cell.arrow.x>=cell.x-1&&cell.arrow.right<=cell.right+1,
      'Sort arrow must remain inside column '+index+' without overlapping another heading');
    }
    pass(role+' '+viewport.width+'px reservation heading sort arrows contained');
   }
   const toolbar=view.page.locator('.reservationItem').first().locator('.reservationActionsModern');
   const modify=toolbar.getByRole('button',{name:'Modifier',exact:true});
   const more=toolbar.getByRole('button',{name:/Plus d.actions pour/});
   // Inspect all rectangles in the SAME browser frame. Sequential Playwright
   // boundingBox() calls can observe a moving parent during screen animation.
   const {editBox,moreBox,installBox,changeBox,cardBox}=await toolbar.evaluate(root=>{
    const bounds=element=>{
     if(!element)return null;
     const r=element.getBoundingClientRect();
     return {x:r.x,y:r.y,width:r.width,height:r.height};
    };
    return {
     editBox:bounds(root.querySelector('[data-reservation-action="edit"]')),
     moreBox:bounds(root.querySelector('.reservationMoreTrigger')),
     installBox:bounds(root.querySelector('[data-reservation-action="seated"]')),
     changeBox:bounds(root.querySelector('.reservationChangeTable')),
     cardBox:bounds(root.closest('.reservationItem'))
    };
   });
   assert.ok(editBox&&moreBox&&cardBox,'Edit and extra actions must remain visible');
   for(const rect of [editBox,moreBox]){
    assert.ok(rect.x>=cardBox.x-1&&rect.x+rect.width<=cardBox.x+cardBox.width+1,
     'Action must fit inside the reservation card');
   }
   // Current compact UI keeps edit and overflow on the reservation card;
   // installing/seating or changing a table stays in the Restaurant-only menu.
   assert.equal(installBox,null,'Install action is not a separate toolbar button');
   assert.equal(changeBox,null,'Table-change action is not a separate toolbar button');
   // RM-005 Full HD: desktop action buttons should be visually accessible
   // and not rendered as tiny controls in the far-right table column.
   if(viewport.width>=1440){
    assert.ok(editBox.width>=43&&editBox.height>=43&&moreBox.width>=43&&moreBox.height>=43,
     'Full HD edit and overflow actions must have >=44px targets');
    const targetPlacement=await toolbar.evaluate(root=>{
     const panel=root.closest('.rmBookingGrid'),cell=panel.children[7],actions=root;
     const c=cell.getBoundingClientRect(),r=actions.getBoundingClientRect();
     return {cellCenter:c.x+c.width/2,actionsCenter:r.x+r.width/2};
    });
    assert.ok(Math.abs(targetPlacement.cellCenter-targetPlacement.actionsCenter)<12,
     'Full HD actions should be centered inside their table column');
    pass(role+' Full HD reservation actions sized and aligned');
   }
   if(viewport.width>=750){
    assert.ok(Math.abs(editBox.y-moreBox.y)<=2,
     'Tablet/desktop edit and overflow controls must align');
    assert.ok(editBox.x<moreBox.x,'Edit must precede the overflow menu');
   }
   if(role==='reception'){
    assert.equal(await toolbar.locator('[data-reservation-action="confirm"]').count(),1,
     'Reception can still confirm a pending booking without managing the room');
   }
   // RM-005: verify the adaptive UI from the *actual available list width*.
   // On a tablet with a fixed sidebar, the list can be phone-card width;
   // on a wide tablet, the entire reservation is aligned in one row.
   if(viewport.width===768){
    const layout=await toolbar.evaluate(root=>{
     const grid=root.closest('.rmBookingGrid');
     const rc=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
     const rects=[...grid.children].map(rc);
     return {contentWidth:grid.parentElement.clientWidth,gridWidth:grid.clientWidth,scrollWidth:grid.scrollWidth,
      rects,cardHeight:grid.closest('.reservationItem').getBoundingClientRect().height};
    });
    assert.equal(layout.rects.length,8,'All eight reservation cells must remain mounted');
    assert.ok(layout.scrollWidth<=layout.gridWidth+2,'Reservation content must not overflow its grid');
    assert.ok(layout.cardHeight<=195,'Compact tablet reservation must not have a large blank band');
    const rowY=i=>layout.rects[i].y;
    const centerY=i=>layout.rects[i].y+layout.rects[i].height/2;
    if(layout.contentWidth>=660){
     assert.ok([1,2,3,4,5,6,7].every(i=>Math.abs(centerY(i)-centerY(0))<6),
      'Wide tablet: all eight columns occupy one aligned row: '+JSON.stringify(layout));
    }else if(layout.contentWidth>=475){
     assert.ok([1,2,3,5].every(i=>Math.abs(centerY(i)-centerY(0))<10),
      'Narrow tablet: time, guest, covers, table, status occupy first row: '+JSON.stringify(layout));
     assert.ok(rowY(6)>rowY(0)&&rowY(7)>rowY(0),'Narrow tablet: flags and actions belong below primary row');
    }else{
     assert.ok(Math.abs(rowY(1)-rowY(2))<24,'Compact tablet: guest and covers share the top band');
     assert.ok(rowY(6)>rowY(0)&&rowY(7)>rowY(0),'Compact tablet: alerts and actions remain in the bottom band');
    }
    if(artifacts){fs.mkdirSync(artifacts,{recursive:true});
     await view.page.screenshot({path:path.join(artifacts,'rm005-reservations-tablet-'+role+'.png'),fullPage:true})}
    pass(role+' 768px responsive reservation grid fits available panel width');
   }
   await more.click();
   const menu=view.page.getByRole('dialog',{name:'Actions de la réservation'});
   await menu.waitFor();
   if(role==='fb_admin'){
    assert.equal(await menu.getByRole('button',{name:'Installer à table'}).count(),1,
     'Restaurant must retain seat action in its overflow menu');
    assert.equal(await menu.getByRole('button',{name:'Changer la table'}).count(),1,
     'Restaurant must retain table reassignment in its overflow menu');
   }else{
    assert.equal(await menu.getByRole('button',{name:'Installer à table'}).count(),0,
     'Reception cannot seat customers');
    assert.equal(await menu.getByRole('button',{name:'Changer la table'}).count(),0,
     'Reception cannot manually change a table');
   }
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
