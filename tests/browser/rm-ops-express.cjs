'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const out=process.env.BROWSER_ARTIFACTS||path.join(root,'test-results/rm-ops-express');
const iso='2032-11-08',time=new Date(iso+'T18:44:00Z');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const makeRow=(room,when)=>({id:id(room),guest_name:room===214?'Dupont DEV fictif':'Martin DEV fictif',hotel_room:String(room),party_size:2,
 starts_at:iso+'T'+when+':00Z',ends_at:iso+'T20:48:00Z',status:'reserved',notes:'',edit_version:id(room+1000)});
let liveRows=[makeRow(214,'18:48'),makeRow(215,'18:49')],revision=0;
function makeSnapshot(){
 return {revision:String(++revision),syncSequence:revision,capabilities:{reservation_edits:4,booking_recovery:1,snapshot:1},
  hours:{lunch_enabled:true,lunch_start:'12:00:00',lunch_end:'14:00:00',dinner_enabled:true,dinner_start:'19:00:00',dinner_end:'23:00:00',duration:90,arrival_limit_percent:70},
  rooms:[{id:id(1),name:'Salle principale',active:true}],tables:[{id:id(4),label:'Table 4',seats:2,active:true,room_id:id(1)},{id:id(21),label:'Table 21',seats:2,active:true,room_id:id(1)}],
  reservations:liveRows,assignments:liveRows.map(row=>({reservation_id:row.id,table_id:id(row.hotel_room==='214'?21:4)})),holds:[],serviceClosures:[],fusionLinks:[]};
}

const bridge=`
export async function requireStaff(){return {user:{id:'fictional-user'},profile:{role:window.__opsRole,active:true,display_name:'Équipe fictive',restaurant_id:'fixture-ops'}}}
export async function loadSharedService(){return window.__opsSnapshot()}
export async function subscribeSharedService(onSnapshot,onError,onConnection){const apply=async()=>{onConnection(true);onSnapshot(await loadSharedService());};window.addEventListener('fixture:push',apply);window.addEventListener('online',apply);await apply();return ()=>{}}
function query(){const q={then:(yes,no)=>Promise.resolve({data:[],error:null}).then(yes,no)};for(const name of ['select','eq','order','limit','range','in','is','single','maybeSingle','gte','lte'])q[name]=()=>q;return q}
export const supabase={from:query,rpc:async(name)=>{if(name==='booking_draft_v3')return {data:{tables:[],holds:[],seconds:180},error:null};await window.__opsWrite(name);throw Error('Unexpected write');},auth:{getUser:async()=>({data:{user:{id:'fictional-user'}}}),signOut:async()=>({error:null})},removeChannel:async()=>{},channel:()=>({on(){return this},subscribe(){return this}})};`;
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
async function newPage(context,role='fb_admin'){
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(role=>{window.__opsRole=role;},role);
 await page.exposeFunction('__opsSnapshot',makeSnapshot);await page.exposeFunction('__opsWrite',name=>writes.push(name));
 await page.clock.install({time});await page.goto(origin+'/v3-connected.html');
 await page.waitForFunction(()=>window.RestoSharedDataLoaded===true);
 const welcome=page.locator('#restoTourWelcome');if(await welcome.isVisible())await page.getByRole('button',{name:'Plus tard',exact:true}).click();
 return page;
}
const express=page=>page.locator('#rmExpress');
async function enter(page){await page.getByRole('button',{name:'Mode Coup de feu',exact:true}).click();await express(page).waitFor();}
async function simulation(page){await enter(page);await express(page).getByRole('button',{name:'Simuler un service'}).click();await express(page).getByText('Simulation · données fictives').waitFor();}
async function select(page,room){const view=express(page);await view.getByRole('searchbox').fill(room);await view.locator('[data-arrivals]').getByRole('button',{name:new RegExp(`Ch. ${room}`)}).click();}
async function option(page,number){await express(page).locator('[data-suggestions]').getByRole('button',{name:new RegExp(`^T${number} `)}).click();}
async function validateAxe(page){
 await page.addScriptTag({url:origin+'/__axe.js'});
 const violations=await page.evaluate(async()=> (await window.axe.run('#rmExpress',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>[v.id,v.nodes.map(n=>n.target)]));
 assert.deepEqual(violations,[]);
}

(async()=>{
 try{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();
  for(const width of [360,390,768,834,1440]){
   const context=await newContext(width),page=await newPage(context),view=express(page);
   await page.evaluate(()=>window.RestoScreens.show('reservationForm'));
   const draft=page.locator('#bookingClient');await draft.fill('Brouillon fictif');
   await simulation(page);await select(page,'214');
   await view.getByRole('button',{name:'Je l’accompagne'}).click();
   await view.locator('[data-handoffs]').getByRole('button',{name:/Ch. 214/}).waitFor();
   await option(page,4);await view.getByText('Ch. 215 passera de T4 à T21.').waitFor();
   assert.equal(await view.locator('[data-suggestions] button').count(),2);
   await view.getByText('Autre table',{exact:true}).click();assert.ok(await view.locator('[data-all-tables] button').count()>10);
   if(width===834){
    await view.locator('[data-all-tables]').getByRole('button',{name:/^T16 /}).click();
    await view.getByRole('button',{name:'Installer 214 en T16'}).waitFor();
    await view.getByText(/Changement de salle pour le client/).waitFor();
    await option(page,4);
   }
   await view.getByText('Autre table',{exact:true}).click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
   await validateAxe(page);
   await page.screenshot({path:path.join(out,`express-${width}.png`),fullPage:true,animations:'disabled'});
   if(width===834){
    await page.evaluate(()=>document.documentElement.dataset.theme='dark');await validateAxe(page);
    await page.screenshot({path:path.join(out,'express-834-sombre.png'),fullPage:true,animations:'disabled'});
    await page.evaluate(()=>document.documentElement.dataset.theme='light');
   }
   await view.getByRole('button',{name:'Mode complet',exact:true}).click();assert.equal(await draft.inputValue(),'Brouillon fictif');
   await enter(page);
   await view.getByRole('button',{name:'Installer 214 en T4'}).click();
   await view.getByText('Simulation · installation enregistrée en T4.').waitFor();
   await select(page,'215');await view.locator('[data-suggestions]').getByRole('button',{name:/T21 Prévue/}).waitFor();
   await view.getByRole('button',{name:'Passage',exact:true}).click();
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
  assert.equal(await reception.getByRole('button',{name:'Mode Coup de feu',exact:true}).count(),0);
  await enter(restaurant);await select(restaurant,'214');
  const view=express(restaurant);await view.getByRole('heading',{name:/Dupont DEV fictif/}).waitFor();
  assert.ok(await view.getByRole('button',{name:'Passage',exact:true}).isDisabled());
  liveRows=[{...liveRows[0],guest_name:'Dupont après synchronisation'},liveRows[1]];
  await restaurant.evaluate(()=>dispatchEvent(new Event('fixture:push')));
  await view.getByRole('heading',{name:/Dupont après synchronisation/}).waitFor();
  assert.equal(await view.getByRole('searchbox').inputValue(),'214');
  assert.equal(await view.getByRole('button',{name:/Installer/}).count(),0);
  await staffContext.close();console.log('PASS Express lecture du snapshot et séparation Restaurant / Réception');
  assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
