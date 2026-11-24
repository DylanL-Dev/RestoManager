'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('RM-020.4: monitoring relies on same-origin uncached read and existing RLS overview',()=>{
 const source=read('creator-console.js'),html=read('creator.html'),auth=read('creator-auth.js');
 assert.match(source,/app-release\.json\?check=rm0204/);assert.match(source,/cache:'no-store',credentials:'omit',redirect:'error'/);
 assert.match(source,/manifest\.channel!=='dev'/);assert.match(source,/void load\(\)/);assert.match(source,/monitorState\('Db','error'/);
 assert.match(source,/setText\('ownerMonitorUrgent','—'\)/);
 for(const id of ['ownerRefreshMonitoring','ownerMonitorWebState','ownerMonitorDbState','ownerMonitorUrgent','ownerMonitorRelease','ownerMonitorHistory'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(auth,/creator-console\.js\?v=20261123-rm0174-rm0204/);
 assert.match(html,/surveillance 24 h\/24/);assert.match(html,/ne prouvent pas le dernier commit déployé/);
 assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(|\.rpc\(|service_role|api\.render\.com/);
});
