'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const sql=read('supabase/scripts/bug01_private_reports.sql');
const feedback=read('service-v3-feedback.js');
const inbox=read('creator-admin.js');
const creator=read('creator-auth.js');
const html=read('creator.html');
const auth=read('v3-connected-auth.js');

test('BUG-01 private reports enforce staff origin and platform-only read',()=>{
 assert.match(sql,/alter table public\.platform_reports enable row level security/i);
 assert.match(sql,/alter table public\.platform_reports force row level security/i);
 assert.match(sql,/revoke all on public\.platform_reports from public,anon,authenticated/i);
 assert.match(sql,/submitted_by = \(select auth\.uid\(\)\)/i);
 assert.match(sql,/restaurant_id = \(select private\.staff_restaurant\(\)\)/i);
 assert.match(sql,/submitted_role = \(select private\.current_staff_role\(\)\)/i);
 assert.match(sql,/platform_admins pa/i);
 assert.match(sql,/pa\.active = true and pa\.role = 'platform_admin'/i);
 assert.doesNotMatch(sql,/for select to authenticated\s+using\s*\(\s*true\s*\)/i);
 assert.match(sql,/grant update\(status\) on public\.platform_reports to authenticated/i);
 assert.match(sql,/grant insert\(restaurant_id,submitted_by,submitted_role,kind,severity,title,description,reply_contact,screen\)/i);
 assert.match(sql,/create policy platform_owner_restaurants/i);
 assert.doesNotMatch(sql,/grant (all|delete|update|insert) on public\.platform_reports to authenticated/i);
});

test('BUG-01 staff app can only submit, never retrieve or list reports',()=>{
 assert.match(feedback,/from\('platform_reports'\)\.insert\(data\)/);
 assert.match(feedback,/supabase\.auth\.getUser\(\)/);
 assert.match(feedback,/restaurant_id:profile\.restaurant_id/);
 assert.match(feedback,/submitted_role:profile\.role/);
 assert.doesNotMatch(feedback,/from\('platform_reports'\)\.(select|update|delete)/);
 assert.match(auth,/installFeedback\(\{supabase,profile,management\}\)/);
 assert.match(auth,/reportIssueForm/);
 assert.match(feedback,/id="reportIssueContact"/);
});

test('BUG-01 creator uses verified owner login, root is only an alias',()=>{
 assert.match(creator,/const ROOT_AUTH_EMAIL='root@accounts\.restomanager\.example\.com'/);
 assert.match(creator,/value\.trim\(\)\.toLowerCase\(\)!=='root'/);
 assert.match(creator,/signInWithPassword/);
 assert.match(creator,/verifyOwner\(\)/);
 assert.match(creator,/installCreatorConsole\(\{client,installOwnerInbox\}\)/);
 assert.match(inbox,/from\('platform_reports'\)/);
 assert.match(inbox,/\.update\(\{status:selector\.value\}\)/);
 assert.match(html,/id="ownerUsername"/);
 assert.match(html,/id="ownerInbox"/);
 assert.doesNotMatch(creator,/signUp|service_role|\.insert\(|auth\.admin/);
 assert.doesNotMatch(creator,/password\s*:\s*['"][^'"]+['"]/i);
 assert.doesNotMatch(html,/value="[^"]+@[^"]+"/);
});
