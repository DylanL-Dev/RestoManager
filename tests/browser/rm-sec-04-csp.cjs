'use strict';
// RM-SEC-04 browser check: each staff/Creator page loads with zero CSP violation, and the CSP is
// really enforced (an injected inline script is blocked). External network is aborted: no Supabase
// project is contacted.
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
const PAGES=['login.html','v3-connected.html','creator.html','service-connected.html'];
(async()=>{let browser;const results=[];try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 for(const page of PAGES){for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(()=>{window.__cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.__cspViolations.push({directive:e.effectiveDirective,blocked:String(e.blockedURI).slice(0,80)}));});
  const tab=await context.newPage();await tab.goto(origin+'/'+page,{waitUntil:'load'});await tab.waitForTimeout(1500);
  const loadViolations=await tab.evaluate(()=>window.__cspViolations.slice());
  const injected=await tab.evaluate(async()=>{window.__cspProbe=false;const s=document.createElement('script');s.textContent='window.__cspProbe=true';document.head.append(s);await new Promise(r=>setTimeout(r,100));return {ran:window.__cspProbe,violations:window.__cspViolations.filter(v=>v.directive==='script-src-elem'||v.directive==='script-src').length};});
  assert.deepEqual(loadViolations,[],page+' @'+width+': CSP violations on load '+JSON.stringify(loadViolations));
  assert.equal(injected.ran,false,page+': an injected inline script must not run');assert.ok(injected.violations>=1,page+': the blocked injection must be reported');
  results.push(page+'@'+width);console.log('PASS CSP '+page+' @'+width+' — 0 violation, inline injection blocked');
  await context.close();
 }}
 console.log(JSON.stringify({passed:results.length,failed:0}));
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();server.close();}})();
