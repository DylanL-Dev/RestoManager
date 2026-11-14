'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const allow=new Set(['creator.html','creator-console.css','creator-console.js','creator-admin.js','pwa-icon.svg']);

const server=http.createServer((req,res)=>{
 const name=decodeURIComponent((req.url||'/').split('?')[0]).replace(/^\//,'')||'creator.html';
 if(name==='creator-auth.js'){
  res.writeHead(200,{'Content-Type':'text/javascript'});res.end('// Audit: do not attempt any real Supabase authentication.');return;
 }
 if(!allow.has(name)){res.writeHead(404);res.end('Not found');return;}
 const file=path.join(root,name);
 const mime=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'image/svg+xml';
 res.writeHead(200,{'Content-Type':mime});res.end(fs.readFileSync(file));
});
const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const close=()=>new Promise(resolve=>server.close(resolve));

async function runCase(browser,width,height){
 const page=await browser.newPage({viewport:{width,height}});
 try{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const address=server.address();
  await page.goto('http://127.0.0.1:'+address.port+'/creator.html');
  await page.evaluate(async()=>{
   const source=async file=>{const r=await fetch(file);if(!r.ok)throw Error(file+' not found');return r.text()};
   const [consoleJs,inboxJs]=await Promise.all([source('creator-console.js'),source('creator-admin.js')]);
   const expose=(code,name)=>new Function(code.replace('export function '+name,'function '+name)+'\nreturn '+name+';')();
   const installCreatorConsole=expose(consoleJs,'installCreatorConsole');
   const installOwnerInbox=expose(inboxJs,'installOwnerInbox');
   document.getElementById('loginPanel').hidden=true;
   document.getElementById('ownerPanel').hidden=false;
   const sample={
    restaurants:[{id:'demo',name:'Établissement fictif'}],
    reports:[
     {id:'r1',restaurant_id:'demo',submitted_role:'reception',kind:'bug',severity:'normal',title:'À examiner',description:'Exemple',reply_contact:'',screen:'Réception',status:'new',created_at:'2026-11-14T07:00:00Z'},
     {id:'r2',restaurant_id:'demo',submitted_role:'fb_admin',kind:'bug',severity:'urgent',title:'En cours',description:'Exemple',reply_contact:'',screen:'Restaurant',status:'reviewing',created_at:'2026-11-14T07:00:00Z'},
     {id:'r3',restaurant_id:'demo',submitted_role:'reception',kind:'suggestion',severity:'normal',title:'Déjà résolu',description:'Exemple',reply_contact:'',screen:'Réception',status:'resolved',created_at:'2026-11-14T07:00:00Z'}
    ]
   };
   window.__sample=sample;
   const reply=data=>Promise.resolve({data,error:null});
   const client={from(table){
    if(table==='restaurants')return{select(){return{
     then(a,b){return reply(sample.restaurants).then(a,b)},
     order(){return reply(sample.restaurants)}
    }}};
    if(table==='platform_reports')return{
     select(){return{order(){return{limit(){return reply(sample.reports.map(x=>({...x})))}}}}},
     update(patch){return{eq(key,id){const item=sample.reports.find(x=>x.id===id);if(!item)throw Error('Unknown report');item.status=patch.status;return reply(null)}}}
    };
    throw Error('Unexpected table: '+table);
   }};
   installCreatorConsole({client,installOwnerInbox});
  });
  await page.waitForFunction(()=>document.getElementById('ownerNewReports')?.textContent==='1');
  assert.equal(await page.locator('#ownerReviewingReports').innerText(),'1');
  assert.equal(await page.locator('#ownerUrgentReports').innerText(),'1');
  if(width<=760){
   await page.locator('#ownerNavToggle').click();
   assert.equal(await page.locator('#ownerNavToggle').getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('#ownerNavBackdrop').isVisible(),true);
   await page.locator('#ownerNavClose').click();
   assert.equal(await page.locator('#ownerNavToggle').getAttribute('aria-expanded'),'false');
   await page.locator('#ownerNavToggle').click();
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#ownerNavToggle').getAttribute('aria-expanded'),'false');
   await page.locator('#ownerNavToggle').click();
  }
  await page.locator('.ownerNavigation [data-owner-nav="reports"]').click();
  await page.locator('.ownerReport').first().waitFor();
  assert.equal(await page.locator('.ownerReport').count(),2);
  await page.locator('#ownerStatus_r1').selectOption('resolved');
  await page.waitForFunction(()=>document.querySelectorAll('.ownerReport').length===1);
  // Navigating to Assistance closes the mobile drawer; reopen it before returning.
  if(width<=760)await page.locator('#ownerNavToggle').click();
  await page.locator('.ownerNavigation [data-owner-nav="dashboard"]').click();
  await page.waitForFunction(()=>document.getElementById('ownerNewReports').textContent==='0');
  assert.equal(await page.locator('#ownerReviewingReports').innerText(),'1');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,'Unexpected horizontal overflow '+overflow+'px at '+width);
  assert.deepEqual(errors,[],'Browser errors: '+errors.join(' / '));
  console.log('RM-006 Creator mock PASS '+width+'x'+height);
 }finally{await page.close()}
}

(async()=>{
 await listen();
 const browser=await chromium.launch({headless:true});
 try{for(const [w,h] of [[390,844],[768,1024],[1440,900]])await runCase(browser,w,h)}
 finally{await browser.close();await close()}
})().catch(e=>{console.error(e);process.exitCode=1});
