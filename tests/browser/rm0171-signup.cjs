'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.BROWSER_ARTIFACTS||'test-results/rm0171-signup');
const widths=process.env.RM017_WIDTHS?process.env.RM017_WIDTHS.split(',').map(Number).filter(Boolean):[360,390,430,768,1024,1440,1920];
const requests=[],errors=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((request,response)=>{
 requests.push({method:request.method,url:request.url});
 let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400);return response.end();}
 const file=pathname==='/__axe.js'?path.join(root,'node_modules/axe-core/axe.min.js'):path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){response.writeHead(403);return response.end();}
 fs.readFile(file,(error,bytes)=>{if(error){response.writeHead(404);return response.end();}response.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');response.end(bytes);});
});
async function assertLayout(page,width){
 const result=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>1 && (r.left < -1||r.right>innerWidth+1)}).slice(0,8).map(e=>e.id||e.className||e.tagName)}));
 assert.ok(result.scroll<=width+1,'Horizontal overflow: '+JSON.stringify(result));
 assert.deepEqual(result.wide,[],'Offscreen element: '+JSON.stringify(result));
}
async function axe(page,url){
 await page.addScriptTag({url:url+'/__axe.js'});
 const issues=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.map(n=>n.target)}));});
 assert.deepEqual(issues,[],'Accessibility: '+JSON.stringify(issues));
}
async function context(browser,origin,width){
 const ctx=await browser.newContext({viewport:{width,height:width<=560?900:1000},locale:'fr-FR',serviceWorkers:'block'});
 await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 return ctx;
}
(async()=>{
 let browser,origin;
 try{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({args:['--no-sandbox']});
  for(const width of widths){
   const ctx=await context(browser,origin,width),page=await ctx.newPage();
   page.on('pageerror',e=>errors.push(width+':'+e.message));
   await page.goto(origin+'/inscription.html');
   await page.getByRole('heading',{name:/Commençons par votre établissement/}).waitFor();
   assert.equal(await page.getByRole('radio').count(),2);
   assert.equal(await page.locator('#progressTrack').getAttribute('aria-valuenow'),'1');
   assert.equal(await page.locator('#typeHotel .type-icon svg').evaluate(svg=>!!svg.querySelector('rect[x="4"][y="2"]')),true,'Lucide hotel');
   await assertLayout(page,width);await axe(page,origin);
   await page.screenshot({path:path.join(out,'step1-'+width+'.png'),fullPage:true,animations:'disabled'});
   await page.locator('#nextStep').click();
   assert.equal(await page.locator('#typeError').isVisible(),true,'Type required');
   await page.locator('#typeHotel').click();
   assert.equal(await page.getByRole('radio',{name:/Restaurant d'hôtel/}).isChecked(),true);
   await page.locator('#nextStep').click();
   assert.equal(await page.locator('#stepDetails').isVisible(),true);
   assert.equal(await page.locator('#selectedTypeLabel').innerText(),"Restaurant d’hôtel");
   await page.locator('#nextStep').click();
   assert.equal(await page.locator('#nameError').isVisible(),true,'Name required');
   assert.equal(await page.locator('#emailError').isVisible(),true,'Email required');
   await page.locator('#businessName').fill('Les Rives');
   await page.locator('#businessCity').fill('Rouen');
   await page.locator('#businessEmail').fill('contact@example.test');
   await page.locator('#nextStep').click();
   assert.equal(await page.locator('#stepPreview').isVisible(),true);
   assert.equal(await page.locator('#reviewName').innerText(),'Les Rives');
   assert.equal(await page.locator('#reviewType').innerText(),"Restaurant d’hôtel");
   assert.match(await page.locator('#exampleLink').getAttribute('href'),/hotel-des-rives-demo/);
   assert.match(await page.locator('.availability-note').innerText(),/Aucune inscription n'a été effectuée/);
   await assertLayout(page,width);
   await page.screenshot({path:path.join(out,'review-hotel-'+width+'.png'),fullPage:true,animations:'disabled'});
   await page.locator('#backStep').click();
   assert.equal(await page.locator('#businessName').inputValue(),'Les Rives','Back preserves draft only in current page');
   await page.locator('#nextStep').click();
   await page.locator('#restart').click();
   assert.equal(await page.locator('#progressTrack').getAttribute('aria-valuenow'),'1');
   assert.equal(await page.locator('#businessName').inputValue(),'');
   assert.equal(await page.getByRole('radio',{name:/Restaurant d'hôtel/}).isChecked(),false);
   await ctx.close();console.log('PASS RM-017.1 hotel wizard '+width+'px');
  }
  for(const width of [390,1440]){
   const ctx=await context(browser,origin,width),page=await ctx.newPage();page.on('pageerror',e=>errors.push(width+':'+e.message));
   await page.goto(origin+'/inscription.html');await page.locator('#typeIndependent').click();await page.locator('#nextStep').click();
   await page.locator('#businessName').fill('<img src=x onerror=alert(1)>');
   await page.locator('#businessCity').fill('Ville de démonstration');
   await page.locator('#businessEmail').fill('info@example.test');await page.locator('#nextStep').click();
   assert.equal(await page.locator('#reviewType').innerText(),'Restaurant indépendant');
   assert.match(await page.locator('#exampleLink').getAttribute('href'),/le-jardin-demo/);
   assert.equal(await page.locator('#reviewName img').count(),0,'Untrusted name is rendered as text');
   assert.match(await page.locator('#reviewName').innerText(),/<img src=x/);
   assert.equal(await page.locator('#reviewFeatures').innerText().then(t=>t.includes('chambre')),false);
   await assertLayout(page,width);await axe(page,origin);
   await ctx.close();console.log('PASS RM-017.1 independent isolation '+width+'px');
  }
  assert.equal(requests.some(r=>r.method!=='GET'),false,'No POST, registration or data write');
  assert.equal(requests.some(r=>/supabase|rpc|functions\/v1/.test(r.url)),false,'No Supabase calls');
  assert.deepEqual(errors,[],'No browser errors');
  console.log(JSON.stringify({result:'PASS',widths:widths.length,requests:requests.length,noWrites:true}));
 }catch(error){console.error(error.stack||error);process.exitCode=1;}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})();
