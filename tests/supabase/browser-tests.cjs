'use strict';
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const assert=require('node:assert/strict');const {chromium}=require('playwright');

module.exports=async function run({url,anonKey,accounts,root,sql,readOnlyPhase=false}){
 assert.equal(new URL(url).hostname,'127.0.0.1');
 const results=[];const contexts=[];let browser;let appUrl;
 const sdk=fs.readFileSync(require.resolve('@supabase/supabase-js').replace(/dist\/main\/index\.js$/,'dist/umd/supabase.js'),'utf8');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__sdk.mjs'){res.setHeader('Content-Type','text/javascript');res.end('export const createClient=globalThis.supabase.createClient;');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(root+path.sep)||/\/\.(git|env)(\/|$)/.test(file)){res.writeHead(404);res.end();return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}
   if(['supabase-service-bridge.js','supabase-login.js'].includes(path.basename(file))){
    data=Buffer.from(data.toString().replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^']+/,appUrl+'/__sdk.mjs').replaceAll('https://tnsrkargogckgtsxipwd.supabase.co',url).replace(/sb_publishable_[A-Za-z0-9_-]+/g,anonKey));
   }
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);
  });
 });
 async function open(account,loginUi=false){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});contexts.push(context);
  await context.addInitScript({content:sdk});
  if(!loginUi){const {data:{session}}=await account.client.auth.getSession();await context.addInitScript(session=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),session);}
  await context.route('**/*',route=>{const origin=new URL(route.request().url()).origin;return [appUrl,url].includes(origin)?route.continue():route.abort();});
  await context.routeWebSocket('**/*',ws=>{const origin=new URL(ws.url()).origin.replace(/^ws/,'http');if(origin!==url){ws.close();return;}ws.connectToServer();});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(loginUi){await page.goto(appUrl+'/login.html');await page.locator('#username').fill(account.role==='reception'?'reception':'admin-fb');await page.locator('#password').fill(account.password);await page.locator('#submit').click();await page.waitForURL('**/v3-connected.html');}
  else await page.goto(appUrl+'/v3-connected.html');
  await page.waitForFunction(readOnly=>readOnly?window.RestoSharedDataLoaded===true:window.RestoSupabaseReady===true,readOnlyPhase,{timeout:45000});
  return {context,page,errors};
 }
 async function edit(page){await page.evaluate(()=>window.RestoScreens.show('reservations'));await page.locator('#reservationShowAll').click();const card=page.locator('.reservationItem').filter({hasText:'Client fictif 1'});await card.locator('[data-reservation-action=edit]').click();await page.locator('#editForm').waitFor({state:'visible'});}
 function persist(){if(process.env.MISSION3_ARTIFACTS){fs.mkdirSync(process.env.MISSION3_ARTIFACTS,{recursive:true});fs.writeFileSync(path.join(process.env.MISSION3_ARTIFACTS,'real-browser-results.json'),JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,results},null,2));}}
 const passed=name=>{results.push({name,status:'passed'});persist();console.log('PASS '+name);};
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));appUrl='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  if(readOnlyPhase){
   for(const account of [accounts[0],accounts[2]]){
    const view=await open(account,true);
    assert.equal(await view.page.locator('.tableCard').count(),8);
    assert.equal(await view.page.evaluate(()=>window.RestoSupabaseReady),false);
    assert.match(await view.page.locator('#serviceDataStatus').innerText(),/mise à jour/);
    await view.page.evaluate(()=>window.RestoScreens.show('reservationForm'));
    assert.match(await view.page.locator('#availabilityInsight').innerText(),/mise à jour/);
    assert.equal(await view.page.locator('#bookingForm button[type=submit]').isDisabled(),true);
    assert.deepEqual(view.errors,[]);
    passed('Real pre-migration schema displays tables read-only and blocks writes: '+account.role);
   }
   return {passed:results.length,failed:0,results,backend:'real Auth/REST on original schema, before Mission 2 and Mission 3 migrations'};
  }
  const a=await open(accounts[0],true),b=await open(accounts[2],true);
  passed('Real login UI: Restaurant and Reception use distinct Auth accounts and sessions');
  await edit(a.page);await edit(b.page);
  await b.page.locator('#editClient').fill('Brouillon fictif B');await b.page.locator('#editNotes').fill('Saisie non enregistrée B');
  await a.page.locator('#editAllergies').fill('Arachide fictive ajoutée par A');await a.page.locator('#editHotelRoom').fill('REAL-202');
  await a.page.locator('#editForm button[type=submit]').click();await a.page.waitForFunction(()=>document.getElementById('editForm').hidden);
  // No manual refresh: the independent Reception context must receive Postgres Changes.
  await b.page.locator('#editConflict').waitFor({state:'visible',timeout:45000});
  assert.equal(await b.page.locator('#editNotes').inputValue(),'Saisie non enregistrée B');
  passed('Real WebSocket/Postgres Changes updates the other role and preserves its open draft');
  await b.context.setOffline(true);await b.page.waitForFunction(()=>window.RestoSupabaseReady===false);await b.context.setOffline(false);await b.page.waitForFunction(()=>window.RestoSupabaseReady===true);
  await b.page.locator('#editForm button[type=submit]').click();await b.page.waitForFunction(()=>document.getElementById('reservationMessage').textContent.includes('votre saisie est conservée'));
  assert.equal(await b.page.locator('#editClient').inputValue(),'Brouillon fictif B');
  const record=JSON.parse(await sql("select row_to_json(r) from public.reservations r where id='50000000-0000-4000-8000-000000000001';"));
  assert.equal(record.hotel_room,'REAL-202');assert.match(record.notes,/Arachide fictive ajoutée par A/);assert.equal(record.guest_name,'Client fictif 1');
  passed('Real stale edit after reconnect is refused; room, allergy and unsaved input survive');
  await b.page.locator('#editReviewCurrent').click();await b.page.waitForFunction(()=>document.getElementById('editCurrentValues').textContent.includes('Arachide fictive ajoutée par A'));
  await b.page.locator('#editReloadCurrent').click();await b.page.getByRole('button',{name:'Remplacer ma saisie',exact:true}).click();
  await b.page.waitForFunction(()=>document.getElementById('editConflict').hidden);assert.equal(await b.page.locator('#editHotelRoom').inputValue(),'REAL-202');
  await b.page.locator('#editClient').fill('Nom fictif après consultation');await b.page.locator('#editForm button[type=submit]').click();await b.page.waitForFunction(()=>document.getElementById('editForm').hidden);
  await a.page.waitForFunction(()=>window.RestoSharedReservations.some(r=>r.client==='Nom fictif après consultation'));
  passed('Explicit review/reload confirmation followed by a valid Reception edit synchronizes back');
  const foreign=await open(accounts[5]);
  assert.equal(await foreign.page.evaluate(()=>window.RestoSharedReservations.some(r=>r.id==='50000000-0000-4000-8000-000000000001')),false);
  assert.equal(await foreign.page.evaluate(()=>window.RestoSharedReservations.some(r=>r.id==='50000000-0000-4000-8000-000000000009')),true);
  passed('Independent second-restaurant browser receives only its authorized snapshot');
  for(const instance of [a,b,foreign])assert.deepEqual(instance.errors,[]);
  passed('Real browser contexts have no uncaught JavaScript errors');
  return {passed:results.length,failed:0,results,backend:'real Auth/REST/Realtime; application bridge unchanged except local URL/key and same-version SDK source'};
 }catch(error){
  results.push({name:'Remaining real browser flow',status:'failed',code:error.name||'ASSERTION'});persist();
  if(process.env.MISSION3_ARTIFACTS){
   try{const catalog=await sql("select nspname from pg_namespace where nspname like '%realtime%';select current_database();select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on p.pronamespace=n.oid where p.proname in ('list_changes','apply_rls');");fs.writeFileSync(path.join(process.env.MISSION3_ARTIFACTS,'realtime-test-catalog.txt'),catalog);}catch{/* Diagnostic metadata must never mask the test failure. */}
  }
  throw error;
 }
 finally{for(const context of contexts)await context.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
};
