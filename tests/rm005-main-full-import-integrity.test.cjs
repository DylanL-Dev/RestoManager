'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'v3-connected.html'),'utf8');
const script=(name)=>fs.readFileSync(path.join(root,name),'utf8');

test('RM-005 MAIN: every JS/CSS runtime dependency exists and loads once',()=>{
 // A modulepreload is a fetch hint, not a second executable import.
 // Check it independently, and continue rejecting duplicate loaded runtime assets.
 const preloads=[...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)];
 assert.equal(preloads.length,1,'Only the reviewed auth module is preloaded');
 assert.equal(preloads[0][1],'v3-connected-auth.js?v=20261128-rmrelease03a');
 assert.equal([...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].filter(m=>m[1]===preloads[0][1]).length,1,'Preloaded module must be executed once with the exact same version');
 const runtimeHtml=html.replace(preloads[0][0],'');
 const files=[...runtimeHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(m=>m[1].split('?')[0]);
 assert.ok(files.length>=54,'RM-005 must load the complete set of modules');
 assert.equal(new Set(files).size,files.length,'No duplicate runtime assets');
 for(const file of files){
  assert.ok(!file.startsWith('http'),'No outside JS or CSS allowed');
  assert.ok(fs.existsSync(path.join(root,file)),file+' missing from release tree');
 }
 for(const name of [
  'service-v3-weekly-schedule.js','service-v3-slot-capacity.js',
  'service-v3-booking-director-choices.js','service-v3-arrival-preview.js',
  'service-v3-fusion-builder.css','ui/booking-slot-cards.css'
 ])assert.ok(files.includes(name),name+' not loaded');
});
test('RM-005 MAIN: keep PROD login and existing Reception/second-occupant protections',()=>{
 const prodEnvironment=script('restomanager-env.js');
 assert.match(prodEnvironment,/if\(location\.origin!=="https:\/\/dylanl-dev\.github\.io"\)/);
 assert.match(prodEnvironment,/https:\/\/tnsrkargogckgtsxipwd\.supabase\.co/);
 assert.doesNotMatch(prodEnvironment,/lykoybacslvmhtzftqsf|sb_secret_|service_role/i);
 for(const file of ['supabase-service-bridge.js','supabase-login.js']){
  assert.match(script(file),/import \{supabaseEnvironment\} from '\.\/restomanager-env\.js\?v=2026\.11\.21-rm015\.10-main'/);
  assert.doesNotMatch(script(file),/lykoybacslvmhtzftqsf|sb_secret_|service_role/i);
 }
 assert.doesNotMatch(html,/lykoybacslvmhtzftqsf|restomanager-env\.js/);
 assert.match(html,/rm005SecondOccupantNotice/);
 assert.match(html,/receptionTableCaptionFix/);
 assert.match(html,/html\.reception label:has\(#bookingTable\)/);
 assert.match(html,/service-v3-arrival-preview\.js\?v=20261114-(?:main-advisory1|rm008-closed1)/);
 assert.match(script('v3-connected-auth.js'),/install_walkin_group_v4/);
 assert.match(script('v3-connected-auth.js'),/create_fusion_chain_v1/);
});
test('RM-005 MAIN: arrival advisory does not mutate restaurant state',()=>{
 const s=script('service-v3-arrival-preview.js');
 assert.match(s,/RestoSharedDataLoaded/);
 assert.match(s,/RestoArrivalPreviewRefresh/);
 assert.match(s,/parisNowTime/);
 assert.doesNotMatch(s,/\.rpc\(|\.update\(|\.insert\(|\.delete\(|fetch\(/);
});
