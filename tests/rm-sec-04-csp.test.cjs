'use strict';
// RM-SEC-04 — staff and Creator pages carry a strict, environment-correct Content-Security-Policy.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const read=file=>fs.readFileSync(file,'utf8');
const PAGES=['v3-connected.html','login.html','creator.html','creator-recovery.html','service-connected.html','index.html','service-v3.html'];
const dev=read('restomanager-env.js').match(/name:'DEV',url:'https:\/\/([a-z0-9]+\.supabase\.co)'/)[1];
const prod=read('restomanager-env.js').match(/name:'PROD',url:'https:\/\/([a-z0-9]+\.supabase\.co)'/)[1];
const policyOf=html=>{const m=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);assert.ok(m,'CSP meta missing');return Object.fromEntries(m[1].split(';').map(p=>p.trim().split(/\s+/)).map(([k,...v])=>[k,v]));};

test('RM-SEC-04: every staff/Creator page declares the CSP before any script, style or link',()=>{
 for(const page of PAGES){const html=read(page);const at=html.indexOf('http-equiv="Content-Security-Policy"');assert.ok(at>0,page);
  for(const tag of ['<script','<link','<style'])if(html.includes(tag))assert.ok(at<html.indexOf(tag),page+': CSP must precede '+tag);}
});

test('RM-SEC-04: scripts are same-origin only; no inline script, handler, eval or plugin',()=>{
 for(const page of PAGES){
  const html=read(page),p=policyOf(html);
  // v3-connected.html also allows the static RM-016 training boot script (inherited by its srcdoc frame).
  const trainingHash="'sha256-"+require('node:crypto').createHash('sha256').update(require('../service-v3-tutorial-training.js').bootScript(),'utf8').digest('base64')+"'";
  assert.deepEqual(p['script-src'],page==='v3-connected.html'?["'self'",trainingHash]:["'self'"],page+' (if the training code changed, update the hash in v3-connected.html)');assert.deepEqual(p['object-src'],["'none'"],page);
  assert.deepEqual(p['base-uri'],["'self'"],page);assert.deepEqual(p['frame-src'],["'none'"],page);assert.deepEqual(p['default-src'],["'self'"],page);
  const inline=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter(m=>m[1].trim());
  assert.equal(inline.length,0,page+' still has inline scripts');
  assert.doesNotMatch(html,/\son[a-z]+=["']/,page+' has inline event handlers');
 }
});

test('RM-SEC-04: connect-src targets exactly the DEV Supabase project of this branch, never PROD',()=>{
 for(const page of PAGES){
  const p=policyOf(read(page));
  assert.deepEqual(p['connect-src'],["'self'",'https://'+dev,'wss://'+dev],page);
  assert.ok(!p['connect-src'].some(s=>s.includes(prod)),page+' must not allow PROD from DEV');
  assert.ok(!Object.values(p).flat().some(s=>/\*|https?:$/.test(s)),page+' must not use wildcards');
 }
});

test('RM-SEC-04: documented exceptions only (inline styles, data:/blob: images)',()=>{
 for(const page of PAGES){const p=policyOf(read(page));
  assert.deepEqual(p['style-src'],["'self'","'unsafe-inline'"],page);assert.deepEqual(p['img-src'],["'self'",'data:','blob:'],page);}
});

test('RM-SEC-04: externalised scripts keep their position, exist, and ship offline and in the production allowlist',()=>{
 const shell=read('sw.js');const allow=JSON.parse(read('deployment/rm015-site-files.json'));
 const expected={'v3-connected.html':['v3-quick-actions.js','v3-booking-type-visual.js'],'login.html':['login-ui.js','login-environment.js'],'index.html':['redirect-v3-connected.js'],'service-v3.html':['redirect-v3-connected.js']};
 for(const [page,files] of Object.entries(expected))for(const file of files){
  assert.match(read(page),new RegExp('src="'+file.replace('.','\\.')+'\\?v=[\\w-]+"'),page+' → '+file);assert.ok(fs.existsSync(file),file);assert.ok(allow.includes(file),file+' allowlist');
  if(page!=='login.html')assert.match(shell,new RegExp('"'+file.replace('.','\\.')+'"'),file+' shell');
 }
 assert.match(read('login.html'),/<script type="module" src="login-environment\.js\?v=[\w-]+"><\/script>/);
});
