'use strict';
/* Root list contract on 4 responsive widths. Auth is stubbed for UI only;
 * actual access control is asserted by tests/postgres/rm01732.cjs. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const widths=[360,390,768,1440],remote=[],writes=[],errors=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 if(req.method!=='GET')writes.push(req.method+' '+req.url);
 let url;try{url=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)}catch{res.writeHead(400);return res.end()}
 const file=path.resolve(root,'.'+url);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
 fs.readFile(file,(e,buf)=>{
  if(e){res.writeHead(404);return res.end()}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(buf)
 })
});
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({args:['--no-sandbox']});
  for(const width of widths){
   const context=await browser.newContext({viewport:{width,height:960},locale:'fr-FR',serviceWorkers:'block'});
   await context.route('**/*',route=>{
    const url=route.request().url();
    if(new URL(url).origin!==origin){remote.push(url);return route.abort()}
    if(new URL(url).pathname==='/creator-auth.js')
     return route.fulfill({status:200,contentType:'text/javascript',body:'// Isolated UI testing stub; no authentication bypass in app code.'});
    return route.continue();
   });
   const page=await context.newPage();
   page.on('pageerror',err=>errors.push(String(err.message)));
   await page.goto(origin+'/creator.html');
   await page.evaluate(async()=>{
    document.getElementById('loginPanel').hidden=true;
    document.getElementById('ownerPanel').hidden=false;
    const fixtures={
     restaurants:[{id:'11111111-1111-4111-8111-111111111111',name:'Restaurant fictif'}],
     platform_reports:[],
     rm017_lifecycle_requests:[{
      id:'22222222-2222-4222-8222-222222222222',kind:'restaurant_closure',
      restaurant_id:'11111111-1111-4111-8111-111111111111',status:'requested',
      created_at:'2026-11-23T08:00:00Z',updated_at:'2026-11-23T08:00:00Z'
     }]
    };
    const client={
     from(name){
      const query={
       select(){return query},order(){return query},limit(){return query},
       then(resolve,reject){return Promise.resolve({data:fixtures[name]||[],error:null}).then(resolve,reject);}
      };
      return query;
     }
    };
    const {installCreatorConsole}=await import('./creator-console.js');
    installCreatorConsole({client,installOwnerInbox:()=>{}});
   });
   if(width<=760)await page.locator('#ownerNavToggle').click();
   await page.locator('[data-owner-nav="lifecycle"]').click();
   await page.waitForFunction(()=>document.querySelector('#ownerLifecycleStatus').textContent.includes('1 demande(s)'));
   assert.match(await page.locator('#ownerLifecycleList').innerText(),/Fermeture du restaurant/);
   assert.match(await page.locator('#ownerLifecycleList').innerText(),/En attente/);
   assert.match(await page.locator('#ownerLifecycleList').innerText(),/aucune action Root destructrice/i);
   assert.equal(await page.locator('#ownerLifecycleList .ownerLifecycleItem').count(),1);
   assert.equal(await page.locator('#ownerLifecycleList button').count(),0);
   await page.locator('#ownerRefreshLifecycle').click();
   await page.waitForFunction(()=>document.querySelector('#ownerLifecycleStatus').textContent.includes('1 demande(s)'));
   const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(metrics.scroll<=width+2,'Overflow on '+width+': '+JSON.stringify(metrics));
   console.log('PASS RM-017.3.2 read-only Root queue '+width+'px');
   await context.close();
  }
  assert.deepEqual(writes,[],'No network writes');
  assert.deepEqual(remote,[],'No external API requests');
  assert.deepEqual(errors,[],'No unhandled browser exceptions');
 }catch(err){console.error(err.stack||err);process.exitCode=1}
 finally{if(browser)await browser.close();await new Promise(done=>server.close(done))}
})();
