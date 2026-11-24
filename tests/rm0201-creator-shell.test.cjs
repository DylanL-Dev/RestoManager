'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('creator.html'),css=read('creator-shell.css'),js=read('creator-shell.js'),icons=['creator-lucide.js','creator-lucide-nav.js','creator-lucide-indicators.js','creator-lucide-actions.js'].map(read).join('\n'),auth=read('creator-auth.js'),core=read('creator-console.js');
test('RM-020.1: every existing Creator section has local Lucide navigation and remains addressable',()=>{
 const views=['dashboard','restaurants','reports','lifecycle','pilot','monitoring','settings'];
 const iconNames=['layout-dashboard','store','life-buoy','users-round','clipboard-check','activity','settings-2'];
 for(let i=0;i<views.length;i++){
  assert.match(html,new RegExp('data-owner-nav="'+views[i]+'"[^>]*><span class="ownerNavIcon" data-lucide="'+iconNames[i]+'"'));
  assert.match(html,new RegExp('data-owner-section="'+views[i]+'"'));
  assert.ok(icons.includes("'"+iconNames[i]+"'"));
 }
 assert.match(html,/id="ownerInbox"/);
 assert.match(html,/id="ownerRestaurantList"/);
 assert.match(html,/id="ownerLifecycleList"/);
 assert.match(html,/id="ownerPilotSummary"/);
 assert.match(html,/id="ownerLogout"/);
 assert.match(html,/id="ownerNavToggle"/);
 assert.match(html,/id="ownerNavClose"/);
});
test('RM-020.1: redesigned shell mounts only local files, preserves separate Root Auth, and refreshes module URL',()=>{
 assert.match(html,/creator-console\.css\?v=20261124-rm0191-visible/);
 assert.match(html,/creator-shell\.css\?v=20261124-rm0201/);
 assert.match(html,/creator-shell\.js\?v=20261124-rm0201/);
 assert.match(html,/creator-auth\.js\?v=20261124-rm0191-visible/);
 assert.match(js,/from '\.\/creator-lucide\.js\?v=20261124-rm0202'/);
 assert.match(auth,/from\('platform_admins'\)/);
 assert.match(auth,/if\(supabaseEnvironment\.name!=='DEV'\)throw/);
 assert.match(auth,/creator-admin\.js\?v=20261123-rm019/);
 assert.match(core,/installOwnerInbox\(\{client\}\)/);
 assert.doesNotMatch(js,/\bcreateClient\(|\.from\(|\.rpc\(|\bfetch\(/i);
 assert.doesNotMatch(icons,/\bfetch\(|\bimport\(|url\(\s*https?:\/\//);
 assert.doesNotMatch(css,/@import|url\(\s*https?:/);
 assert.match(html,/ownerWelcomeBanner/);
 assert.match(html,/ownerMetricIcon/);
 assert.match(html,/ownerThemeToggle/);
 assert.match(html,/ownerSidebarCollapse/);
});
test('RM-020.1: responsive theme and accessible interactive controls have real handlers',()=>{
 assert.match(js,/themeButton\?\.addEventListener\('click'/);
 assert.match(js,/collapseButton\?\.addEventListener\('click'/);
 assert.match(js,/aria-label.*label/);
 assert.match(js,/new MutationObserver\(upgradeRestaurantIcons\)/);
 assert.match(js,/matchMedia\('\(min-width: 1001px\)'\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(min-width:761px\) and \(max-width:1000px\)/);
 assert.match(css,/\.ownerQuickAccess>span:last-child,\.ownerAccount\{display:none\}/);
 assert.match(css,/@media\(min-width:1001px\)/);
 assert.match(css,/\[data-creator-theme="dark"\]/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(html,/aria-pressed="false"/);
 assert.match(html,/aria-expanded="false"/);
});
