'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const out=process.env.BROWSER_ARTIFACTS||path.join(root,'test-results/rm-ops-express');
const iso='2032-11-08',time=new Date(iso+'T18:44:00Z');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const tenantA='fixture-ops-a',tenantB='fixture-ops-b';
let refreshed=false,revision=0,rushFixture,rushVersion=0,rushTableMoved=false;
let releaseStatus='seated',releaseVersion=id(4215),releaseOwner=null,releaseWrites=0,releaseAttempts=0;
function makeSnapshot(tenant,change){
 const offset=tenant===tenantB?1000:0;
 const owned=row=>({...row,restaurant_id:tenant});
 const makeRow=(room,name,when)=>owned({id:id(offset+room),guest_name:name,hotel_room:String(room),party_size:2,
  starts_at:iso+'T'+when+':00Z',ends_at:iso+'T20:48:00Z',status:'reserved',notes:'',edit_version:id(offset+room+4000)});
 const salonActive=change!=='closed',onlyMain=change==='single';
 const rooms=[owned({id:id(offset+1),name:'Salle principale',active:true})];
 if(!onlyMain)rooms.push(
  owned({id:id(offset+2),name:'Salon',active:salonActive}),
  owned({id:id(offset+3),name:'Prestige',active:true}),
  owned({id:id(offset+5),name:'Salle fermée',active:false}));
 const table=(number,room,active=true)=>owned({id:id(offset+number+100),label:`Table ${number}`,seats:2,active,room_id:id(offset+room)});
 const tables=[table(4,1),table(21,1)];
 if(!onlyMain)tables.push(table(16,2),table(19,2,false),table(99,5));
 if(change==='mixed')tables.push({...table(102,1),restaurant_id:tenantA});
 const reservations=tenant===tenantB?[makeRow(214,'Leroy DEV fictif','18:51'),makeRow(215,'Bernard DEV fictif','18:33')]
  :[makeRow(214,refreshed?'Dupont après synchronisation':'Dupont DEV fictif','18:48'),makeRow(215,'Martin DEV fictif','18:49')];
 if(tenant===tenantB)Object.assign(reservations[1],{status:'seated',seated_at:iso+'T18:33:00Z'});
 const snapshot={revision:String(++revision),syncSequence:revision,capabilities:{reservation_edits:4,booking_recovery:1,snapshot:1},
  hours:owned({lunch_enabled:true,lunch_start:'12:00:00',lunch_end:'14:00:00',dinner_enabled:true,dinner_start:'19:00:00',dinner_end:'23:00:00',duration:90,arrival_limit_percent:tenant===tenantB?40:70}),
  rooms,tables,reservations,assignments:reservations.map(row=>owned({reservation_id:row.id,table_id:id(offset+100+(row.hotel_room==='215'?4:21))})),
  holds:[],serviceClosures:[],fusionLinks:[]};
 if(change==='quick-release'||change==='departure'){
  if(change==='quick-release')snapshot.capabilities.quick_release=1;
  Object.assign(reservations[1],{status:releaseStatus,edit_version:releaseVersion,seated_at:iso+'T17:05:00Z',ends_at:iso+'T20:19:00Z'});
 }
 if(change!=='rush')return snapshot;
 const roomIds=new Map(rushFixture.rooms.map((room,index)=>[room.id,id(index+1)]));
 const reservationId=row=>id(Number(row.id)+2000);
 return {...snapshot,capabilities:{...snapshot.capabilities,placement:4},
  rooms:rushFixture.rooms.map(room=>owned({id:roomIds.get(room.id),name:room.id==='verriere'?'Prestige':room.name,active:true})),
  tables:rushFixture.tables.map(table=>owned({id:id(table.number+100),label:`Table ${table.number}`,seats:table.capacity,active:true,
   room_id:roomIds.get(rushTableMoved&&table.number===16?'main':table.roomId)})),
  reservations:rushFixture.reservations.map(row=>{
   const start=Date.parse(`${row.date}T${row.time}:00+01:00`);
   return owned({id:reservationId(row),guest_name:row.client,hotel_room:row.hotelRoom,status:row.status,
    party_size:row.id==='215'&&rushVersion?1:row.guests,notes:'',seated_at:row.seatedAt,
    starts_at:new Date(start).toISOString(),ends_at:new Date(start+row.duration*60000).toISOString(),
    edit_version:id(Number(row.id)+3000+(row.id==='215'?rushVersion:0))});
  }),
  assignments:rushFixture.reservations.flatMap(row=>row.tables.map(n=>owned({reservation_id:reservationId(row),table_id:id(n+100)})))};
}

const bridge=`
export async function requireStaff(){return {user:{id:window.__opsTenant+'-user'},profile:{role:window.__opsRole,active:true,display_name:'Équipe fictive',restaurant_id:window.__opsTenant}}}
export async function loadSharedService(){return window.__opsSnapshot(window.__opsSnapshotTenant||window.__opsTenant,window.__opsChange)}
export async function subscribeSharedService(onSnapshot,onError,onConnection){const apply=async()=>onSnapshot(await loadSharedService());const reconnect=()=>{onConnection(true);return apply()};window.addEventListener('fixture:push',apply);window.addEventListener('online',reconnect);await reconnect();return ()=>{}}
function query(){const q={then:(yes,no)=>Promise.resolve({data:[],error:null}).then(yes,no)};for(const name of ['select','eq','order','limit','range','in','is','single','maybeSingle','gte','lte'])q[name]=()=>q;return q}
export const supabase={from:query,rpc:async(name,args)=>{if(name==='booking_draft_v3')return {data:{tables:[],holds:[],seconds:180},error:null};if(name==='quick_release_v1'&&window.__opsChange==='quick-release')return window.__opsRelease(args);await window.__opsWrite(name);throw Error('Unexpected write');},auth:{getUser:async()=>({data:{user:{id:window.__opsTenant+'-user'}}}),signOut:async()=>({error:null})},removeChannel:async()=>{},channel:()=>({on(){return this},subscribe(){return this}})};`;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
 if(req.method!=='GET'||file.split('/').some(part=>part.startsWith('.')))return res.writeHead(404).end();
 if(file==='supabase-service-bridge.js')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(bridge);
 if(file==='__axe.js')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(fs.readFileSync(require.resolve('axe-core/axe.min.js')));
 fs.readFile(path.join(root,file),(error,value)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(value));
});

let origin,browser;
const writes=[],external=[],errors=[];
async function newContext(width){
 const context=await browser.newContext({viewport:{width,height:width<700?844:950},serviceWorkers:'block',hasTouch:width<1100,isMobile:width<700,timezoneId:'Europe/Paris'});
 await context.route('**/*',route=>{
  if(new URL(route.request().url()).origin===origin&&route.request().method()==='GET')return route.continue();
  external.push(new URL(route.request().url()).pathname);return route.abort();
 });
 await context.routeWebSocket('**/*',websocket=>websocket.close());
 return context;
}
async function newPage(context,role='fb_admin',tenant=tenantA,change=null,hash=''){
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({role,tenant,change})=>{
  window.__opsRole=role;window.__opsTenant=tenant;window.__opsChange=change;
  window.__opsCsp=[];
  addEventListener('securitypolicyviolation',event=>window.__opsCsp.push(event.violatedDirective));
 },{role,tenant,change});
 await page.exposeFunction('__opsSnapshot',makeSnapshot);await page.exposeFunction('__opsWrite',name=>writes.push(name));
 if(change==='quick-release')await page.exposeFunction('__opsRelease',args=>{
  releaseAttempts++;
  assert.equal(args.p_reservation_id,id(215));
  assert.deepEqual(args.p_table_ids,[id(104)]);
  const expected=args.p_undo?'released':'seated';
  if(args.p_expected_version!==releaseVersion||releaseStatus!==expected||args.p_undo&&releaseOwner!==page)
   return {data:null,error:{code:'40001',message:'Ce client n’est plus installé sur ces tables. Vérifiez le plan.'}};
  releaseStatus=args.p_undo?'seated':'released';
  releaseVersion=id(4400+ ++releaseWrites);
  releaseOwner=args.p_undo?null:page;
  return {data:releaseVersion,error:null};
 });
 await page.clock.install({time});await page.goto(origin+'/v3-connected.html'+hash);
 await page.waitForFunction(()=>window.RestoSharedDataLoaded===true&&!!window.RestoPlacement);
 const welcome=page.locator('#restoTourWelcome');if(await welcome.isVisible())await page.getByRole('button',{name:'Plus tard',exact:true}).click();
 return page;
}
const express=page=>page.locator('#rmExpress');
const tabs=page=>express(page).getByRole('group',{name:'Filtrer les tables par salle'});
async function enter(page){
 const account=page.locator('#mobileAccountToggle');
 const touch=await account.isVisible();
 if(touch)await account.click();
 const scope=page.locator(touch?'#mobileAccountMenu':'.sidebar');
 const launch=scope.getByRole('button',{name:'Mode Coup de feu',exact:true});
 await launch.waitFor();
 assert.ok(await launch.evaluate((button,touch)=>button.getBoundingClientRect().height>=44&&
  button.querySelector('svg.lucide-icon')&&(!touch||button.nextElementSibling.id==='mobileAccountRefresh'),touch));
 await launch.press('Enter');
 await express(page).waitFor();
 assert.ok(await page.locator('#mobileAccountMenu').isHidden());
 assert.equal(await page.evaluate(()=>document.activeElement.id),'rmExpressTitle');
}
async function simulation(page){await enter(page);await express(page).getByRole('button',{name:'Simuler un service'}).click();await express(page).getByText('Simulation · données fictives').waitFor();}
async function select(page,room){const view=express(page);await view.getByRole('searchbox').fill(room);await view.locator('[data-arrivals]').getByRole('button',{name:new RegExp(`Ch. ${room}`)}).click();}
async function option(page,number){await express(page).locator('[data-suggestions]').getByRole('button',{name:new RegExp(`^T${number} `)}).click();}
async function validateAxe(page){
 await page.addScriptTag({url:origin+'/__axe.js'});
 const violations=await page.evaluate(async()=> (await window.axe.run('#rmExpress',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>[v.id,v.nodes.map(n=>n.target)]));
 assert.deepEqual(violations,[]);
}

const floor=page=>express(page).locator('details[data-floor]');
const floorTable=(page,number)=>floor(page).locator('.rmExpressTile').filter({has:page.getByText('T'+number,{exact:true})});
const departure=page=>page.locator('.cf-dep.cf-show');
async function openFloor(page){
 await express(page).locator('.cf-pulse').waitFor();
 if(!await floor(page).evaluate(details=>details.open))await floor(page).locator('summary').click();
}
async function openDeparture(page,number){
 const tile=floorTable(page,number).and(page.locator('[data-cf-arm]'));
 await tile.waitFor();
 await tile.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await tile.click();
 await departure(page).waitFor();
}
async function testCoupDeFeu(){
 for(const width of [320,375,768,1024,1440,1920]){
  const context=await newContext(width);
  const page=await newPage(context),view=express(page);
  await simulation(page);
  await page.locator('#rmExpress[data-rm-sim]').waitFor();
  await view.locator('.cf-pulse').waitFor();
  assert.deepEqual(await page.evaluate(()=>[window.RestoCF27.version,window.RestoCF27Departs.version]),['2027.4','2027.4']);
  assert.match(await view.getByText('Simulation · données fictives').evaluate(node=>getComputedStyle(node).backgroundImage),/repeating-linear-gradient/);
  await view.locator('[data-arrivals] [data-cf-split]').first().waitFor();
  await view.locator('[data-arrivals] [data-rm-group]').first().waitFor();
  await tabs(page).locator('button[data-express-free]').first().waitFor();
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`${width} px / ${theme}`);
  }
  if(width===320){
   await select(page,'214');
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#rmExpress [data-reservation]')).position==='fixed');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
  }
  if(width===375){
   await view.locator('#rmExpressTitle').focus();
   await page.keyboard.press('/');
   await page.keyboard.type('214');
   await page.keyboard.press('Enter');
   const panel=view.locator('[data-reservation]');
   await view.getByRole('heading',{name:/Dupont/}).waitFor();
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#rmExpress [data-reservation]')).position==='fixed');
   assert.ok(await panel.locator('.cf-handle').isVisible());
   await view.locator('[data-suggestions] button').first().focus();
   await page.keyboard.press('1');
   await page.waitForFunction(()=>document.activeElement?.dataset.action==='install');
   await page.keyboard.press('Enter');
   await view.getByText(/installation enregistrée/).waitFor();
   await view.getByRole('button',{name:'Passage',exact:true}).click();
   const passage=view.getByRole('region',{name:'Passage express'});
   const counts=passage.getByRole('group',{name:'Nombre de couverts'});
   assert.equal(await counts.getByRole('button').count(),8);
   await counts.getByRole('button',{name:'8 couverts'}).click();
   assert.equal(await passage.getByLabel('Couverts',{exact:true}).inputValue(),'8');
   await passage.getByRole('radio',{name:'Hôtel'}).click();
   await passage.getByLabel('Chambre (facultatif)').waitFor();
   await passage.getByRole('radio',{name:'Extérieur'}).click();
   assert.ok(await passage.getByLabel('Chambre (facultatif)').isHidden());
  }
  await page.screenshot({path:path.join(out,`coup-de-feu-2027-4-${width}.png`),animations:'disabled'});
  assert.deepEqual(await page.evaluate(()=>window.__opsCsp),[]);
  await context.close();
 }
 console.log('PASS Coup de feu v2027.4 : les six largeurs du guide, clair et sombre, clavier et passage');

 const context=await newContext(390);
 const first=await newPage(context),second=await newPage(context);
 await simulation(first);
 const storageKey='restomanager-express-fiction-v1:'+tenantA;
 await first.waitForFunction(key=>!!localStorage.getItem(key),storageKey);
 await first.evaluate(({key,date})=>{
  const saved=JSON.parse(localStorage.getItem(key));
  const party=(n,client,hotelRoom)=>({id:'depart-'+n,date,status:'seated',client,hotelRoom,duration:90,
   seatedAt:date+'T17:05:00Z',time:'18:05',tables:[n],guests:2});
  saved.reservations=[party(1,'Martin','237'),party(2,'Dubois','274')];
  localStorage.setItem(key,JSON.stringify(saved));
 },{key:storageKey,date:iso});
 await express(first).getByRole('button',{name:'Retour au service partagé'}).click();
 await express(first).getByRole('button',{name:'Simuler un service'}).click();
 await simulation(second);
 await express(first).getByRole('button',{name:/2 à vérifier.*voir les tables/i}).click();
 await first.waitForFunction(()=>document.activeElement?.querySelector('strong')?.textContent==='T1');
 for(const number of [1,2])assert.match(await floorTable(first,number).getAttribute('class'),/cf-attn/);
 await openFloor(second);
 await floorTable(first,1).click();
 await floorTable(second,1).click();
 await departure(first).getByText(/Martin · Ch. 237/).waitFor();
 await departure(first).getByText('+9 min',{exact:true}).waitFor();
 await first.keyboard.press('Enter');
 await first.locator('.cf-rel').getByText('T1 libérée',{exact:true}).waitFor();
 for(const page of [first,second]){
  await floorTable(page,1).getByText('Aucun client enregistré').waitFor({state:'attached'});
  await express(page).getByRole('button',{name:/1 à vérifier.*voir les tables/i}).waitFor();
 }
 await departure(second).getByRole('button',{name:'Libérer T1'}).press('Enter');
 await second.locator('.cf-rel[data-tone="err"]').getByText(/plus installé sur ces tables/).waitFor();
 assert.equal(await second.evaluate(key=>JSON.parse(localStorage.getItem(key)).revision,storageKey),1);
 await first.locator('.cf-rel').getByRole('button',{name:'Annuler'}).click();
 for(const page of [first,second])await floorTable(page,1).getByText('Départ à vérifier').waitFor();
 assert.equal(await second.evaluate(key=>JSON.parse(localStorage.getItem(key)).revision,storageKey),2);
 await context.close();
 console.log('PASS simulation : T1/T2, +9 min, libération et annulation persistantes, conflit dans un second onglet');

 const [tablet,phone]=await Promise.all([newContext(1024),newContext(390)]);
 const legacy=await newPage(tablet,'fb_admin',tenantA,'departure');
 await enter(legacy);await openFloor(legacy);await openDeparture(legacy,4);
 await departure(legacy).getByRole('button',{name:'Libérer en mode complet'}).click();
 await express(legacy).waitFor({state:'hidden'});
 assert.equal(releaseWrites,0);
 await legacy.close();
 const [deviceA,deviceB]=await Promise.all([newPage(tablet,'fb_admin',tenantA,'quick-release'),newPage(phone,'fb_admin',tenantA,'quick-release')]);
 for(const page of [deviceA,deviceB]){
  await enter(page);await openFloor(page);await openDeparture(page,4);
  await departure(page).getByRole('button',{name:'Libérer T4'}).waitFor();
 }
 await departure(deviceA).getByRole('button',{name:'Libérer T4'}).press('Enter');
 await deviceA.locator('.cf-rel').getByText('T4 libérée',{exact:true}).waitFor();
 await departure(deviceB).getByRole('button',{name:'Libérer T4'}).press('Enter');
 await deviceB.locator('.cf-rel[data-tone="err"]').getByText(/plus installé sur ces tables/).waitFor();
 assert.equal(releaseAttempts,2);
 assert.equal(releaseWrites,1);
 for(const page of [deviceA,deviceB])await floorTable(page,4).getByText('Aucun client enregistré').waitFor();
 await deviceA.locator('.cf-rel').getByRole('button',{name:'Annuler'}).click();
 await floorTable(deviceA,4).getByText('Départ à vérifier').waitFor();
 await deviceB.evaluate(()=>dispatchEvent(new Event('fixture:push')));
 await floorTable(deviceB,4).getByText('Départ à vérifier').waitFor();
 assert.equal(releaseWrites,2);
 await tablet.close();await phone.close();
 console.log('PASS parcours connecté isolé : deux contextes navigateur, rejet rouge et annulation avec RPC simulée');
}

(async()=>{
 try{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  const {makeSimulation}=await import('../../service-v3-express-simulation.mjs');rushFixture=makeSimulation();
  assert.equal(rushFixture.fixture.covers,200);
  browser=await chromium.launch();
  for(const width of [360,390,768,834,1440]){
   const context=await newContext(width),page=await newPage(context),view=express(page);
   assert.deepEqual(await page.evaluate(()=>[window.scrollY,location.hash]),[0,'']);
   assert.equal(await page.locator('main .rmExpressLaunch').count(),0);
   await page.getByRole('link',{name:'Voir les tables',exact:true}).click();
   await page.waitForFunction(()=>scrollY>0);
   await page.evaluate(()=>window.RestoScreens.show('reservationForm'));
   const draft=page.locator('#bookingClient');await draft.fill('Brouillon fictif');
   await simulation(page);await select(page,'214');
   await view.getByRole('button',{name:'Je l’accompagne'}).click();
   await view.locator('[data-handoffs]').getByRole('button',{name:/Ch. 214/}).waitFor();
   await option(page,4);await view.getByText('Ch. 215 passera de T4 à T21.').waitFor();
   assert.equal(await view.locator('[data-suggestions] button').count(),2);
   await view.getByText('Autre table',{exact:true}).click();assert.ok(await view.locator('[data-all-tables] button').count()>10);
   if([390,834,1440].includes(width)){
    await tabs(page).getByRole('button',{name:'Verrière',exact:true}).click();
    await view.getByText('Aucune table configurée',{exact:true}).waitFor();
    assert.equal(await view.getByRole('button',{name:/Installer 214/}).count(),0);
    await view.getByText('Aucune proposition compatible dans Verrière.').waitFor();
    if(width===390)await page.screenshot({path:path.join(out,'express-salles-390.png'),fullPage:true,animations:'disabled'});
    const others=view.getByRole('button',{name:'Voir les autres salles'});
    await others.click();assert.ok(await tabs(page).getByRole('button',{name:'Toutes les salles',pressed:true}).evaluate(button=>button===document.activeElement));
    await tabs(page).getByRole('button',{name:'Salon',exact:true}).focus();await page.keyboard.press('Enter');
    assert.equal(await view.getByRole('searchbox').inputValue(),'214');
    assert.ok(await view.getByRole('heading',{name:/Dupont/}).isVisible());
    await option(page,16);
    await view.getByRole('button',{name:'Installer 214 en T16'}).waitFor();
    await view.getByText(/Salle principale → Salon/).waitFor();
    assert.ok(await view.locator('[data-room-change] .lucide-icon').isVisible());
    assert.equal(await view.locator('[data-floor]').getByRole('heading',{name:'Salle principale'}).count(),0);
    await validateAxe(page);
    if(width===834){
     await view.getByText('Autre table',{exact:true}).click();
     await page.screenshot({path:path.join(out,'express-salles-834.png'),fullPage:true,animations:'disabled'});
    }
    await tabs(page).getByRole('button',{name:'Toutes les salles'}).click();
    await option(page,4);
   }
   if(await view.locator('[data-other-tables]').evaluate(details=>details.open))await view.getByText('Autre table',{exact:true}).click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
   await validateAxe(page);
   await page.screenshot({path:path.join(out,`express-${width}.png`),fullPage:true,animations:'disabled'});
   if(width===1440)await page.screenshot({path:path.join(out,'express-salles-1440.png'),fullPage:true,animations:'disabled'});
   if(width===834){
    await page.evaluate(()=>document.documentElement.dataset.theme='dark');await validateAxe(page);
    await page.screenshot({path:path.join(out,'express-834-sombre.png'),fullPage:true,animations:'disabled'});
    await page.evaluate(()=>document.documentElement.dataset.theme='light');
   }
   await view.getByRole('button',{name:'Mode complet',exact:true}).click();assert.equal(await draft.inputValue(),'Brouillon fictif');
   assert.ok(await page.locator(width<=900?'#mobileAccountToggle':'.sidebar .rmExpressLaunch').evaluate(button=>button===document.activeElement));
   await enter(page);
   await view.getByRole('button',{name:'Installer 214 en T4'}).click();
   await view.getByText('Simulation · installation enregistrée en T4.').waitFor();
   await select(page,'215');await view.locator('[data-suggestions]').getByRole('button',{name:/T21 Prévue/}).waitFor();
   await view.getByRole('button',{name:'Passage',exact:true}).click();
   if(width===834){
    const passage=view.getByRole('region',{name:'Passage express'});
    const guests=passage.getByRole('spinbutton',{name:'Couverts',exact:true});
    await guests.fill('3');
    await tabs(page).getByRole('button',{name:'Verrière',exact:true}).click();
    await passage.getByText('Aucune table compatible avec ce passage dans Verrière.').waitFor();
    assert.equal(await passage.getByRole('button',{name:/Installer/}).count(),0);
    await passage.getByRole('button',{name:'Voir les autres salles'}).click();
    assert.equal(await guests.inputValue(),'3');
    await guests.fill('2');
   }
   await view.locator('[data-passage-tables]').getByRole('button',{name:/^T16 /}).click();
   await view.getByRole('button',{name:'Installer 2 couverts en T16'}).click();
   await view.getByText('Simulation · passage installé en T16.').waitFor();
   await context.close();console.log(`PASS Express ${width} px : parcours 214/215, reprise, passage, axe, brouillon`);
  }

  const context=await newContext(834),a=await newPage(context),b=await newPage(context);
  await simulation(a);await simulation(b);
  await select(a,'214');await option(a,4);
  await select(b,'215');await option(b,4);
  await express(b).getByRole('button',{name:'Installer 215 en T4'}).click();
  await express(a).getByText(/Le placement a changé/).waitFor();
  assert.ok(await express(a).getByRole('heading',{name:/Ch. 214/}).isVisible());
  assert.equal(await express(a).getByRole('button',{name:'Installer 214 en T4'}).count(),0);
  await a.screenshot({path:path.join(out,'express-834-conflit.png'),fullPage:true,animations:'disabled'});
  await context.setOffline(true);await express(a).getByText(/Dernière vue en consultation/).waitFor();
  assert.ok(await express(a).getByRole('button',{name:'Passage',exact:true}).isDisabled());
  await context.setOffline(false);await express(a).getByRole('button',{name:'Passage',exact:true}).waitFor();
  assert.ok(await express(a).getByRole('heading',{name:/Ch. 214/}).isVisible());
  await context.close();console.log('PASS Express deux onglets : conflit, sélection préservée, coupure et retour');

  const staffContext=await newContext(834),restaurant=await newPage(staffContext),reception=await newPage(staffContext,'reception');
  await reception.locator('#mobileAccountToggle').click();
  assert.equal(await reception.getByRole('button',{name:'Mode Coup de feu',exact:true}).count(),0);
  const linked=await newPage(staffContext,'reception',tenantA,null,'#reservations');
  assert.deepEqual(await linked.evaluate(()=>[window.RestoScreens.current(),location.hash]),['reservations','#reservations']);
  await linked.close();
  await enter(restaurant);await select(restaurant,'214');
  const view=express(restaurant);await view.getByRole('heading',{name:/Dupont DEV fictif/}).waitFor();
  assert.ok(await view.getByRole('button',{name:'Aperçu passage',exact:true}).isEnabled());
  refreshed=true;
  await restaurant.evaluate(()=>dispatchEvent(new Event('fixture:push')));
  await view.getByRole('heading',{name:/Dupont après synchronisation/}).waitFor();
  assert.equal(await view.getByRole('searchbox').inputValue(),'214');
  assert.equal(await view.getByRole('button',{name:/Installer/}).count(),0);
  console.log('PASS Express lecture du snapshot et séparation Restaurant / Réception');

  const updatePlan=(page,mode)=>page.evaluate(mode=>{
   window.__opsChange=mode;dispatchEvent(new Event('fixture:push'));
  },mode);
  const floor=view.locator('[data-floor]');
  await tabs(restaurant).getByRole('button',{name:'Prestige',exact:true}).click();
  await floor.getByText('Aucune table configurée',{exact:true}).waitFor();
  assert.equal(await floor.locator('.rmExpressTile').count(),0);
  assert.equal(await tabs(restaurant).getByRole('button',{name:'Salle fermée'}).count(),0);
  await restaurant.screenshot({path:path.join(out,'express-salles-834-prestige.png'),fullPage:true,animations:'disabled'});
  await tabs(restaurant).getByRole('button',{name:'Salon',exact:true}).click();
  await floor.getByText(/1 table active \/ 2 tables configurées/).waitFor();
  assert.equal(await floor.locator('.rmExpressTile').count(),1);
  await staffContext.setOffline(true);await view.getByText(/Dernière vue en consultation/).waitFor();
  assert.ok(await tabs(restaurant).getByRole('button',{name:'Salon',pressed:true}).isVisible());
  await staffContext.setOffline(false);await view.locator('[data-sync]').getByText(/À jour/).waitFor();
  await tabs(restaurant).getByRole('button',{name:'Salon',pressed:true}).focus();
  await updatePlan(restaurant,'closed');
  await tabs(restaurant).getByRole('button',{name:'Toutes les salles',pressed:true}).waitFor();
  assert.ok(await tabs(restaurant).getByRole('button',{name:'Toutes les salles',pressed:true}).evaluate(button=>button===document.activeElement));
  assert.equal(await floor.getByRole('heading',{name:'Salon',exact:true}).count(),0);
  await updatePlan(restaurant,'single');
  await tabs(restaurant).getByRole('button',{name:'Prestige',exact:true}).waitFor({state:'hidden'});
  assert.equal(await tabs(restaurant).getByRole('button').count(),2);
  assert.equal(await view.getByRole('searchbox').inputValue(),'214');
  assert.ok(await view.getByRole('heading',{name:/Dupont après synchronisation/}).isVisible());
  await updatePlan(restaurant,null);
  await tabs(restaurant).getByRole('button',{name:'Prestige',exact:true}).waitFor();
  console.log('PASS Express salles actives, vide, désactivation Realtime, clavier, salle unique et reconnexion');

  const separate=await newPage(staffContext,'fb_admin',tenantB),otherView=express(separate);
  await enter(separate);await select(separate,'214');
  await otherView.getByRole('heading',{name:/Leroy DEV fictif/}).waitFor();
  assert.equal(await otherView.getByText(/Dupont/).count(),0);
  await otherView.getByText('Charge du service · 4 / 3 couverts',{exact:true}).waitFor();
  await view.getByText('Charge du service · 4 / 5 couverts',{exact:true}).waitFor();
  const tableFour=page=>express(page).locator('[data-floor] .rmExpressTile').filter({has:page.getByText('T4',{exact:true})});
  await openFloor(restaurant);
  await openFloor(separate);
  assert.match(await tableFour(restaurant).innerText(),/Prévue/);
  assert.match(await tableFour(separate).innerText(),/Installé déclaré/);

  await view.getByRole('button',{name:'Simuler un service'}).click();await select(restaurant,'214');
  await option(restaurant,4);await view.getByRole('button',{name:'Installer 214 en T4'}).click();
  await view.getByText('Simulation · installation enregistrée en T4.').waitFor();
  await select(restaurant,'215');await view.getByRole('button',{name:'Je l’accompagne'}).click();
  await tabs(restaurant).getByRole('button',{name:'Salon',exact:true}).click();
  await otherView.getByRole('button',{name:'Simuler un service'}).click();await select(separate,'214');
  await option(separate,4);await otherView.getByRole('button',{name:'Installer 214 en T4'}).waitFor();
  await restaurant.evaluate(tenant=>{
   window.__opsSnapshotTenant=window.__opsTenant;
   window.__opsTenant=tenant;
   window.RestoNotificationContext={...window.RestoNotificationContext,restaurantId:tenant,userId:tenant+'-user'};
   dispatchEvent(new Event('restomanager:notification-context'));
  },tenantB);
  await view.locator('[data-sync]').getByText('En attente des données').waitFor();
  assert.equal(await view.getByRole('searchbox').inputValue(),'');
  assert.equal(await tabs(restaurant).getByRole('button').count(),0);
  assert.doesNotMatch(await view.textContent(),/Dupont|Martin|4 \/ 5|215|Salon/);
  // A delayed snapshot from the old establishment and a mixed payload stay masked.
  const oldRevision=await restaurant.evaluate(()=>window.RestoServiceRevision);
  await updatePlan(restaurant,null);
  await restaurant.waitForFunction(({tenant,revision})=>window.RestoExpressSnapshotRestaurantId===tenant&&window.RestoServiceRevision!==revision,{tenant:tenantA,revision:oldRevision});
  assert.ok(await view.getByText('En attente des données').isVisible());
  assert.equal(await restaurant.evaluate(reservation=>window.RestoPlacement.preview(reservation,[4]).code,id(214)),'NOT_SYNCED');
  await restaurant.evaluate(()=>{window.__opsSnapshotTenant=null;});
  await updatePlan(restaurant,'mixed');
  await restaurant.waitForFunction(()=>window.RestoExpressSnapshotRestaurantId===null);
  assert.equal(await tabs(restaurant).getByRole('button').count(),0);
  await updatePlan(restaurant,null);
  await tabs(restaurant).getByRole('button',{name:'Toutes les salles',pressed:true}).waitFor();
  await select(restaurant,'214');
  await view.getByRole('heading',{name:/Leroy DEV fictif/}).waitFor();
  assert.match(await tableFour(restaurant).innerText(),/Installé déclaré/);
  assert.equal(await view.getByRole('button',{name:/Installer/}).count(),0);
  await staffContext.close();console.log('PASS Express deux établissements, mêmes salles et numéros, simulations isolées et changement de contexte');

  const tablet=await newContext(834),phone=await newContext(390);
  const [pupil,mobile]=await Promise.all([newPage(tablet,'fb_admin',tenantA,'rush'),newPage(phone,'fb_admin',tenantA,'rush')]);
  await pupil.evaluate(()=>window.RestoScreens.show('reservationForm'));
  const completeDraft=pupil.locator('#bookingClient');await completeDraft.fill('Brouillon de l’équipe');
  await Promise.all([enter(pupil),enter(mobile)]);
  await Promise.all([select(pupil,'214'),select(mobile,'215')]);
  const [shared,peer]=[express(pupil),express(mobile)];
  const t4=shared.locator('[data-suggestions]').getByRole('button',{name:/^T4 /});
  if(await t4.count())await t4.click();
  else{
   await shared.getByText('Autre table',{exact:true}).click();
   await shared.locator('[data-all-tables]').getByRole('button',{name:/^T4 /}).click();
  }
  await shared.getByText('Ch. 215 passera de T4 à T21.').waitFor();
  await option(mobile,4);
  await peer.getByText('Table proposée · T4').waitFor();
  for(const screen of [shared,peer])assert.equal(await screen.getByRole('button',{name:/Installer/}).count(),0);
  // An intervening change from a colleague invalidates both previews; the draft stays open.
  rushVersion++;
  await Promise.all([updatePlan(pupil,'rush'),updatePlan(mobile,'rush')]);
  for(const screen of [shared,peer])await screen.getByText(/Le placement a changé/).waitFor();
  await tabs(pupil).getByRole('button',{name:'Prestige',exact:true}).click();
  await shared.getByText('Aucune table configurée',{exact:true}).waitFor();
  await shared.getByRole('button',{name:'Voir les autres salles'}).click();
  await tabs(pupil).getByRole('button',{name:'Salon',exact:true}).click();
  await option(pupil,16);await shared.getByText(/Salle principale → Salon/).waitFor();
  await validateAxe(pupil);
  await pupil.screenshot({path:path.join(out,'express-integration-834-consultation.png'),fullPage:true,animations:'disabled'});
  rushTableMoved=true;await updatePlan(pupil,'rush');
  await shared.getByText(/Le placement a changé/).waitFor();
  assert.equal(await shared.getByText(/Salle principale → Salon/).isVisible(),false);
  await phone.setOffline(true);await peer.getByText(/Dernière vue en consultation/).waitFor();
  assert.ok(await peer.getByRole('button',{name:'Aperçu passage',exact:true}).isDisabled());
  await phone.setOffline(false);await peer.getByRole('button',{name:'Aperçu passage',exact:true}).click();
  const passagePreview=peer.getByRole('region',{name:'Passage express'});
  await passagePreview.getByRole('button',{name:/^T16 /}).click();
  assert.equal(await passagePreview.getByRole('button',{name:/Installer/}).count(),0);
  await shared.getByRole('button',{name:'Mode complet',exact:true}).click();
  assert.equal(await completeDraft.inputValue(),'Brouillon de l’équipe');
  await tablet.close();await phone.close();
  console.log('PASS Express + moteur : 200 couverts, téléphone et tablette, concurrence, panne, passage en aperçu et zéro écriture');
  await testCoupDeFeu();
  assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
