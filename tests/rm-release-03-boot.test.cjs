'use strict';
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict'),test=require('node:test');
const read=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');

test('RM-RELEASE-03: boot assets load after UX styles and immediately after the session status',()=>{
 const html=read('v3-connected.html');
 const css='<link rel="stylesheet" href="rm-boot.css?v=1">';
 const js='<script src="rm-boot.js?v=1"></script>';
 assert.ok(html.indexOf(css)>html.indexOf('href="rm-ux-pack.css?'));
 assert.ok(html.indexOf(css)<html.indexOf('</head>'));
 assert.match(html,/<div id="integrationLoading" role="status">[\s\S]*?Vérification de la session…[\s\S]*?<\/div>\s*<script src="rm-boot\.js\?v=1"><\/script>/);
 assert.ok(html.indexOf(js)<html.indexOf('<header class="top">'));
 assert.ok(html.indexOf('id="integrationGate"')<html.indexOf(js));
});

test('RM-RELEASE-03: local startup assets ship in the PWA shell and site allowlist',()=>{
 const worker=read('sw.js'),manifest=JSON.parse(read('deployment/rm015-site-files.json'));
 for(const name of ['rm-boot.js','rm-boot.css']){
  assert.ok(worker.includes('"'+name+'"'));
  assert.ok(manifest.includes(name));
  assert.ok(read(name).length>0);
 }
 assert.match(worker,/const CACHE='[^']*-boot27v1';/);
});

test('RM-RELEASE-03: decoration observes removal without taking over session validation',()=>{
 const js=read('rm-boot.js'),css=read('rm-boot.css');
 assert.match(js,/if \(el\.isConnected\) return;/);
 assert.match(js,/ghost\.setAttribute\('aria-hidden', 'true'\)/);
 assert.match(js,/setTimeout\(done, reduce \? 400 : 1000\)/);
 assert.match(css,/pointer-events: none;/);
 assert.match(css,/prefers-reduced-motion: reduce/);
 assert.match(css,/8s forwards/);
 assert.doesNotMatch(js,/\b(?:fetch|localStorage|sessionStorage|supabase)\s*\(/i);
});
