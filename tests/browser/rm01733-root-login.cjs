'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),requests=[],errors=[],widths=[360,390,768,1440];
const contentTypes={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
const server=http.createServer((request,response)=>{
 requests.push({method:request.method,url:request.url});
 let url;try{url=new URL(request.url,'http://127.0.0.1')}catch{response.writeHead(400);return response.end()}
 const target=url.pathname==='/__axe.js'?path.join(root,'node_modules/axe-core/axe.min.js'):path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!target.startsWith(root+path.sep)){response.writeHead(403);return response.end()}
 fs.readFile(target,(error,data)=>{
  if(error){response.writeHead(404);return response.end()}
  response.writeHead(200,{'Content-Type':contentTypes[path.extname(target)]||'application/octet-stream'});response.end(data)
 });
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({args:['--no-sandbox']});
  for(const width of widths){
   const context=await browser.newContext({viewport:{width,height:950},locale:'fr-FR',serviceWorkers:'block'});
   await context.route('**/*',r=>{
    if(new URL(r.request().url()).origin!==origin)return r.abort();
    if(/\/creator-(auth|recovery)\.js(?:\?|$)/.test(r.request().url()))
     return r.fulfill({status:200,contentType:'text/javascript',body:'// Disabled for isolated visual tests; auth states tested in Node VM.'});
    return r.continue();
   });
   const page=await context.newPage();
   page.on('pageerror',x=>errors.push(x.message));
   for(const route of ['/creator.html','/creator-recovery.html']){
    await page.goto(origin+route);
    const title=await page.title();
    assert.match(title,/RestoManager/);
    const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    assert.ok(metrics.scroll<=width+1,route+' '+width+'px overflow: '+JSON.stringify(metrics));
    if(route==='/creator.html'){
     assert.equal(await page.locator('#ownerPanel').isVisible(),false);
     assert.equal(await page.locator('#ownerUsername').getAttribute('type'),'text');
     assert.equal(await page.locator('#ownerUsername').getAttribute('placeholder'),'rootdev');
     assert.match(await page.locator('#ownerAliasInfo').innerText(),/première connexion/);
     assert.equal(await page.locator('#creatorRecoverRequest').isVisible(),false);
     assert.equal(await page.locator('#ownerAuthFeedback').isVisible(),true);
     assert.equal(await page.locator('#creatorMfaStep').count(),0);
    }else{
     assert.equal(await page.locator('#creatorPasswordRecovery').isVisible(),false);
     assert.match(await page.locator('main').innerText(),/Aucun mot de passe de production n'est modifié/);
    }
    if((width===390||width===1440)&&route==='/creator.html'){
     await page.addScriptTag({url:origin+'/__axe.js'});
     const issues=await page.evaluate(async()=>{const {violations}=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return violations.map(x=>({id:x.id,targets:x.nodes.map(y=>y.target)}))});
     assert.deepEqual(issues,[],'WCAG violations: '+JSON.stringify(issues));
    }
   }
   console.log('PASS RM-017.3.3 Root login/recovery layout '+width+'px');
   await context.close();
  }
  assert.deepEqual(errors,[]);
  assert.equal(requests.some(x=>x.method!=='GET'),false,'No outgoing writes');
  console.log('PASS responsive 4 widths, axe, zero network writes');
 }catch(e){console.error(e.stack||e);process.exitCode=1}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})();
