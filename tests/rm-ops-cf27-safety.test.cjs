'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
const js=read('rm-coupdefeu.js'),css=read('rm-coupdefeu.css');
test('CF27 uses Paris time for the connected service, not boolean false',()=>{
 const segment=js.slice(js.indexOf('  const nowMin ='),js.indexOf('  const wrap ='));
 const context={Date:class extends Date{constructor(...a){super(...(a.length?a:['2032-11-08T18:44:00Z']))}},Intl,
  $:(selector,ex)=>({textContent:selector.includes('Access')?ex.access:ex.time})};
 vm.createContext(context);
 vm.runInContext(segment+'\nthis.refMin=refMin;',context);
 assert.equal(context.refMin({access:'Service partagé',time:'À jour'}),19*60+44);
 assert.equal(context.refMin({access:'Simulation',time:'À jour · 20:05'}),20*60+5);
});
test('CF27 never turns unknown physical occupancy into a positive availability assertion',()=>{
 assert.match(css,/data-cf-free\]::after\s*\{\s*content: "À contrôler"/);
 assert.doesNotMatch(css,/content:\s*"Libre"/);
 assert.match(read('service-v3-express.mjs'),/tab\.dataset\.expressFree=\x60\$\{free\} à contrôler\x60/);
 assert.doesNotMatch(js,/freeByRoom|lastBuckets|Object\.keys\(localStorage\)\.find/);
});
test('CF27 only confirms a release or undo from an explicit success response',()=>{
 assert.equal((js.match(/result\?\.ok !== true/g)||[]).length,2);
 assert.match(js,/await hook\.release\(/);
 assert.match(js,/await undo\(\)/);
 assert.match(js,/Annulation non confirmée/);
 assert.doesNotMatch(js,/classList\.add\('cf-freed'\)/);
});
