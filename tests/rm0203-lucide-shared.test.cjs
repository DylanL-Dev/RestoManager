'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const source=read('lucide-local.js');
function setup(){
 const attrs=new Map(),replaced=[];const host={getAttribute:n=>n==='data-lucide'?'alert-triangle':n==='class'?'staff-action':null,replaceWith:svg=>replaced.push(svg)};
 const document={createElementNS:(ns,tag)=>({ns,tag,attrs:new Map(),setAttribute(n,v){this.attrs.set(n,v)}}),querySelectorAll:()=>[host]};
 const window={};vm.runInNewContext(source,{window,document});return {lib:window.lucide,replaced};
}
test('RM-020.3: all 77 historical icons, 9 alias mappings and the 38 Creator icons resolve locally',()=>{
 const {lib}=setup();assert.equal(lib.version,'1.79.0');
 for(const n of 'table-2 star map-pin circle-user-round log-out clipboard-list building-2 hotel wifi bug send arrow-left arrow-left-right save refresh-cw layout-grid calendar-plus chevron-left chevron-right calendar-days plus clock-3 settings search check-check chart-no-axes-column chevron-down chevron-up ellipsis arrow-up-down sun moon monitor check-circle-2 trash-2 user-x x check alert-triangle circle-help info alert-circle alarm-clock file-down bell utensils-crossed user-plus calendar-clock armchair activity minus users zap utensils bed-double user-round users-round triangle-alert link-2 layers notebook-pen copy clock-alert x-circle pencil arrow-up arrow-down circle-dot sparkles bell-off calendar-x wifi-off clipboard-check arrow-up-right sliders-horizontal image shield-check layout-dashboard store life-buoy settings-2 menu panel-left-close panel-left-open building inbox flag circle-check external-link lock-keyhole server chef-hat mail log-in key-round file-text cookie shield'.split(' '))assert.ok(lib.hasIcon(n),n);
 for(const [legacy,canonical] of Object.entries({'building-2':'building-complex','check-circle-2':'circle-check','trash-2':'trash','alert-triangle':'triangle-exclamation-point','triangle-alert':'triangle-exclamation-point','circle-help':'circle-question-mark','alert-circle':'circle-exclamation-point','clock-alert':'clock-exclamation-point','x-circle':'circle-x'}))assert.equal(lib.createIcon(legacy).innerHTML,lib.createIcon(canonical).innerHTML);
 for(const n of ['unknown','constructor','__proto__','toString'])assert.equal(lib.createIcon(n),null);
});
test('RM-020.3: keep classic replacement and Creator nested renderer options',()=>{
 const {lib,replaced}=setup();lib.createIcons();assert.equal(replaced.length,1);assert.equal(replaced[0].attrs.get('class'),'staff-action');assert.equal(replaced[0].attrs.get('aria-hidden'),'true');
 const svg=lib.createIcon('mail',{size:30,strokeWidth:1.85,className:'lucide lucide-mail'});assert.equal(svg.attrs.get('width'),'30');assert.equal(svg.attrs.get('stroke-width'),'1.85');assert.equal(svg.attrs.get('class'),'lucide lucide-mail');
 assert.match(read('creator-lucide.js'),/import '\.\/lucide-local\.js\?v=20261124-rm0203'/);assert.match(read('creator-lucide.js'),/host\.replaceChildren\(icon\)/);
});
test('RM-020.3: cache version, all public/staff static icon references, bundled licenses',()=>{
 const {lib}=setup();for(const name of ['v3-connected.html','inscription.html','reservation/index.html','reservation/live.html','creator.html']){const html=read(name);for(const [,icon] of html.matchAll(/data-lucide=["']([\w-]+)["']/g))assert.ok(lib.hasIcon(icon),name+': '+icon);if(name!=='creator.html')assert.match(html,/lucide-local\.js\?v=[\w.-]*rm0203/);}
 assert.match(read('sw.js'),/restomanager-shell-20261125-dev-rmsec04/);assert.match(read('sw.js'),/"lucide-local.js"/);assert.match(source,/ISC License/);assert.match(source,/MIT License/);
});
