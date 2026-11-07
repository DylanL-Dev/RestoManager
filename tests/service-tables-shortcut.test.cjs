'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../service-v3-screens.js'),'utf8');
const start=source.indexOf("document.addEventListener('click',e=>{");
const end=source.indexOf("\nwindow.addEventListener('hashchange'",start);
assert.ok(start>=0&&end>start,'Service link interception must be present');
function setup(){
 let click,scrolled=0,screen=null;
 const grid={scrollIntoView(options){scrolled++;assert.equal(options.block,'start')}};
 const document={
  addEventListener(name,fn){if(name==='click')click=fn},
  getElementById(id){return id==='tables'?grid:null}
 };
 const screens=new Map([['tables',{}],['reservations',{}]]);
 const navigate=id=>{screen=id};
 vm.runInNewContext(source.slice(start,end),{document,screens,navigate});
 assert.equal(typeof click,'function');
 function run(href,quick){
  let prevented=false;
  const a={getAttribute:()=>href,matches:selector=>quick&&selector==='.quickAction[href="#tables"]'};
  click({target:{closest:()=>a},preventDefault(){prevented=true}});
  return prevented;
 }
 return {run,get scrolled(){return scrolled},get screen(){return screen}};
}
test('Quick action Voir les tables jumps to the table grid',()=>{
 const t=setup();
 assert.equal(t.run('#tables',true),true);
 assert.equal(t.screen,'tables');
 assert.equal(t.scrolled,1);
});
test('regular Service navigation does not force grid scroll',()=>{
 const t=setup();
 assert.equal(t.run('#tables',false),true);
 assert.equal(t.screen,'tables');
 assert.equal(t.scrolled,0);
});
test('other navigation stays unchanged',()=>{
 const t=setup();
 assert.equal(t.run('#reservations',false),true);
 assert.equal(t.screen,'reservations');
 assert.equal(t.scrolled,0);
});
