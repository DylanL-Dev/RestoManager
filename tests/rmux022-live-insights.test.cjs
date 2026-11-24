'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('RM-UX-02.2a: PWA fixture identifies every cache naming format without weakening production SW',()=>{
 const source=read('tests/browser/rm013a-management.cjs'),worker=read('sw.js');
 assert.ok(source.includes("/const CACHE='restomanager-shell-[^']+';/"));
 for(const v of ['20261124-dev-rm0203','20261124-dev-rmux02.2a','20261124-prod-release']){
  const input=worker.replace(/const CACHE='[^']+';/,"const CACHE='restomanager-shell-"+v+"';");
  const output=input.replace(/const CACHE='restomanager-shell-[^']+';/,"const CACHE='restomanager-shell-rm-fixture2';");
  assert.match(output,/const CACHE='restomanager-shell-rm-fixture2';/);
  assert.match(output,/v3-connected\.html/);
 }
});
test('RM-UX-02.2a: gauge uses actual occupied tables, not estimated availability',()=>{
 assert.match(read('service-v3.js'),/gauge.dataset.rmGaugeValue=String\(Math.max\(0,Math.min\(100,tablesPercent\)\)\)/);
 assert.match(read('reception-service-overview.js'),/const count=tables.length-free,percent=Math.round\(count\/tables.length\*100\)/);
 assert.match(read('reception-service-overview.js'),/ne garantit pas la disponibilité/);
 assert.match(read('service-v3-motion.js'),/previous\?\.value!==value/);
 assert.match(read('service-v3.css'),/prefers-reduced-motion:reduce/);
});
