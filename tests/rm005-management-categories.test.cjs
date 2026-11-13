'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=filename=>fs.readFileSync(path.join(root,filename),'utf8');
const screens=read('service-v3-screens.js'),fusions=read('service-v3-fusions.js'),styles=read('service-v3-management-categories.css'),html=read('v3-connected.html');
test('Gestion provides dedicated Salles, Tables, Fusions, Cloture and Rapports categories',()=>{
 for(const x of ['manageHours','manageTables','manageFusions','manageClosure','manageReports'])assert.ok(screens.includes(x),x);
 assert.match(screens,/const fusions=tables\?\.querySelector\('\.fusionAdmin'\)/);
 assert.match(screens,/if\(fusions\)fusions\.remove\(\)/);
 assert.match(screens,/categoryContent\.append\(wrapper\)/);
 assert.match(screens,/categoryNav\.append\(button\)/);
 assert.match(screens,/activateCategory\(id/);
});
test('Authorized fusions are categorized and distinguished from underlying pair links',()=>{
 assert.match(fusions,/\[0,'Toutes'\],\[2,'2 tables'\],\[3,'3 tables'\],\[4,'4 tables'\]/);
 assert.match(fusions,/rmFusionGroupRow/);
 assert.match(fusions,/rmFusionTableHead/);
 assert.match(fusions,/rmFusionGroupStatus/);
 assert.match(fusions,/linkDetails\.open=true/);
 assert.match(fusions,/linkDetails\.append\(linkSummary,linkDescription\)/);
 assert.match(fusions,/rmFusionTechnical/);
 assert.match(fusions,/Les groupes résultent des associations autorisées/);
});
test('Layout offers desktop navigation and table, tablet/mobile navigation and cards',()=>{
 assert.match(html,/service-v3-management-categories\.css\?v=20261113-room-filter1/);
 assert.match(html,/service-v3-screens\.js\?v=20261112-management-layout1/);
 assert.match(html,/service-v3-fusions\.js\?v=20261112-management-layout1/);
 assert.match(styles,/grid-template-columns:220px minmax\(0,1fr\)/);
 assert.match(styles,/\.rmFusionTableHead,\.rmFusionGroupRow/);
 assert.match(styles,/@media\(max-width:1050px\)/);
 assert.match(styles,/@media\(max-width:640px\)/);
 assert.match(styles,/\.rmManagementCategoryNav\{position:static;flex-direction:row;overflow-x:auto/);
});
