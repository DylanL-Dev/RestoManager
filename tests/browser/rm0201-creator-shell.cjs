'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const mime={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'text/javascript;charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const requests=[];
const server=http.createServer((req,res)=>{
 requests.push({method:req.method,url:req.url});
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
 const name=path.resolve(root,'.'+pathname);
 if(!name.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(name,(e,data)=>{if(e){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream'});res.end(data);});
});
const stub=[
 'im'+'port {installCreatorConsole} from "./creator-console.js?v=20261123-rm0174";',
 'im'+'port {installOwnerInbox} from "./creator-admin.js?v=20261123-rm019";',
 'document.getElementById("loginPanel").hidden=true;',
 'document.getElementById("ownerPanel").hidden=false;',
 'const restaurants=[{id:"one",name:"À l’Épicerie — Rouen"},{id:"two",name:"Le Jardin"}];',
 'const reports=[{id:"id-one",restaurant_id:"one",submitted_role:"reception",kind:"bug",severity:"urgent",title:"Problème fictif",description:"Test local",reply_contact:null,screen:"tables",status:"new",created_at:"2026-11-23T10:00:00Z"}];',
 'const response=table=>window.__rmTestOverviewFail&&table==="restaurants"?{data:null,error:{message:"mock failure"}}:({data:table==="restaurants"?restaurants:table==="platform_reports"?reports:[],error:null});',
 'const client={from(table){',
 'if(!["restaurants","platform_reports","rm017_lifecycle_requests"].includes(table))throw Error("Unexpected table "+table);',
 'const chain={select(){return chain;},order(){return chain;},limit(){return Promise.resolve(response(table));},',
 'then(resolve,reject){return Promise.resolve(response(table)).then(resolve,reject)},',
 'update(){return{eq(){return Promise.resolve({error:null})}}}};',
 'return chain;}};',
 'installCreatorConsole({client,installOwnerInbox});'
].join('\n');
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const width of [360,390,768,1280,1440]){
   const context=await browser.newContext({viewport:{width,height:900},locale:'fr-FR',serviceWorkers:'block'});
   const external=[],writes=[],errors=[];
   await context.route('**/*',route=>{
    const request=route.request(),url=request.url();
    if(!url.startsWith(origin+'/')){external.push(url);return route.abort();}
    if(request.method()!=='GET')writes.push(url);
    if(/\/creator-auth\.js(?:\?|$)/.test(url))return route.fulfill({status:200,contentType:'text/javascript',body:stub});
    return route.continue();
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/creator.html',{waitUntil:'load'});
   await page.waitForFunction(()=>document.querySelectorAll('#ownerSidebar .ownerNavigation .lucide').length===7);
   await page.waitForFunction(()=>document.getElementById('ownerTotalRestaurants').textContent==='2');
   assert.equal(await page.locator('.ownerWelcomeBanner').isVisible(),true);
   assert.equal(await page.locator('#ownerSidebar .ownerNavigation button').count(),7);
   assert.equal(await page.locator('#ownerSidebar .ownerNavigation .lucide').count(),7);
   assert.equal(await page.locator('.ownerMetricIcon svg.lucide').count(),4);
   assert.equal(await page.locator('.ownerWelcomeIllustration svg.lucide').count(),1);
   await page.waitForFunction(()=>document.querySelectorAll('.ownerRestaurantIcon svg.lucide').length===2);
   assert.equal(await page.locator('#ownerSidebar [data-owner-nav="reports"]').getAttribute('aria-label'),'Centre d’assistance');
   async function navigate(view){
    if(width<=760){
     await page.locator('#ownerNavToggle').click();
     assert.equal(await page.locator('#ownerNavToggle').getAttribute('aria-expanded'),'true');
     await page.locator('#ownerSidebar [data-owner-nav="'+view+'"]').click();
     assert.equal(await page.locator('#ownerNavToggle').getAttribute('aria-expanded'),'false');
    }else await page.locator('#ownerSidebar [data-owner-nav="'+view+'"]').click();
    assert.equal(await page.locator('[data-owner-section="'+view+'"]').isVisible(),true);
    assert.equal(await page.locator('#ownerSidebar [data-owner-nav="'+view+'"]').getAttribute('aria-current'),'page');
   }
   await navigate('restaurants');
   assert.equal(await page.locator('.ownerRestaurantIcon svg.lucide-store').count(),2);
   await page.locator('#ownerRestaurantSearch').fill('epicerie');
   assert.equal(await page.locator('.ownerRestaurantRow:visible').count(),1);
   await page.locator('#ownerRestaurantSearch').fill('');
   assert.equal(await page.locator('.ownerRestaurantRow:visible').count(),2);
   await navigate('reports');
   await page.waitForFunction(()=>document.querySelector('#ownerRefreshReports svg.lucide-refresh-cw'));
   assert.equal(await page.locator('#ownerReportUrgentOnly svg.lucide-flag').count(),1);
   assert.equal(await page.locator('#ownerSupportQueue').isVisible(),true);
   await navigate('lifecycle');
   assert.equal(await page.locator('#ownerLifecycleList').count(),1);
   await navigate('pilot');
   assert.equal(await page.locator('#ownerPilotSummary').count(),1);
   await navigate('monitoring');
   await page.waitForFunction(()=>document.getElementById('ownerMonitorWebState').dataset.state==='ok'&&document.getElementById('ownerMonitorDbState').dataset.state==='ok');
   assert.equal(await page.locator('#ownerMonitorUrgent').textContent(),'1');
   assert.ok((await page.locator('#ownerMonitorRelease').textContent()).includes('dev'));
   assert.equal(await page.locator('#ownerMonitorHistory li').count(),5);
   const monitorOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);assert.ok(monitorOverflow,'Monitoring overflow '+width);
   if(width===390){
    await page.route('**/app-release.json?check=rm0204',route=>route.fulfill({status:503,body:'unavailable'}));
    await page.evaluate(()=>{window.__rmTestOverviewFail=true});
    await page.locator('#ownerRefreshMonitoring').click();
    await page.waitForFunction(()=>document.getElementById('ownerMonitorWebState').dataset.state==='error'&&document.getElementById('ownerMonitorDbState').dataset.state==='error');
    assert.equal(await page.locator('#ownerMonitorUrgent').textContent(),'—');
    assert.equal(await page.locator('#ownerMonitorHistory li').count(),0);
    await page.unroute('**/app-release.json?check=rm0204');
    await page.evaluate(()=>{window.__rmTestOverviewFail=false});
    await page.locator('#ownerRefreshMonitoring').click();
    await page.waitForFunction(()=>document.getElementById('ownerMonitorWebState').dataset.state==='ok'&&document.getElementById('ownerMonitorDbState').dataset.state==='ok');
   }
   await navigate('settings');
   await navigate('dashboard');
   assert.equal(await page.locator('.ownerMetric').first().evaluate(el=>getComputedStyle(el).animationName),'rmMotionEnter');
   const stagger=await page.locator('.ownerMetric').evaluateAll(nodes=>nodes.map(n=>parseFloat(getComputedStyle(n).animationDelay)));
   assert.ok(stagger.every((v,i)=>i===0||v-stagger[i-1]>=0.08),'Visible sequential stagger '+stagger);
   await navigate('pilot');
   assert.equal(await page.locator('.ownerPilotBanner').evaluate(el=>getComputedStyle(el).animationName),'rmMotionEnter');
   assert.ok(await page.locator('.ownerPilotGrid>.ownerSurface').count()>0);
   await navigate('dashboard');
   assert.equal(await page.locator('#ownerTotalRestaurants').textContent(),'2','Motion never substitutes fake KPI values');
   if(width===390){
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.ownerMetric').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal(await page.locator('#ownerSidebar').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    await navigate('restaurants');await navigate('dashboard');
    assert.equal(await page.locator('#ownerTotalRestaurants').textContent(),'2');
    await page.emulateMedia({reducedMotion:'no-preference'});
   }
   await page.locator('#ownerThemeToggle').click();
   assert.equal(await page.locator('html').getAttribute('data-creator-theme'),'dark');
   assert.equal(await page.locator('#ownerThemeToggle').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#ownerThemeToggle .lucide-sun').count(),1);
   await page.locator('#ownerThemeToggle').click();
   assert.equal(await page.locator('html').getAttribute('data-creator-theme'),'light');
   if(width>=1001){
    const toggle=page.locator('#ownerSidebarCollapse');
    const layout=()=>page.evaluate(()=>{
     const sidebar=document.getElementById('ownerSidebar'), nav=sidebar.querySelector('.ownerNavigation');
     const rect=nav.getBoundingClientRect();
     const icons=[...nav.querySelectorAll('button>.ownerNavIcon')].map(el=>el.getBoundingClientRect());
     return {width:sidebar.getBoundingClientRect().width,navWidth:nav.clientWidth,navScroll:nav.scrollWidth,
      badge:getComputedStyle(nav.querySelector('.ownerSupportNavNew')).display,
      spread:Math.max(...icons.map(r=>r.left))-Math.min(...icons.map(r=>r.left)),
      inside:icons.every(r=>r.left>=rect.left-1&&r.right<=rect.right+1)};
    });
    for(let cycle=0;cycle<3;cycle++){
     await toggle.click();
     assert.equal(await page.locator('#ownerPanel').evaluate(el=>el.classList.contains('ownerShellCompact')),true);
     await page.waitForFunction(()=>Math.abs(document.getElementById('ownerSidebar').getBoundingClientRect().width-79)<1);
     const compact=await layout();
     assert.equal(compact.badge,'none','New badge must not overflow compact menu');
     assert.ok(compact.spread<=1&&compact.inside&&compact.navScroll<=compact.navWidth+1,'Compact geometry '+JSON.stringify(compact));
     assert.equal(await page.locator('#ownerSidebar [data-owner-nav="dashboard"]').getAttribute('aria-label'),'Vue générale');
     await toggle.click();
     assert.equal(await page.locator('#ownerPanel').evaluate(el=>el.classList.contains('ownerShellCompact')),false);
     await page.waitForFunction(()=>Math.abs(document.getElementById('ownerSidebar').getBoundingClientRect().width-266)<1);
     const expanded=await layout();
     assert.notEqual(expanded.badge,'none');
     assert.ok(expanded.spread<=1&&expanded.inside&&expanded.navScroll<=expanded.navWidth+1,'Expanded geometry '+JSON.stringify(expanded));
    }
   }
   const overflow=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth}));
   assert.ok(overflow.sw<=overflow.vw+1,'Horizontal overflow at '+width+': '+JSON.stringify(overflow));
   if(width===390||width===1440){
    await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));
    await page.evaluate(fs.readFileSync(path.join(root,'node_modules/axe-core/axe.min.js'),'utf8'))/* RM-SEC-04: CSP-exempt test injection, the page CSP stays active */;
    const violations=await page.evaluate(async()=>{
     const results=await axe.run(document.getElementById('ownerPanel'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
     return results.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));
    });
    assert.deepEqual(violations,[],'Creator accessibility '+width+': '+JSON.stringify(violations));
   }
   assert.deepEqual(errors,[],'JS errors '+width);
   assert.deepEqual(external,[],'External network '+width);
   assert.deepEqual(writes,[],'Network writes '+width);
   await context.close();console.log('PASS RM-020.1 Creator shell '+width+' px');
  }
  assert.ok(requests.every(r=>r.method==='GET'));
  console.log('PASS RM-020.1 all sections, icons, theme, responsive, zero real network');
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
 finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})();
