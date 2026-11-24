'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const inbox=read('creator-admin.js'),html=read('creator.html'),auth=read('creator-auth.js'),css=read('creator-console.css'),staff=read('service-v3-feedback.js');
test('RM-019 : centre de support uniquement visible après authentification Root DEV',()=>{
 assert.match(html,/data-owner-section="reports" hidden/);
 assert.match(html,/id="ownerInbox" aria-label="Signalements privés"/);
 assert.match(html,/data-owner-nav="reports"><span class="ownerNavIcon" data-lucide="life-buoy"><\/span> <span>Centre d’assistance/);
 assert.match(auth,/if\(!await verifyOwner\(\)\)throw/);
 assert.match(auth,/from\('platform_admins'\)/);
 assert.match(auth,/creator-admin\.js\?v=20261123-rm019/);
 assert.match(auth,/supabaseEnvironment\.name!=='DEV'/);
 assert.match(html,/creator-console\.css\?v=20261124-rm0191-visible/);
 assert.match(html,/creator-auth\.js\?v=20261124-rm0191-visible/);
 assert.doesNotMatch(html,/creator-auth\.js\?v=20261123-rm0174/,'The old Auth URL could keep the old import cached');
 assert.match(html,/class="ownerSupportNavNew">Nouveau/);
 assert.match(html,/SUPPORT PRIVÉ · RM-019\.1/);
 assert.doesNotMatch(inbox,/rootdev|ROOT_AUTH_EMAIL|signInWithPassword/);
});
test('RM-019 : même structure et statut SQL que les demandes existantes',()=>{
 assert.match(inbox,/from\('platform_reports'\)/);
 assert.match(inbox,/\.select\('id,restaurant_id,submitted_role,kind,severity,title,description,reply_contact,screen,status,created_at'\)/);
 assert.match(inbox,/\.order\('created_at',\{ascending:false\}\)\.limit\(200\)/);
 assert.match(inbox,/from\('restaurants'\)\.select\('id,name'\)/);
 assert.match(inbox,/\.update\(\{status:next\}\)\.eq\('id',item\.id\)/);
 assert.match(inbox,/restomanager:root-reports-updated/);
 assert.doesNotMatch(inbox,/\.insert\(|\.delete\(|\.upsert\(|\.rpc\(|auth\.admin|service_role|fetch\(/);
 for(const status of ['new','reviewing','resolved'])assert.match(inbox,new RegExp(status+':'));
 for(const kind of ['bug','question','suggestion'])assert.match(inbox,new RegExp(kind+':'));
});
test('RM-019 : interface moderne locale sans nouvelle collecte et scripts distants',()=>{
 for(const id of ['ownerReportSearch','ownerReportUrgentOnly','ownerSupportOpen','ownerSupportUrgent','ownerSupportResolved','ownerSupportDetail','ownerStatusFeedback']){
  assert.ok(inbox.includes(id),'Missing '+id);
 }
 assert.match(inbox,/\.textContent=text/);
 assert.match(inbox,/selector\.value=old/);
 assert.match(inbox,/if\(error\)throw error/);
 assert.match(inbox,/setAttribute\('aria-pressed'/);
 assert.match(inbox,/Intl\.DateTimeFormat\('fr-FR'/);
 assert.doesNotMatch(inbox,/\.innerHTML|insertAdjacentHTML|document\.cookie|localStorage|sessionStorage/);
 assert.match(css,/\.ownerSupportWorkspace/);
 assert.match(css,/@media\(max-width:920px\)/);
 assert.match(css,/html\[data-theme="dark"\] #ownerInbox/);
 assert.match(css, /prefers-reduced-motion/);
});
test('RM-019 : le formulaire des équipes garde sa destination, son schéma et ses protections',()=>{
 assert.match(staff,/from\('platform_reports'\)\.insert\(data\)/);
 assert.match(staff,/supabase\.auth\.getUser\(\)/);
 assert.match(staff,/if\(!profile\?\.active\|\|!\['fb_admin','reception'\]\.includes\(profile\.role\)\)return/);
 assert.match(staff,/reply_contact:group\.querySelector/);
 assert.match(staff,/N.indiquez ni données personnelles de clients ni mots de passe/);
});
