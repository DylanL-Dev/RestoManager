'use strict';
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const crypto=require('node:crypto');
const assert=require('node:assert/strict');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=process.env.BROWSER_ARTIFACTS;
const decoder=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'reservation-details.js'))).toString('base64'));
let sequence=0,records=[],calls=[],passed=0,lostResponse=false;const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
const time=hour=>day+'T'+hour+':00Z';
function reset(){
 calls=[];lostResponse=false;records=[
  {id:'fictional-hotel',guest_name:'101',hotel_room:'101',party_size:2,starts_at:time('11:00'),ends_at:time('12:30'),status:'reserved',notes:'Note fictive\nALLERGIES À VÉRIFIER : Noix\n[RESTOMANAGER:HOTEL]',edit_version:crypto.randomUUID()},
  {id:'fictional-exterior',guest_name:'Client extérieur fictif',hotel_room:null,party_size:2,starts_at:time('11:00'),ends_at:time('12:30'),status:'reserved',notes:'Note extérieure fictive\nALLERGIES À VÉRIFIER : Lait\n[RESTOMANAGER:EXTERIEUR]',edit_version:crypto.randomUUID()}
 ];
}
function snapshot(){return {
 syncSequence:++sequence,hours:{lunch_enabled:true,lunch_start:'11:00:00',lunch_end:'15:00:00',dinner_enabled:true,dinner_start:'18:00:00',dinner_end:'23:00:00',duration:90},
 rooms:[{id:'fictional-room',name:'Salle fictive',active:true,sort_order:0}],
 tables:Array.from({length:6},(_,i)=>({id:'table-'+(i+1),label:String(i+1),seats:6,active:true,room_id:'fictional-room'})),
 reservations:structuredClone(records),assignments:records.map((r,i)=>({reservation_id:r.id,table_id:'table-'+(i+1)})),holds:[],fusionLinks:[]
}}
async function rpc(role,name,args){
 calls.push({role,name,args:structuredClone(args)});
 if(name==='booking_draft_v3')return {data:{tables:[],holds:[],seconds:180},error:null};
 const r=records.find(r=>r.id===args.p_reservation_id);
 if(!r)return {data:null,error:{code:'P0002',message:'Réservation introuvable'}};
 if(!(['update_reservation_v4','reception_update_reservation_v4'].includes(name)))throw Error('Unexpected RPC '+name);
 assert.equal(name,role==='reception'?'reception_update_reservation_v4':'update_reservation_v4');
 if(r.edit_version!==args.p_expected_version)return {data:null,error:{code:'RM001',message:'Réservation modifiée'}};
 Object.assign(r,{guest_name:args.p_guest_name,hotel_room:args.p_hotel_room,party_size:args.p_party_size,
  starts_at:args.p_starts_at,ends_at:args.p_ends_at,notes:args.p_notes,edit_version:crypto.randomUUID()});
 if(lostResponse){lostResponse=false;return {data:null,error:{code:'NETWORK',message:'Response lost after commit'}}}
 return {data:role==='reception'?{tables:['table-'+(records.indexOf(r)+1)],edit_version:r.edit_version}:r.edit_version,error:null};
}
async function open(browser,url,role){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.addInitScript(role=>{window.__mission2Role=role},role);
 await context.exposeFunction('__mission2Snapshot',snapshot);
 await context.exposeFunction('__mission2Rpc',(name,args)=>rpc(role,name,args));
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==url)return route.abort();
  if(u.pathname==='/supabase-service-bridge.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'mission2-bridge.mjs'),'utf8')});
  return route.continue();
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/v3-connected.html');await page.waitForFunction(()=>window.RestoSupabaseReady===true);
 await page.evaluate(()=>window.RestoScreens.show('reservations'));await page.locator('#reservationShowAll').click();
 return {context,page,errors};
}
async function edit(page,n=0){
 await page.locator('[data-reservation-action=edit]').nth(n).click();await page.locator('#editForm').waitFor({state:'visible'});
 const dateLabel=await page.locator('#editDate').locator('..').innerText();assert.ok(!dateLabel.includes('Choisir une date'),'populated edit date is visible in the custom picker');
}
async function submit(page){await page.locator('#editForm button[type=submit]').click();}
async function saved(page){await page.waitForFunction(()=>document.getElementById('editForm').hidden===true);}
const server=http.createServer((req,response)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)||file.includes(path.sep+'.git'+path.sep)){response.writeHead(404);response.end();return}
 fs.readFile(file,(error,data)=>{if(error){response.writeHead(404);response.end();return}
  const ext=path.extname(file);response.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[ext]||'application/octet-stream');response.end(data);
 });
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  for(const role of ['fb_admin','reception']){
   reset();const {context,page,errors}=await open(browser,url,role);await edit(page);
   const openedVersion=records[0].edit_version;await page.locator('#editHotelRoom').fill('202');await submit(page);await saved(page);
   assert.equal(records[0].hotel_room,'202');assert.equal(records[0].guest_name,'202');assert.match(records[0].notes,/Noix/);assert.match(records[0].notes,/Note fictive/);
   assert.equal(calls.find(c=>c.name.includes('reservation_v4')).args.p_expected_version,openedVersion);
   await page.locator('#reservationQuery').fill('202');await page.waitForFunction(()=>document.querySelectorAll('.reservationItem').length===1);assert.match(await page.locator('.reservationItem').innerText(),/Chambre 202/);
   if(role==='fb_admin'){
    await page.evaluate(start=>{
     window.RestoMarkFbAlertRead=async()=>{};
     window.RestoFbReservationAlerts=[{id:'fictional-old-alert',reservation_id:'fictional-hotel',guest_name:'101',hotel_room:'101',party_size:2,starts_at:start,read_at:null}];
     window.dispatchEvent(new Event('restomanager:fb-alerts'));
    },records[0].starts_at);
    await page.locator('.serviceBell').click();const alert=page.locator('.serviceReceptionBookingAlert');
    assert.match(await alert.innerText(),/Chambre 202/);await alert.getByRole('button',{name:'Voir la réservation',exact:true}).click();
    assert.equal(await page.locator('#reservationQuery').inputValue(),'202');assert.match(await page.locator('.reservationExpanded').innerText(),/Suivi/);
    passed++;console.log('PASS unread old notification resolves updated room for display and search');
   }
   await page.locator('#reservationQuery').fill('');await edit(page,1);assert.ok(await page.locator('#editHotelRoomField').isHidden());
   await page.locator('#editClient').fill('755');await page.locator('#editNotes').fill('Extérieur modifié');await page.locator('#editAllergies').fill('Lait conservé');await submit(page);await saved(page);
   const details=(await decoder).decodeBookingDetails(records[1].notes,records[1].hotel_room);
   assert.equal(records[1].hotel_room,null);assert.equal(details.type,'exterieur');assert.equal(details.allergies,'Lait conservé');
   assert.deepEqual(errors,[]);await context.close();passed+=2;console.log('PASS '+role+': hotel room/search and exterior/notes/allergies');
  }
  for(const role of ['fb_admin','reception']){
   reset();const {context,page,errors}=await open(browser,url,role);await edit(page);
   const version=records[0].edit_version;await page.locator('#editNotes').fill('Saisie avant coupure');lostResponse=true;
   await submit(page);await page.waitForFunction(()=>document.getElementById('reservationMessage').textContent.includes('Enregistrement non confirmé'));
   assert.equal(await page.locator('#editNotes').inputValue(),'Saisie avant coupure');assert.ok(await page.locator('#editForm').isVisible());
   assert.notEqual(records[0].edit_version,version);
   await context.setOffline(true);await page.waitForFunction(()=>window.RestoSupabaseReady===false);
   await context.setOffline(false);await page.waitForFunction(()=>window.RestoSupabaseReady===true);
   const committed=structuredClone(records[0]);await submit(page);await page.waitForFunction(()=>document.getElementById('reservationMessage').textContent.includes('votre saisie est conservée'));
   assert.deepEqual(records[0],committed);assert.equal(await page.locator('#editNotes').inputValue(),'Saisie avant coupure');
   await page.locator('#editReviewCurrent').click();await page.waitForFunction(()=>document.getElementById('editCurrentValues').textContent.includes('Saisie avant coupure'));
   assert.deepEqual(errors,[]);await context.close();passed++;console.log('PASS '+role+': response lost after commit, reconnect and retry preserve draft and refuse stale version');
  }
  for(const pair of [['fb_admin','reception'],['reception','fb_admin']]){
   reset();const a=await open(browser,url,pair[0]),b=await open(browser,url,pair[1]);await edit(a.page);await edit(b.page);
   const openedVersion=records[0].edit_version;
   await b.page.locator('#editClient').fill('Saisie non enregistrée B');await b.page.locator('#editNotes').fill('Brouillon B conservé');
   await a.page.locator('#editAllergies').fill('Arachide ajoutée par A');await submit(a.page);await saved(a.page);
   // A fresh shared snapshot must NOT replace B's captured editor version or inputs.
   await b.page.evaluate(()=>window.RestoRefreshSharedService());await b.page.locator('#editConflict').waitFor({state:'visible'});
   assert.equal(await b.page.locator('#editNotes').inputValue(),'Brouillon B conservé');
   await b.context.setOffline(true);await b.page.waitForFunction(()=>window.RestoSupabaseReady===false);
   await b.context.setOffline(false);await b.page.waitForFunction(()=>window.RestoSupabaseReady===true);
   await submit(b.page);await b.page.waitForFunction(()=>document.getElementById('reservationMessage').textContent.includes('votre saisie est conservée'));
   const stale=calls.filter(c=>c.role===pair[1]&&c.name.includes('reservation_v4')).at(-1);assert.equal(stale.args.p_expected_version,openedVersion);
   assert.equal(await b.page.locator('#editClient').inputValue(),'Saisie non enregistrée B');assert.equal(await b.page.locator('#editNotes').inputValue(),'Brouillon B conservé');assert.match(records[0].notes,/Arachide ajoutée par A/);
   await b.page.locator('#editReviewCurrent').click();await b.page.waitForFunction(()=>document.getElementById('editCurrentValues').textContent.includes('Arachide ajoutée par A'));
   assert.equal(await b.page.locator('#editNotes').inputValue(),'Brouillon B conservé');
   if(out){fs.mkdirSync(out,{recursive:true});await b.page.screenshot({path:path.join(out,'conflict-'+pair.join('-')+'.png'),fullPage:true})}
   await b.page.locator('#editReloadCurrent').click();await b.page.getByRole('button',{name:'Remplacer ma saisie',exact:true}).click();
   await b.page.waitForFunction(()=>document.getElementById('editConflict').hidden===true);
   assert.equal(await b.page.locator('#editAllergies').inputValue(),'Arachide ajoutée par A');
   await b.page.locator('#editClient').fill('Nom validé après consultation');await submit(b.page);await saved(b.page);
   assert.equal(records[0].guest_name,'Nom validé après consultation');assert.match(records[0].notes,/Arachide ajoutée par A/);
   assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);await a.context.close();await b.context.close();
   passed+=3;console.log('PASS '+pair.join(' / ')+': conflict, reconnect preserving draft/version, explicit review/reload then save');
  }
  console.log(JSON.stringify({passed,failed:0,backend:'in-memory mock; external network blocked',roles:['fb_admin','reception']}));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
