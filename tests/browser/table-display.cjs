'use strict';
// Rendering regression only. No shared credentials, data or remote requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');const assert=require('node:assert/strict');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'../..');
const out=process.env.BROWSER_ARTIFACTS;const day='2032-11-08';let calls=0,sequence=0;
const id=(kind,n)=>kind+'0000000-0000-4000-8000-'+String(n).padStart(12,'0');
function snapshot(mode){const result={syncSequence:++sequence,revision:'10',capabilities:mode==='readonly'?{}:{reservation_edits:4,booking_recovery:1,snapshot:1},
 hours:{lunch_enabled:true,lunch_start:'11:00:00',lunch_end:'15:00:00',dinner_enabled:true,dinner_start:'18:00:00',dinner_end:'23:00:00',duration:90},
 rooms:[{id:id('3',1),name:'Salle principale',active:true,sort_order:0}],
 tables:Array.from({length:23},(_,i)=>({id:id('4',i+1),label:'Table '+(i+1),seats:4,active:i<22,room_id:id('3',1)})),
 reservations:[{id:id('5',1),guest_name:'Arrivée fictive',hotel_room:null,party_size:2,starts_at:day+'T11:30:00Z',ends_at:day+'T13:00:00Z',status:'reserved',notes:'[RESTOMANAGER:EXTERIEUR]',edit_version:id('6',1)},
 {id:id('5',2),guest_name:'Client installé fictif',hotel_room:null,party_size:2,starts_at:day+'T10:30:00Z',ends_at:day+'T12:00:00Z',status:'seated',notes:'[RESTOMANAGER:EXTERIEUR]',edit_version:id('6',2)}],
 assignments:[{reservation_id:id('5',1),table_id:id('4',1)},{reservation_id:id('5',2),table_id:id('4',2)}],holds:[],fusionLinks:[]};if(mode==='empty-tables'){result.tables=[];result.reservations=[];result.assignments=[]}if(mode==='empty-arrivals'){result.reservations=[];result.assignments=[]}return result;}
const bridge=`
export async function requireStaff(){return {user:{id:'fictional-user'},profile:{role:window.__displayRole,active:true,display_name:'Équipe fictive'}}}
export async function loadSharedService(){if(window.__displayMode==='loading')return new Promise(()=>{});if(window.__displayMode==='error')throw Object.assign(Error('Forbidden fixture'),{code:'42501'});return window.__displaySnapshot(window.__displayMode)}
export async function subscribeSharedService(onSnapshot,onError,onConnection){const apply=async()=>{try{onConnection(true);onSnapshot(await loadSharedService())}catch(error){onError(error)}};window.addEventListener('online',apply);window.addEventListener('offline',()=>onConnection(false));window.addEventListener('display:push',apply);setTimeout(apply,0);return ()=>{}}
function query(){const q={then:(yes,no)=>Promise.resolve({data:[],error:null}).then(yes,no)};for(const n of ['select','eq','order','limit','range','in','is','single','maybeSingle','update','insert','delete','gte','lte','neq'])q[n]=()=>q;return q}
export const supabase={from:query,rpc:async()=>{await window.__displayRpc();throw Error('Unexpected write')},auth:{getUser:async()=>({data:{user:{id:'fictional-user'}}}),signOut:async()=>({error:null})},removeChannel:async()=>{},channel:()=>({on(){return this},subscribe(){return this}})};`;
const cache=new Map();
function asset(revision,file){const key=revision+'/'+file;if(cache.has(key))return cache.get(key);let data;
 try{data=revision==='baseline'?execFileSync('git',['show','4432417:'+file],{cwd:root,maxBuffer:10*1024*1024,stdio:['ignore','pipe','ignore']}):fs.readFileSync(path.join(root,file));}catch{return null}
 cache.set(key,data);return data;
}
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');const parts=decodeURIComponent(u.pathname).split('/').filter(Boolean),revision=parts.shift();const file=parts.join('/');
 if(!['baseline','current'].includes(revision)||file.split('/').some(p=>p==='..'||p.startsWith('.'))){res.writeHead(404);res.end();return}
 const data=asset(revision,file);if(!data){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);
});
async function open(browser,origin,{revision='current',mode='ready',width=390,role='fb_admin',fault=false}={}){
 const context=await browser.newContext({viewport:{width,height:width===390?844:width===768?1024:900},isMobile:width===390,hasTouch:width<=768,timezoneId:'Europe/Paris',serviceWorkers:'block'});
 await context.addInitScript(({mode,role})=>{window.__displayMode=mode;window.__displayRole=role},{mode,role});
 await context.exposeFunction('__displaySnapshot',snapshot);await context.exposeFunction('__displayRpc',()=>calls++);
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.endsWith('/supabase-service-bridge.js'))return route.fulfill({contentType:'text/javascript',body:bridge});
  if(fault&&u.pathname.endsWith('/booking-availability.js'))return route.fulfill({contentType:'text/javascript',body:'window.RestoAvailability={evaluate(){throw Error("Injected availability failure")},allowedAlternative(){return true}};'});
  return route.continue();});await context.routeWebSocket('**/*',ws=>ws.close());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(day+'T11:00:00Z')});await page.goto(origin+'/'+revision+'/v3-connected.html');
 await page.waitForFunction(()=>document.getElementById('manageNetwork'));return {context,page,errors};
}
const results=[];function pass(name){results.push({name,status:'passed'});console.log('PASS '+name)}
(async()=>{let browser;try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 if(process.argv.includes('--baseline'))for(const width of [390,768,1440]){
  const v=await open(browser,origin,{revision:'baseline',width});await v.page.waitForFunction(()=>window.RestoSupabaseReady===true);
  assert.ok(v.errors.some(x=>x.includes('mins is not defined')),v.errors.join(';'));
  assert.equal(await v.page.locator('#tableGrid').evaluate(e=>e.childElementCount),0);assert.equal(await v.page.locator('#currentOccupancy').innerText(),'');assert.equal(await v.page.locator('#upcoming').innerText(),'');
  const style=await v.page.locator('#tableGrid').evaluate(e=>({display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,opacity:getComputedStyle(e).opacity}));assert.equal(style.visibility,'visible');assert.notEqual(style.display,'none');assert.equal(style.opacity,'1');
  if(out){fs.mkdirSync(out,{recursive:true});await v.page.screenshot({path:path.join(out,'baseline-blank-'+width+'.png'),fullPage:true})}
  await v.context.close();pass('REPRODUCED published 4432417: missing mins aborts rendering; empty visible DOM '+width);
 }
 for(const role of ['fb_admin','reception'])for(const width of [390,768,1440]){
  const v=await open(browser,origin,{role,width});await v.page.waitForFunction(()=>window.RestoSupabaseReady===true);
  assert.equal(await v.page.locator('.tableCard').count(),22);await v.page.locator('.tableCard').first().waitFor({state:'visible'});
  assert.match(await v.page.locator('#upcoming').innerText(),/Arrivée fictive/);assert.match(await v.page.locator('#currentOccupancy').innerText(),/Occupation actuelle/);
  assert.ok(await v.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.deepEqual(v.errors,[]);
  for(const [filter,count] of [['free',20],['expected',1],['present',1],['all',22]]){await v.page.locator('#filters [data-filter='+filter+']').click();assert.equal(await v.page.locator('.tableCard').count(),count)}
  if(out){fs.mkdirSync(out,{recursive:true});await v.page.screenshot({path:path.join(out,'tables-'+role+'-'+width+'.png'),fullPage:true})}
  await v.context.close();pass('22 actual snapshot tables, upcoming arrivals and visible text '+role+' '+width);
 }
 for(const mode of ['empty-tables','empty-arrivals']){const v=await open(browser,origin,{mode});await v.page.waitForFunction(()=>window.RestoSupabaseReady);if(mode==='empty-tables'){assert.equal(await v.page.locator('.tableCard').count(),0);assert.match(await v.page.locator('#tableGrid').innerText(),/Aucune table active/)}else assert.equal(await v.page.locator('.tableCard').count(),22);assert.match(await v.page.locator('#upcoming').innerText(),/Aucune arrivée en attente/);assert.deepEqual(v.errors,[]);await v.context.close();pass('Confirmed '+mode+' has an explicit empty state');}
 for(const mode of ['loading','error']){
  const v=await open(browser,origin,{mode});await v.page.waitForFunction(mode=>document.getElementById('serviceDataStatus')?.dataset.state===mode,mode);
  assert.equal(await v.page.locator('.tableCard').count(),0);assert.ok((await v.page.locator('#tableGrid').innerText()).length>20);assert.ok((await v.page.locator('#upcoming').innerText()).length>15);assert.ok((await v.page.locator('#currentOccupancy').innerText()).length>15);
  if(mode==='error'){await v.page.evaluate(()=>window.__displayMode='ready');await v.page.locator('#serviceDataRetry').click();await v.page.waitForFunction(()=>window.RestoSupabaseReady);assert.equal(await v.page.locator('.tableCard').count(),22)}
  assert.deepEqual(v.errors,[]);await v.context.close();pass(mode+' is explicit, with no demo tables or blank panels'+(mode==='error'?' and retry recovers':''));
 }
 for(const role of ['fb_admin','reception']){
  const v=await open(browser,origin,{mode:'readonly',role});await v.page.waitForFunction(()=>window.RestoSharedDataLoaded===true);
  assert.equal(await v.page.locator('.tableCard').count(),22);assert.equal(await v.page.evaluate(()=>window.RestoSupabaseReady),false);assert.match(await v.page.locator('#serviceDataStatus').innerText(),/mise à jour/);
  const before=calls;await v.page.evaluate(()=>window.RestoScreens.show('reservationForm'));await v.page.locator('#bookingClient').fill('Fictif');assert.equal(await v.page.locator('#bookingForm button[type=submit]').isDisabled(),true);await v.page.locator('#bookingForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(calls,before);
  assert.deepEqual(v.errors,[]);await v.context.close();pass('Missing SQL capabilities preserve read-only tables and block writes '+role);
 }
 {const v=await open(browser,origin);await v.page.waitForFunction(()=>window.RestoSupabaseReady);await v.context.setOffline(true);await v.page.waitForFunction(()=>!window.RestoSupabaseReady);assert.equal(await v.page.locator('.tableCard').count(),22);assert.match(await v.page.locator('#serviceDataStatus').innerText(),/synchronisation|anciennes/);await v.context.setOffline(false);await v.page.waitForFunction(()=>window.RestoSupabaseReady);assert.deepEqual(v.errors,[]);await v.context.close();pass('Offline preserves last table snapshot, labels it stale, and reconnects');}
 {const v=await open(browser,origin,{fault:true});await v.page.waitForFunction(()=>window.RestoSupabaseReady);assert.equal(await v.page.locator('.tableCard').count(),22);assert.match(await v.page.locator('#availabilityInsight').innerText(),/disponibilités|Disponibilités/);assert.deepEqual(v.errors,[]);await v.context.close();pass('Availability failure cannot interrupt table or arrival rendering');}
 if(out)fs.writeFileSync(path.join(out,'table-display-results.json'),JSON.stringify({passed:results.length,failed:0,results},null,2));console.log(JSON.stringify({passed:results.length,failed:0,backend:'fictitious snapshot; all remote HTTP and WebSocket blocked'}));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}})().catch(e=>{console.error(e);process.exitCode=1});
