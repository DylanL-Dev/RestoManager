'use strict';
/* RM-018: local-only browser & accessibility checks; no authentication, DB or external requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const files=['legal.html','mentions-legales.html','cgu.html','cgv.html','confidentialite.html','cookies.html','dpa.html'];
const widths=[360,390,768,1440];
const requests=[],errors=[];
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.js':'text/javascript'};
const server=http.createServer((req,res)=>{
 requests.push({method:req.method,url:req.url});
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
 const filename=pathname==='/__axe.js'?path.join(root,'node_modules/axe-core/axe.min.js'):path.resolve(root,'.'+pathname);
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(filename,(err,bytes)=>{
  if(err){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});
  res.end(bytes);
 });
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({args:['--no-sandbox']});
  for(const width of widths){
   const ctx=await browser.newContext({viewport:{width,height:900},locale:'fr-FR',serviceWorkers:'block'});
   const external=[];
   await ctx.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();external.push(url);return route.abort();});
   const page=await ctx.newPage();
   page.on('pageerror',err=>errors.push(err.message));
   for(const file of files){
    await page.goto(origin+'/'+file,{waitUntil:'load'});
    assert.equal(await page.locator('h1').count(),1,width+' '+file);
    assert.equal(await page.locator('[role="note"]').count(),1);
    assert.equal(await page.locator('.sidebar a[aria-current="page"]').count(),1);
    assert.equal(await page.locator('#legalContent').isVisible(),true);
    assert.match(await page.locator('.draft').innerText(),/Brouillon de travail/);
    const box=await page.evaluate(()=>({w:document.documentElement.scrollWidth,v:innerWidth}));
    assert.ok(box.w<=box.v+1,'Horizontal overflow '+width+' '+file+': '+JSON.stringify(box));
    if(width===390||width===1440){
     await page.addScriptTag({url:origin+'/__axe.js'});
     const violations=await page.evaluate(async()=>{const report=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return report.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));});
     assert.deepEqual(violations,[],'Accessibility '+width+' '+file+': '+JSON.stringify(violations));
    }
   }
   await page.goto(origin+'/legal.html');
   await page.getByRole('link',{name:/Conditions de vente/}).last().click();
   assert.match(page.url(),/cgv\.html$/);
   await page.getByRole('link',{name:/Cookies et traceurs/}).last().click();
   assert.match(page.url(),/cookies\.html$/);
   const cookies=await ctx.cookies();
   assert.equal(cookies.length,0,'Legal pages do not set cookies');
   const store=await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}));
   assert.deepEqual(store,{local:0,session:0},'Legal pages write no local storage');
   assert.deepEqual(external,[],'No external resources on legal pages');
   await ctx.close();
   console.log('PASS RM-018 legal hub, six documents, internal links, no tracking '+width+'px');
  }
  assert.ok(requests.every(r=>r.method==='GET'),'No writes to local server');
  assert.deepEqual(errors,[],'No JS runtime errors');
  console.log('PASS RM-018 7 pages, 4 widths, WCAG2.1AA 2 widths, local-only resources');
 }catch(error){console.error(error.stack||error);process.exitCode=1;}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})();
