'use strict';
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict'),test=require('node:test');
const read=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');

test('RM-RELEASE-03 A: animated startup preserves the existing production auth gate',()=>{
 const html=read('v3-connected.html'),auth=read('v3-connected-auth.js');
 assert.match(html,/<style id="integrationGate">body\{visibility:hidden\}/);
 assert.match(html,/<div id="integrationLoading" role="status">[\s\S]*?Vérification de la session…[\s\S]*?<\/div>\s*<script src="rm-boot\.js\?v=1"><\/script>/);
 assert.match(html,/<link rel="modulepreload" href="v3-connected-auth\.js\?v=20261128-rmrelease03a">/);
 assert.match(html,/<script type="module" src="v3-connected-auth\.js\?v=20261128-rmrelease03a"><\/script>/);
 assert.ok(html.indexOf('href="rm-ux-pack.css?')<html.indexOf('href="rm-boot.css?'));
 assert.ok(html.indexOf('src="rm-boot.js?v=1"')<html.indexOf('<header class="top">'));
 assert.ok(auth.indexOf("style.textContent=style.textContent.replace('body{visibility:hidden}','')")<auth.indexOf("document.getElementById('integrationLoading')?.remove()"));
 assert.doesNotMatch(read('rm-boot.js'),/\b(?:fetch|localStorage|sessionStorage|supabase)\s*\(/i);
 assert.match(read('rm-boot.css'),/prefers-reduced-motion: reduce/);
});

test('RM-RELEASE-03 A: production UI and PWA assets agree, Express is excluded',()=>{
 const html=read('v3-connected.html'),sw=read('sw.js'),release=JSON.parse(read('app-release.json'));
 for(const name of ['rm-boot.js','rm-boot.css','rm-ux-pack.js','rm-ux-pack.css']){
  assert.ok(html.includes(name+'?v='));
  assert.ok(sw.includes('"'+name+'"'));
  assert.ok(read(name).length>0);
 }
 assert.ok(sw.includes("const CACHE='restomanager-shell-"+release.currentVersion+"'"));
 assert.doesNotMatch(html+sw+read('service-v3-screens.js'),/service-v3-express|rm-coupdefeu|placement-express-adapter|lykoybacslvmhtzftqsf/);
 for(const name of ['service-v3-express.mjs','service-v3-express-simulation.mjs','rm-coupdefeu.js','rm-coupdefeu.css'])
  assert.equal(fs.existsSync(path.resolve(__dirname,'..',name)),false,name);
 assert.equal(read('index.html'),read('service-v3.html'));
});
