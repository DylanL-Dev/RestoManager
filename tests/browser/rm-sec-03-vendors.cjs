'use strict';
// RM-SEC-03 browser check: with every non-local request aborted, the local Supabase SDK and jsPDF
// load and work. No Supabase project is contacted: the client is created, never used for I/O.
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{let browser;const external=[];try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();external.push(u.hostname);return route.abort();});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/login.html');
 const sdk=await page.evaluate(async()=>{const m=await import('./vendor/supabase-js.mjs?v=check');const client=m.createClient('http://127.0.0.1:9/','fixture-key',{auth:{persistSession:false,autoRefreshToken:false}});return {createClient:typeof m.createClient,from:typeof client.from,rpc:typeof client.rpc,channel:typeof client.channel};});
 assert.deepEqual(sdk,{createClient:'function',from:'function',rpc:'function',channel:'function'});
 console.log('PASS local Supabase SDK loads and builds a client with no CDN');
 const pdf=await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/jspdf-2.5.2.umd.min.js';s.onload=resolve;s.onerror=()=>reject(Error('jsPDF load failed'));document.head.append(s);});const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});doc.text('RestoManager — test fictif',16,16);const out=doc.output('arraybuffer');return {bytes:out.byteLength,header:String.fromCharCode(...new Uint8Array(out.slice(0,5)))};});
 assert.equal(pdf.header,'%PDF-');assert.ok(pdf.bytes>500);
 console.log('PASS local jsPDF generates a PDF ('+pdf.bytes+' bytes) with no CDN');
 assert.deepEqual(errors,[]);assert.deepEqual([...new Set(external)].filter(h=>/jsdelivr|unpkg/.test(h)),[],'No CDN request may be attempted');
 console.log(JSON.stringify({passed:2,failed:0,externalAttempts:[...new Set(external)]}));
}catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();server.close();}})();
