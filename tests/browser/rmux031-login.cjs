'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.resolve('test-results/rm0171-signup/login');
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=url.pathname==='/__axe.js'?path.join(root,'node_modules/axe-core/axe.min.js'):path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data)})});
const sdk=`export function createClient(){return {auth:{getSession:async()=>({data:{session:null}}),signInWithPassword:async({email,password})=>{window.__attempts.push({email,password});return {error:Error('Invalid fixture credentials')}}}}}`;
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({args:['--no-sandbox']});fs.mkdirSync(out,{recursive:true});
 for(const width of [360,390,768,1024,1440,1920]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await context.addInitScript(()=>window.__attempts=[]);
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin&&u.pathname==='/vendor/supabase-js.mjs')return route.fulfill({contentType:'text/javascript',body:sdk});if(u.origin===origin)return route.continue();return route.abort()});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/login.html');
  await page.locator('#environmentLabel').waitFor({state:'visible'});assert.match(await page.locator('#environmentLabel').innerText(),/DEV/);
  await page.locator('#username').fill('admin-fb');await page.locator('#password').fill('fictitious-only');
  await page.locator('#togglePassword').click();assert.equal(await page.locator('#password').getAttribute('type'),'text');await page.locator('#togglePassword').click();assert.equal(await page.locator('#password').getAttribute('type'),'password');
  await page.locator('#forgot').click();assert.equal(await page.locator('#recovery').isVisible(),true);await page.locator('#forgot').click();assert.equal(await page.locator('#recovery').isVisible(),false);
  await page.locator('#submit').click();await page.waitForFunction(()=>document.getElementById('message').dataset.kind==='error');
  assert.equal(await page.locator('#submit').isEnabled(),true);
  assert.equal(await page.evaluate(()=>window.__attempts.length),1);assert.equal(await page.evaluate(()=>window.__attempts[0].email),'admin-fb@accounts.restomanager.example.com');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('main').evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.addScriptTag({url:origin+'/__axe.js'});const issues=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});
  assert.deepEqual(issues,[]);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'login-'+width+'.png'),fullPage:true,animations:'disabled'});await context.close();console.log('PASS premium login '+width);
 }
 }finally{await browser?.close();server.close()}})().catch(err=>{console.error(err);process.exitCode=1});
