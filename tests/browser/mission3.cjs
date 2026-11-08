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
  // Simulated server reallocation; real selection logic is tested in isolated PostgreSQL.
  reset();autoRightSize=true;const resized=await open(browser,origin,'reception');await edit(resized.page);
  await resized.page.locator('#editGuests').fill('10');await submit(resized.page);await saved(resized.page);
  await message(resized.page,'table 8');
  assert.equal(records[0].assignedTableId,'table-8');
  await resized.page.waitForFunction(()=>window.RestoSharedReservations?.find(r=>r.id==='fictional-hotel')?.tables?.includes(8));
  await edit(resized.page);await resized.page.locator('#editGuests').fill('2');
  await submit(resized.page);await saved(resized.page);await message(resized.page,'table 3');
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
   assert.equal(sidebarInfo.footerName,'À l’Épicerie');
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
   assert.equal(await view.page.locator('#teamVenue').innerText(),'À l’Épicerie');
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
    refresh:document.getElementById('refreshAppBtn').getBoundingClientRect().toJSON()
   }));
   assert.ok(headerLayout.scrollWidth<=headerLayout.viewport+1,'Header must not overflow viewport');
   assert.ok(headerLayout.refresh.width>=42,'Refresh button must keep its touch target');
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
   // Wait for the 230ms appScreenActive translateY entrance animation to finish.
   // Otherwise sequential boundingBox() calls capture different animation frames.
   await view.page.clock.runFor(330);
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
     installBox:bounds(root.querySelector('.reservationActionMain')),
     changeBox:bounds(root.querySelector('.reservationChangeTable')),
     cardBox:bounds(root.closest('.reservationItem'))
    };
   });
   assert.ok(editBox&&moreBox&&cardBox,'Edit and extra actions must remain visible');
   for(const rect of [editBox,moreBox]){
    assert.ok(rect.x>=cardBox.x-1&&rect.x+rect.width<=cardBox.x+cardBox.width+1,
     'Action must fit inside the reservation card');
   }
   if(role==='fb_admin'){
    assert.ok(installBox&&changeBox,'Restaurant install/change actions must be present');
    if(viewport.width>=750){
     for(const rect of [editBox,changeBox,moreBox])
      assert.ok(Math.abs(rect.y-installBox.y)<=2,JSON.stringify({message:'Tablet/desktop action misalignment',role,viewport,installBox,editBox,changeBox,moreBox}));
     assert.ok(installBox.x<editBox.x&&editBox.x<changeBox.x&&changeBox.x<moreBox.x,
      'Actions must follow install, edit, change table, extra order');
    }else{
     assert.ok(installBox.y+installBox.height<=editBox.y+2,
      'Mobile keeps main action above secondary actions');
    }
   }else{
    assert.equal(installBox,null,'Reception must not show install button');
    assert.equal(changeBox,null,'Reception must not show table-change button');
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
