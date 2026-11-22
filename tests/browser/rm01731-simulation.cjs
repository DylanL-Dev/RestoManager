'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.BROWSER_ARTIFACTS||'test-results/rm01731-simulation');
const widths=[360,390,768,1440],requests=[],errors=[],external=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((request,response)=>{
 requests.push({method:request.method,url:request.url});
 let url;
 try{url=new URL(request.url,'http://127.0.0.1');}catch{response.writeHead(400);return response.end();}
 const file=url.pathname==='/__axe.js'?path.resolve(root,'node_modules/axe-core/axe.min.js'):path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){response.writeHead(403);return response.end();}
 fs.readFile(file,(error,body)=>{if(error){response.writeHead(404);return response.end();}response.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');response.end(body);});
});
async function layout(page,width){
 const data=await page.evaluate(()=>({
  scroll:document.documentElement.scrollWidth,
  wide:[...document.querySelectorAll('body *')].filter(el=>{if(el.closest('[aria-hidden="true"]'))return false;const r=el.getBoundingClientRect();return r.width>1&&(r.left < -1||r.right>innerWidth+1)}).slice(0,7).map(el=>el.id||el.className||el.tagName)
 }));
 assert.ok(data.scroll<=width+1,'Horizontal overflow '+JSON.stringify(data));
 assert.deepEqual(data.wide,[],'Offscreen elements '+JSON.stringify(data));
}
async function axe(page,origin){
 await page.addScriptTag({url:origin+'/__axe.js'});
 const issues=await page.evaluate(async()=>{const {violations}=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return violations.map(x=>({id:x.id,targets:x.nodes.map(n=>n.target)}));});
 assert.deepEqual(issues,[],'Accessibility issues: '+JSON.stringify(issues));
}
(async()=>{
 let browser,origin;
 try{
  fs.mkdirSync(out,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({args:['--no-sandbox']});
  for(const width of widths){
   const ctx=await browser.newContext({viewport:{width,height:width<=560?930:1024},locale:'fr-FR',serviceWorkers:'block'});
   await ctx.route('**/*',route=>{
    if(new URL(route.request().url()).origin===origin)return route.continue();
    external.push(route.request().url());return route.abort();
   });
   const page=await ctx.newPage();
   page.on('pageerror',e=>errors.push(String(e.message)));
   await page.goto(origin+'/rm0173-simulation.html');
   assert.equal(await page.locator('#pilotCreateForm').isVisible(),true);
   assert.equal(await page.locator('#pilotAccountState').innerText(),'Non créé');
   assert.equal(await page.locator('#pilotSuspend').isDisabled(),true);
   await layout(page,width);
   if(width===390||width===1440)await axe(page,origin);
   await page.locator('#pilotSiret').fill('1234');
   await page.locator('#pilotCreate').click();
   assert.match(await page.locator('#pilotFeedback').innerText(),/SIRET fictif/);
   assert.equal(await page.locator('#pilotAccountState').innerText(),'Non créé');
   await page.locator('#pilotSiret').fill('00000000000000');
   if(width===1440)await page.locator('#pilotType').selectOption('hotel');
   await page.locator('#pilotCreate').click();
   assert.equal(await page.locator('#pilotEmailStage').isVisible(),true);
   assert.equal(await page.locator('#pilotRestaurantState').innerText(),'Non créé');
   assert.equal(await page.locator('#pilotSirenValue').innerText(),'000000000');
   await page.locator('#pilotRootTab').click();
   assert.equal(await page.locator('#pilotOwnerPanel').isVisible(),false);
   assert.equal(await page.locator('#pilotSuspend').isDisabled(),true,'Cannot administer before email');
   await page.locator('#pilotOwnerTab').click();
   await page.locator('#pilotConfirmEmail').click();
   assert.equal(await page.locator('#pilotOwnerActions').isVisible(),true);
   assert.match(await page.locator('#pilotRestaurantState').innerText(),/Actif/);
   await page.locator('#pilotRequestAccount').click();
   assert.match(await page.locator('#pilotAccountState').innerText(),/Suppression demandée/);
   assert.match(await page.locator('#pilotRestaurantState').innerText(),/Actif/);
   await page.locator('#pilotRequestClosure').click();
   assert.match(await page.locator('#pilotRestaurantState').innerText(),/Fermeture demandée/);
   await page.locator('#pilotRootTab').click();
   assert.equal(await page.locator('#pilotArchive').isDisabled(),true,'Archive requires suspension');
   await page.locator('#pilotSuspend').click();
   assert.match(await page.locator('#pilotRestaurantState').innerText(),/Suspendu/);
   await page.locator('#pilotRestore').click();
   assert.match(await page.locator('#pilotRestaurantState').innerText(),/Actif/);
   await page.locator('#pilotSuspend').click();
   await page.locator('#pilotArchive').click();
   assert.match(await page.locator('#pilotRestaurantState').innerText(),/Archivé/);
   assert.equal(await page.locator('#pilotErase').isDisabled(),true,'Explicit phrase is mandatory');
   await page.locator('#pilotErasePhrase').fill('EFFACER');
   assert.equal(await page.locator('#pilotErase').isDisabled(),true);
   await page.locator('#pilotErasePhrase').fill('EFFACER LA DÉMO');
   assert.equal(await page.locator('#pilotErase').isEnabled(),true);
   await page.locator('#pilotErase').click();
   assert.match(await page.locator('#pilotRestaurantState').innerText(),/Exemple effacé/);
   assert.equal(await page.locator('#pilotSiretValue').innerText(),'—');
   assert.equal(await page.locator('#pilotEventLog li').count(),9);
   if(width===390||width===1440)await page.screenshot({path:path.join(out,'root-erase-'+width+'.png'),fullPage:true,animations:'disabled'});
   await layout(page,width);
   await page.reload();
   assert.equal(await page.locator('#pilotAccountState').innerText(),'Non créé','Reload cannot restore state');
   assert.equal(await page.locator('#pilotEventLog li').count(),1,'No persistence');
   await ctx.close();
   console.log('PASS RM-017.3.1 local owner/Root '+width+'px');
  }
  assert.deepEqual(errors,[],'Browser runtime errors');
  assert.deepEqual(external,[],'No external requests');
  assert.equal(requests.some(x=>x.method!=='GET'),false,'No network writes');
  assert.equal(requests.some(x=>/supabase|auth|functions\/v1|\/rest\/v1/.test(x.url)),false,'No backend API requests');
  console.log(JSON.stringify({result:'PASS',widths,noWrites:true,serviceWorkers:false}));
 }catch(error){console.error(error.stack||error);process.exitCode=1;}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})();
