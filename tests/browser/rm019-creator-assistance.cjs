'use strict';
/* RM-019 — Root support UI tested with a fictional in-memory service.
   Never signs into DEV/PROD, never writes to any Supabase project. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.svg':'image/svg+xml'};
const requests=[],authImports=[];
const server=http.createServer((req,res)=>{
 requests.push(req.method+' '+req.url);
 let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);return res.end();}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(error,bytes)=>{
  if(error){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 });
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const width of [390,768,1440]){
   const ctx=await browser.newContext({viewport:{width,height:930},locale:'fr-FR',serviceWorkers:'block'});
   const external=[],writes=[],errors=[];
   await ctx.route('**/*',route=>{
    const request=route.request(),url=request.url();
    if(new URL(url).origin!==origin){external.push(url);return route.abort();}
    if(request.method()!=='GET')writes.push(url);
    if(/\/creator-auth\.js(?:\?|$)/.test(url)){
     authImports.push(new URL(url).searchParams.get('v'));
     return route.fulfill({status:200,contentType:'text/javascript',body:'// Auth disabled ONLY in the mock browser test'});
    }
    return route.continue();
   });
   const page=await ctx.newPage();
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin+'/creator.html',{waitUntil:'load'});
   await page.evaluate(async()=>{
    document.getElementById('loginPanel').hidden=true;
    document.getElementById('ownerPanel').hidden=false;
    for(const section of document.querySelectorAll('[data-owner-section]'))section.hidden=section.dataset.ownerSection!=='reports';
    window.__rm019={
     failUpdate:false,updates:[],
     reports:[
      {id:'ticket-hotel',restaurant_id:'hotel',submitted_role:'reception',kind:'bug',severity:'urgent',title:'Panne caisse',description:'Le service est bloqué depuis midi.',reply_contact:'Service réception',screen:'administration',status:'new',created_at:'2026-11-23T10:00:00Z'},
      {id:'ticket-independent',restaurant_id:'independent',submitted_role:'fb_admin',kind:'question',severity:'normal',title:'Changer une table',description:'Peut-on consulter les tables libres ?',reply_contact:null,screen:'reservations',status:'reviewing',created_at:'2026-11-22T17:30:00Z'},
      {id:'ticket-other',restaurant_id:'independent',submitted_role:'fb_admin',kind:'bug',severity:'normal',title:'Information interface',description:'<img src=x onerror=alert(1)> texte non fiable.',reply_contact:null,screen:'administration',status:'new',created_at:'2026-11-22T12:00:00Z'},
      {id:'ticket-resolved',restaurant_id:'hotel',submitted_role:'reception',kind:'suggestion',severity:'normal',title:'Changer la couleur',description:'Merci pour la correction.',reply_contact:null,screen:'administration',status:'resolved',created_at:'2026-11-21T12:00:00Z'}
     ]
    };
    const fixtures=window.__rm019;
    const client={from(table){
     if(table==='platform_reports')return{
      select(){return{order(){return{limit(){return Promise.resolve({data:fixtures.reports.map(r=>({...r})),error:null});}}}}},
      update(change){return{async eq(column,id){
       if(column!=='id')throw Error('Invalid identifier');
       fixtures.updates.push({id,change});
       if(fixtures.failUpdate)return{error:new Error('fictional failure')};
       fixtures.reports.find(row=>row.id===id).status=change.status;return{error:null};
      }}}
     };
     if(table==='restaurants')return {select(){return Promise.resolve({data:[{id:'hotel',name:'À l’Épicerie — Rouen'},{id:'independent',name:'Le Jardin'}],error:null});}};
     throw Error('Unexpected table '+table);
    }};
    const {installOwnerInbox}=await import('./creator-admin.js');
    installOwnerInbox({client});
   });
   await page.waitForFunction(()=>document.getElementById('ownerReportsFeedback')?.textContent.includes('4 signalement'));
   assert.equal(await page.locator('#ownerSupportOpen').innerText(),'3');
   assert.equal(await page.locator('#ownerSupportUrgent').innerText(),'1');
   assert.equal(await page.locator('#ownerSupportResolved').innerText(),'1');
   assert.equal(await page.locator('.ownerSupportTicket').count(),3);
   assert.match(await page.locator('#ownerSupportDetail').innerText(),/Panne caisse/);
   assert.equal(await page.locator('#ownerInbox img').count(),0);
   const search=page.locator('#ownerReportSearch');
   await search.fill('epicerie');
   assert.equal(await page.locator('.ownerSupportTicket').count(),1);
   assert.match(await page.locator('.ownerSupportTicket').innerText(),/Panne caisse/);
   await search.fill('jardin');
   assert.equal(await page.locator('.ownerSupportTicket').count(),2);
   await search.fill('sans-correspondance');
   assert.equal(await page.locator('.ownerSupportTicket').count(),0);
   assert.match(await page.locator('#ownerSupportDetail').innerText(),/Sélectionnez une demande/);
   await search.fill('');
   await page.locator('#ownerReportUrgentOnly').click();
   assert.equal(await page.locator('#ownerReportUrgentOnly').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('.ownerSupportTicket').count(),1);
   await page.locator('#ownerReportUrgentOnly').click();
   await page.locator('.ownerReportFilter').filter({hasText:'Tous'}).click();
   assert.equal(await page.locator('.ownerSupportTicket').count(),4);
   assert.equal(await page.locator('#ownerInbox img').count(),0,'User-supplied HTML must be escaped');
   await page.locator('.ownerSupportTicket').filter({hasText:'Changer une table'}).click();
   assert.match(await page.locator('#ownerSupportDetail').innerText(),/Le Jardin/);
   await page.locator('.ownerReportFilter').filter({hasText:'À traiter'}).click();
   await page.locator('.ownerSupportTicket').filter({hasText:'Panne caisse'}).click();
   await page.locator('#ownerStatus_ticket-hotel').selectOption('reviewing');
   await page.waitForFunction(()=>document.getElementById('ownerSupportActionFeedback')?.textContent.includes('Statut enregistré'));
   assert.equal(await page.evaluate(()=>window.__rm019.reports.find(r=>r.id==='ticket-hotel').status),'reviewing');
   await page.evaluate(()=>window.__rm019.failUpdate=true);
   await page.locator('#ownerStatus_ticket-hotel').selectOption('resolved');
   await page.waitForFunction(()=>document.getElementById('ownerSupportActionFeedback')?.textContent.includes('échoué'));
   assert.equal(await page.locator('#ownerStatus_ticket-hotel').inputValue(),'reviewing','Failed status reverts');
   await page.evaluate(()=>window.__rm019.failUpdate=false);
   await page.locator('#ownerStatus_ticket-hotel').selectOption('resolved');
   await page.waitForFunction(()=>document.getElementById('ownerSupportActionFeedback')?.textContent.includes('Statut enregistré'));
   assert.equal(await page.evaluate(()=>window.__rm019.reports.find(r=>r.id==='ticket-hotel').status),'resolved');
   assert.equal(await page.locator('.ownerSupportTicket').count(),2,'Resolved item exits open queue');
   assert.equal(await page.locator('#ownerSupportOpen').innerText(),'2');
   await page.locator('#ownerRefreshReports').click();
   await page.waitForFunction(()=>document.getElementById('ownerReportsFeedback')?.textContent.includes('4 signalement'));
   const viewport=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(viewport.scroll<=viewport.width+1,'Horizontal overflow '+width+': '+JSON.stringify(viewport));
   if(width===390||width===1440){
    await page.evaluate(fs.readFileSync(path.join(root,'node_modules/axe-core/axe.min.js'),'utf8'))/* RM-SEC-04: CSP-exempt test injection, the page CSP stays active */;
    const violations=await page.evaluate(async()=>{
     const result=await axe.run(document.getElementById('ownerInbox'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
     return result.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));
    });
    assert.deepEqual(violations,[],'A11y '+width+': '+JSON.stringify(violations));
   }
   assert.deepEqual(errors,[]);
   assert.deepEqual(external,[]);
   assert.deepEqual(writes,[]);
   await ctx.close();
   console.log('PASS RM-019 support queue, search, status, rollback and accessibility '+width+'px');
  }
  assert.ok(requests.every(r=>r.startsWith('GET ')));
  assert.deepEqual(authImports,['20261124-rm0191-visible-rm0204-rmauth01','20261124-rm0191-visible-rm0204-rmauth01','20261124-rm0191-visible-rm0204-rmauth01'],'The Creator entry point must not load stale RM0174 on any viewport');
  console.log('PASS RM-019 no remote calls, account changes, reservations or real tickets');
 }catch(error){console.error(error.stack||error);process.exitCode=1;}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})();
