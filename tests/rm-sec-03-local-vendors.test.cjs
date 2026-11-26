'use strict';
// RM-SEC-03 — third-party browser libraries are served locally, in one locked version, without CDN.
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const vm=require('node:vm');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const tracked=spawnSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).stdout.trim().split('\n');
const appFiles=tracked.filter(f=>/\.(m?js|html)$/.test(f)&&!/^(tests|docs|scripts|supabase|node_modules|dist|vendor)\//.test(f));

test('RM-SEC-03: no application page or module loads code from a public CDN',()=>{
 const offenders=appFiles.filter(f=>/https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh)\//.test(read(f)));
 assert.deepEqual(offenders,[]);
});

test('RM-SEC-03: every Supabase client comes from the single local SDK entry point',()=>{
 for(const file of ['supabase-login.js','supabase-service-bridge.js','creator-auth.js','creator-recovery.js','rm017-register.js']){
  assert.match(read(file),/['"]\.\/vendor\/supabase-js\.mjs\?v=[\w-]+['"]/,file);
 }
 const importers=appFiles.filter(f=>/createClient/.test(read(f))&&/import/.test(read(f)));
 for(const file of importers)assert.doesNotMatch(read(file),/@supabase\/supabase-js@/,file);
});

test('RM-SEC-03: the vendored Supabase SDK is byte-identical to the locked npm package',()=>{
 const lock=JSON.parse(read('package-lock.json'));
 assert.equal(lock.packages['node_modules/@supabase/supabase-js'].version,'2.119.0');
 assert.equal(sha256('vendor/supabase-js-2.119.0.umd.js'),'a867edbcfb029370aeec7223dd6180b560b621fbe3bc64c6584fb0369d1b7bce');
 const installed=path.join(root,'node_modules/@supabase/supabase-js/dist/umd/supabase.js');
 if(fs.existsSync(installed))assert.ok(fs.readFileSync(installed).equals(fs.readFileSync(path.join(root,'vendor/supabase-js-2.119.0.umd.js'))),'Vendored SDK differs from node_modules');
 assert.match(read('vendor/LICENSE-supabase-js.txt'),/MIT License/);
});

test('RM-SEC-03: the local ESM entry point exposes the real createClient from the UMD build',()=>{
 const shim=read('vendor/supabase-js.mjs');
 assert.match(shim,/new URL\('\.\/supabase-js-2\.119\.0\.umd\.js',import\.meta\.url\)/);
 assert.match(shim,/document\.createElement\('script'\)/);assert.doesNotMatch(shim,/^import /m);
 assert.match(shim,/export const createClient=globalThis\.supabase\.createClient;/);
 // Evaluated as a classic script, exactly as the shim injects it: `var supabase` becomes global.
 const sandbox={setTimeout,clearTimeout,console};sandbox.self=sandbox;vm.createContext(sandbox);
 vm.runInContext(read('vendor/supabase-js-2.119.0.umd.js'),sandbox,{filename:'supabase-js-2.119.0.umd.js'});
 assert.equal(typeof sandbox.supabase?.createClient,'function');
});

test('RM-SEC-03: jsPDF is a verified local copy and the PDF report no longer falls back to a CDN',()=>{
 assert.equal(sha256('vendor/jspdf-2.5.2.umd.min.js'),'85ba2cc3ff858a20fa49fe6e457bec863ea40b55a9f3725e58a940e62f6f61a4');
 assert.match(read('vendor/LICENSE-jspdf.txt'),/MIT/);
 const loader=read('service-v3-report-download.js');
 assert.match(loader,/const sources=\['vendor\/jspdf-2\.5\.2\.umd\.min\.js'\];/);
});

test('RM-SEC-03: offline shell, production allowlist and signup CSP follow the local libraries',()=>{
 const sw=read('sw.js');
 for(const file of ['vendor/supabase-js.mjs','vendor/supabase-js-2.119.0.umd.js'])assert.match(sw,new RegExp('"'+file.replace(/[.]/g,'\\.')+'"'));
 const allowlist=JSON.parse(read('deployment/rm015-site-files.json'));
 for(const file of ['vendor/supabase-js.mjs','vendor/supabase-js-2.119.0.umd.js','vendor/jspdf-2.5.2.umd.min.js'])assert.ok(allowlist.includes(file),file);
 const csp=read('inscription.html').match(/Content-Security-Policy" content="([^"]+)"/)[1];
 assert.doesNotMatch(csp,/cdn\.jsdelivr\.net/);assert.match(csp,/script-src 'self' https:\/\/challenges\.cloudflare\.com;/);
});
