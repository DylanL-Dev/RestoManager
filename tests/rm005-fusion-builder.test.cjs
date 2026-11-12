'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('service-v3-fusions.js'),css=read('service-v3-fusion-builder.css'),auth=read('v3-connected-auth.js'),sql=read('supabase/migrations/20261112105000_rm005_atomic_fusion_chain_dev.sql'),html=read('v3-connected.html');
test('RM-005: fusion of 2, 3 or 4 tables is a single explicit, atomic call',()=>{
 assert.match(js,/window\.RestoCreateFusionChain\(numbers\)/);
 assert.match(auth,/create_fusion_chain_v1/);
 assert.match(sql,/FOR v_i IN 1\.\.v_n-1 LOOP/);
 assert.match(sql,/v_n NOT BETWEEN 2 AND 4/);
 assert.match(sql,/private\.lock_restaurant_mutation_v1\(\)/);
 assert.match(sql,/private\.current_staff_role\(\) IS DISTINCT FROM 'fb_admin'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.create_fusion_chain_v1/);
});
test('RM-005: same active restaurant/room, distinct tables, no auto-number adjacency',()=>{
 assert.match(sql,/t\.restaurant_id=v_rid AND r\.restaurant_id=v_rid/);
 assert.match(sql,/AND t\.active AND r\.active/);
 assert.match(sql,/count\(DISTINCT x\)/);
 assert.match(js,/physiquement voisines/);
 assert.match(js,/chosen\.push\(t\.number\)/);
 assert.match(js,/chosen\.slice\(1\)\.map/);
});
test('RM-005: mobile tablet desktop layout with real preview, groups and actions',()=>{
 assert.match(html,/service-v3-fusion-builder\.css/);
 assert.match(html,/service-v3-fusions\.js\?v=20261112-management-layout1/);
 assert.match(css,/@media\(max-width:950px\)/);
 assert.match(css,/@media\(max-width:520px\)/);
 assert.match(css,/\.rmFusionPreview/);
 assert.match(js,/window\.RestoFusion=\{pairs:groups\}/);
 assert.match(js,/rmFusionDerivedList/);
 assert.match(js,/Retirer une association/);
 assert.match(js,/window\.RestoDialog\.confirm/);
});

test('RM-005: all Lucide symbols referenced by fusion management exist in local offline bundle',()=>{
 const icons=read('lucide-local.js');
 const names=[...js.matchAll(/icon\('([^']+)'\)/g)].map(m=>m[1]);
 for(const name of names)assert.ok(icons.includes("'"+name+"'"),"Missing offline Lucide glyph: "+name);
 assert.match(icons,/'link-2':/);
 assert.match(html,/<script[^>]+src="lucide-local\.js\?v=[^"\s]+"/,'Offline Lucide bundle must be loaded with a cache key');
});
test('RM-005: approved mockup visual components and responsive layouts remain present',()=>{
 for(const cls of ['rmFusionSteps','rmFusionRoomFilter','rmFusionPreviewIllustration','rmFusionCheckRow','rmFusionGroupsHeading','rmFusionLinkText']){
  assert.ok(js.includes(cls),"Missing component "+cls);
  assert.ok(css.includes(cls),"Missing style "+cls);
 }
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(max-width:1100px\)/);
 assert.match(js,/repaintIcons\(\)/);
 assert.match(js,/roomSelect\.addEventListener\('change'/);
 assert.match(html,/service-v3-fusion-builder\.css\?v=20261112-fusion-polish2/);
});
