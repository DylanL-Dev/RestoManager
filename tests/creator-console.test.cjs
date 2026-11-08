'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('creator.html'),auth=read('creator-auth.js'),consoleCode=read('creator-console.js'),css=read('creator-console.css');
test('Root V1 console preserves verified authentication and original private inbox',()=>{
 assert.match(auth,/verifyOwner\(\)/);
 assert.match(auth,/from\('platform_admins'\)/);
 assert.match(auth,/installCreatorConsole\(\{client,installOwnerInbox\}\)/);
 assert.match(consoleCode,/installOwnerInbox\(\{client\}\)/);
 assert.match(html,/id="ownerInbox"/);
 assert.match(html,/id="ownerLogout"/);
 assert.match(html,/id="loginPanel"/);
 assert.match(html,/id="ownerPanel"[^>]*hidden/);
});
test('Root V1 console does not mutate restaurants or reservations or impersonate employees',()=>{
 assert.match(consoleCode,/from\('restaurants'\)\.select\('id,name'\)/);
 assert.match(consoleCode,/from\('platform_reports'\)\.select/);
 assert.doesNotMatch(consoleCode,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(|signInWithPassword|service_role/);
 assert.doesNotMatch(html,/newReservationBtn|closeServiceBtn|reservationSearch/);
 assert.match(html,/lecture seule/i);
});
test('Root V1 console supplies responsive navigation and dedicated stylesheet',()=>{
 for(const key of ['dashboard','restaurants','reports','monitoring','settings'])assert.match(html,new RegExp('data-owner-section="'+key+'"'));
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/height:100dvh/);
 assert.match(html,/creator-console\.css/);
});
