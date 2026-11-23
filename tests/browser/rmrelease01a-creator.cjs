'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const release=JSON.parse(fs.readFileSync(path.join(root,'app-release.json'),'utf8'));
const runtime=JSON.parse(fs.readFileSync(path.join(root,'reservation/runtime.json'),'utf8'));
const requests=[],mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 requests.push(req.method+' '+req.url.split('?')[0]);
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400);return res.end();}
 if(pathname==='/reservation/runtime.json'){
  res.writeHead(200,{'Content-Type':'application/json'});
  return res.end(JSON.stringify({...runtime,publicOrigin:'http://127.0.0.1:'+server.address().port}));
 }
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
const stub=[
 'im'+'port {installCreatorConsole} from "./creator-console.js?v=20261114-rm006-root1";',
 'document.querySelector("#loginPanel").hidden=true;',
 'document.querySelector("#ownerPanel").hidden=false;',
 'const restaurants=[{id:"r-one",name:"À l’Épicerie — Mercure Rouen"},{id:"r-two",name:"Le Jardin"}];',
 'const reports=[{id:"p-1",status:"new",severity:"urgent",created_at:"2026-11-23T12:00:00Z"}];',
 'const client={from(table){',
 'if(table==="restaurants")return {select(){return {order(){return Promise.resolve({data:restaurants,error:null});}}}};',
 'if(table==="platform_reports")return {select(){return {order(){return {limit(){return Promise.resolve({data:reports,error:null});}}}}}};',
 'throw new Error("Unexpected table: "+table);',
 '}};',
 'installCreatorConsole({client,installOwnerInbox:()=>{}});'
].join('\n');
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const width of [390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:860},locale:'fr-FR',serviceWorkers:'block'});
   const page=await context.newPage(),errors=[],external=[],writes=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',req=>{if(!req.url().startsWith(origin+'/'))external.push(req.url());if(req.method()!=='GET')writes.push(req.url());});
   await page.route('**/creator-auth.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:stub}));
   await page.route('**/creator-console.js?v=20261114-rm006-root1',route=>route.abort('failed'));
   // The inline import map must point the unchanged PROD Auth import to the new revision.
   async function go(view){
    if(width<=760)await page.locator('#ownerNavToggle').click();
    await page.locator('[data-owner-nav="'+view+'"]').first().click();
    await page.locator('[data-owner-section="'+view+'"]').waitFor({state:'visible'});
   }
   await page.goto(origin+'/creator.html',{waitUntil:'load'});
   await page.waitForFunction(()=>document.getElementById('ownerTotalRestaurants')?.textContent==='2');
   assert.equal(await page.locator('#ownerNewReports').textContent(),'1');
   await go('restaurants');
   const search=page.locator('#ownerRestaurantSearch');
   await search.fill('epicerie');
   assert.match(await page.locator('#ownerRestaurantCount').innerText(),/1 établissement/);
   assert.equal(await page.locator('#ownerRestaurantList .ownerRestaurantRow').count(),1);
   assert.match(await page.locator('#ownerRestaurantList').innerText(),/Mercure Rouen/);
   await search.fill('r-two');
   assert.match(await page.locator('#ownerRestaurantList').innerText(),/Le Jardin/);
   await search.fill('introuvable');
   assert.match(await page.locator('#ownerRestaurantList').innerText(),/Aucun établissement ne correspond/);
   await search.fill('');
   assert.equal(await page.locator('#ownerRestaurantList .ownerRestaurantRow').count(),2);
   await go('publications');
   await page.waitForFunction(()=>document.getElementById('ownerReleaseVersion')?.textContent.includes('2026.'));
   assert.equal(await page.locator('#ownerReleaseVersion').textContent(),release.currentVersion);
   assert.match(await page.locator('#ownerPortalConfigured').textContent(),/Portail technique configuré/);
   assert.match(await page.locator('#ownerPublicationStatus').textContent(),/Aucun contrôle de disponibilité serveur/);
   await page.route('**/reservation/runtime.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...runtime,channel:'dev'})}));
   await page.locator('#ownerRefreshPublication').click();
   await page.waitForFunction(()=>document.getElementById('ownerPublicationStatus')?.textContent.includes('Statut non vérifiable'));
   assert.match(await page.locator('#ownerPortalConfigured').textContent(),/Non vérifié/);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=1,'overflow '+width+'px '+overflow);
   assert.deepEqual(errors,[]);
   assert.deepEqual(external,[]);
   assert.deepEqual(writes,[]);
   await context.close();
   console.log('PASS Root search, publication overview, no writes '+width+'px');
  }
  assert.ok(requests.every(req=>req.startsWith('GET ')));
  console.log('PASS RM-RELEASE-01A responsive integration');
 }catch(error){console.error(error.stack||error);process.exitCode=1;}
 finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})();
