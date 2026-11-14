'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'creator.html'),'utf8');
const consoleJs=fs.readFileSync(path.join(root,'creator-console.js'),'utf8');
const inboxJs=fs.readFileSync(path.join(root,'creator-admin.js'),'utf8');
const authJs=fs.readFileSync(path.join(root,'creator-auth.js'),'utf8');
for(const id of ['ownerNewReports','ownerReviewingReports','ownerUrgentReports']){
 assert.ok(html.includes('id="'+id+'"'),'Missing counter '+id);
 assert.ok(consoleJs.includes("setText('"+id+"'"),'Counter not updated '+id);
}
assert.ok(!html.includes('id="ownerTotalReports"'),'Misleading lifetime KPI must be removed');
assert.match(consoleJs,/reports\.filter\(x=>x\.status==='new'\)\.length/);
assert.match(consoleJs,/reports\.filter\(x=>x\.status==='reviewing'\)\.length/);
assert.match(inboxJs,/let busy=false,filter='open'/);
assert.match(inboxJs,/filter==='open'\?r\.status!=='resolved'/);
assert.match(inboxJs,/restomanager:root-reports-updated/);
assert.match(consoleJs,/restomanager:root-reports-updated/);
assert.match(authJs,/creator-console\.js\?v=20261114-rm006-root1/);
assert.match(authJs,/creator-admin\.js\?v=20261114-rm006-root1/);
console.log('Root issue counters smoke tests passed');
