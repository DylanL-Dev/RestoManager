'use strict';
// RM-017.3.9 — isolated, read-only Root console smoke test.
// Uses fictional data and a mocked Supabase client; never authenticates or writes.
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const requests=[],errors=[];
const server=http.createServer((req,res)=>{
  requests.push({method:req.method,url:req.url});
  let url;
  try{url=new URL(req.url,'http://127.0.0.1')}catch{res.writeHead(400);return res.end()}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  fs.readFile(file,(err,bytes)=>{
    if(err){res.writeHead(404);return res.end()}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
    res.end(bytes);
  });
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({args:['--no-sandbox']});
  for(const width of [390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:900},locale:'fr-FR',serviceWorkers:'block'});
   await context.route('**/*',route=>{
    const request=route.request(),url=request.url();
    if(new URL(url).origin!==origin)return route.abort();
    // The shipped runtime uses the real DEV Render origin; tests use localhost.
    // Replace only the public, closed configuration with matching local origin.
    if(url===origin+'/rm017-runtime.json')return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({schema:2,channel:'dev',enabled:false,pilotOnly:true,
       confirmationEmailRequired:true,captchaRequired:true,redirectOrigin:origin,turnstileSiteKey:null})});
    // Disable real authentication; only fictional data is used.
    if(/\/creator-auth\.js(?:\?|$)/.test(url))
      return route.fulfill({status:200,contentType:'text/javascript',body:'// Auth disabled: isolated console test'});
    return route.continue();
   });
   const page=await context.newPage();
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin+'/creator.html');
   await page.evaluate(async()=>{
    const [{installCreatorConsole},{installOwnerInbox}]=await Promise.all([
     import('/creator-console.js'),import('/creator-admin.js')
    ]);
    const fixtures={
      restaurants:[
       {id:'fake-hotel',name:'Restaurant hôtel fictif'},
       {id:'fake-independent',name:'Restaurant indépendant fictif'}
      ],
      platform_reports:[],rm017_lifecycle_requests:[]
    };
    const client={from(table){
      if(!Object.hasOwn(fixtures,table))throw new Error('Unexpected table '+table);
      const result={data:fixtures[table].map(row=>({...row})),error:null};
      const query={
        select(){return query},order(){return query},limit(){return Promise.resolve(result)},
        then(onFulfilled,onRejected){return Promise.resolve(result).then(onFulfilled,onRejected)}
      };
      return query;
    }};
    document.getElementById('loginPanel').hidden=true;
    document.getElementById('ownerPanel').hidden=false;
    installCreatorConsole({client,installOwnerInbox});
   });
   await page.waitForFunction(()=>document.getElementById('ownerTotalRestaurants')?.textContent==='2');
   assert.equal(await page.locator('#ownerTotalRestaurants').innerText(),'2');
   for(const id of ['ownerNewReports','ownerReviewingReports','ownerUrgentReports'])
     assert.equal(await page.locator('#'+id).innerText(),'0',width+'px '+id);
   assert.match(await page.locator('#ownerLoadState').innerText(),/Mis à jour/);
   async function navigate(view){
     if(width<=760)await page.locator('#ownerNavToggle').click();
     await page.locator('#ownerSidebar [data-owner-nav="'+view+'"]').click();
     assert.equal(await page.locator('[data-owner-section="'+view+'"]').isVisible(),true,width+'px '+view);
     if(width<=760)assert.equal(await page.locator('#ownerNavToggle').getAttribute('aria-expanded'),'false');
     const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
     assert.ok(layout.scroll<=layout.width+1,width+'px '+view+' overflow: '+JSON.stringify(layout));
   }
   await navigate('restaurants');
   const restaurantList=await page.locator('#ownerRestaurantList').innerText();
   assert.match(restaurantList,/Restaurant hôtel fictif/);
   assert.match(restaurantList,/Restaurant indépendant fictif/);
   assert.equal(await page.locator('#ownerRestaurantList .ownerReadOnlyTag').count(),2);

   await navigate('reports');
   await page.locator('#ownerReportsFeedback').waitFor();
   await page.waitForFunction(()=>document.getElementById('ownerReportsFeedback')?.textContent.includes('0 signalement'));
   assert.match(await page.locator('#ownerInbox').innerText(),/Aucun signalement à traiter/);
   await page.getByRole('button',{name:'Tous',exact:true}).click();
   await page.waitForFunction(()=>document.getElementById('ownerReportsFeedback')?.textContent.includes('0 signalement'));
   assert.match(await page.locator('#ownerInbox').innerText(),/Aucun signalement dans cette catégorie/);

   await navigate('lifecycle');
   await page.waitForFunction(()=>document.getElementById('ownerLifecycleStatus')?.textContent.includes('0 demande(s)'));
   assert.match(await page.locator('#ownerLifecycleList').innerText(),/Aucune demande reçue/);

   await navigate('settings');
   assert.match(await page.locator('[data-owner-section="settings"]').innerText(),/platform_admin/);

   await navigate('monitoring');
   await page.waitForFunction(()=>document.getElementById('ownerMonitorWebState').dataset.state==='ok'&&document.getElementById('ownerMonitorDbState').dataset.state==='ok');
   assert.equal(await page.locator('#ownerMonitorUrgent').innerText(),'0');
   assert.match(await page.locator('[data-owner-section="monitoring"]').innerText(),/Diagnostic ponctuel/);

   await navigate('pilot');
   await page.waitForFunction(()=>document.getElementById('ownerPilotSummary')?.textContent.includes('Pilote fermé'));
   assert.match(await page.locator('#ownerPilotWebState').innerText(),/enabled=false/);
   assert.match(await page.locator('#ownerPilotCaptchaState').innerText(),/non prêt/);
   assert.match(await page.locator('[data-owner-section="pilot"]').innerText(),/verrou privé/i);
   assert.equal(await page.locator('[data-owner-section="pilot"] [data-enable-signups]').count(),0);
   if(width===390){
    // An enabled client flag is not proof of a secure operational pilot.
    await page.route('**/rm017-runtime.json',route=>route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({schema:2,channel:'dev',enabled:true,pilotOnly:true,confirmationEmailRequired:true,
       captchaRequired:true,redirectOrigin:origin,turnstileSiteKey:'0x4AAAAAAGLm9RaVvyWg-GtY'})}));
    await page.locator('#ownerRefreshPilot').click();
    await page.waitForFunction(()=>document.getElementById('ownerPilotSummary')?.textContent.includes('Activation côté interface'));
    assert.match(await page.locator('#ownerPilotStatusDetail').innerText(),/ne prouve ni les droits serveur/);
    assert.match(await page.locator('#ownerPilotCaptchaState').innerText(),/secret et les tests réels restent à vérifier/);
    // Invalid config must never be reported as a ready-to-use pilot.
    await page.unroute('**/rm017-runtime.json');
    await page.route('**/rm017-runtime.json',route=>route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({enabled:true,channel:'prod'})}));
    await page.locator('#ownerRefreshPilot').click();
    await page.waitForFunction(()=>document.getElementById('ownerPilotSummary')?.textContent.includes('Configuration à vérifier'));
    await page.unroute('**/rm017-runtime.json');
    await page.locator('#ownerRefreshPilot').click();
    await page.waitForFunction(()=>document.getElementById('ownerPilotSummary')?.textContent.includes('Pilote fermé'));
   }

   await navigate('dashboard');
   await page.locator('#ownerRefreshOverview').click();
   await page.waitForFunction(()=>document.getElementById('ownerTotalRestaurants')?.textContent==='2');
   await context.close();
   console.log('PASS RM-017.3.9 Root console navigation and read-only empty states '+width+'px');
  }
  assert.deepEqual(errors,[],'Browser errors');
  assert.ok(requests.every(request=>request.method==='GET'),'No server writes');
  console.log('PASS all Root tabs, 3 widths, fictional data, no backend access/writes');
 }catch(error){console.error(error.stack||error);process.exitCode=1}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})();
