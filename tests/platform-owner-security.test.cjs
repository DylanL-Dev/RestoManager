'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sql=read('supabase/scripts/platform_owner_foundation.sql');
const html=read('creator.html');
const auth=read('creator-auth.js');

test('platform role has a private, default-deny membership record',()=>{
 assert.match(sql,/user_id uuid primary key references auth\.users\(id\)/i);
 assert.match(sql,/active boolean not null default false/i);
 assert.match(sql,/alter table public\.platform_admins enable row level security/i);
 assert.match(sql,/alter table public\.platform_admins force row level security/i);
 assert.match(sql,/revoke all on public\.platform_admins from public, anon, authenticated/i);
 assert.match(sql,/grant select on public\.platform_admins to authenticated/i);
 assert.match(sql,/for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id and active = true\)/i);
 assert.doesNotMatch(sql,/create policy .* for (insert|update|delete)/i);
 assert.doesNotMatch(sql,/grant (insert|update|delete|all) on public\.platform_admins to authenticated/i);
});

test('owner login cannot create or promote a user',()=>{
 assert.match(auth,/signInWithPassword/);
 assert.match(auth,/auth\.getUser\(\)/);
 assert.match(auth,/from\('platform_admins'\)/);
 assert.match(auth,/\.eq\('user_id',user\.id\)/);
 assert.match(auth,/data\.role!=='platform_admin'/);
 assert.match(auth,/!data\.active/);
 assert.doesNotMatch(auth,/auth\.signUp|auth\.admin|service_role|\.insert\(|\.update\(|\.upsert\(/);
 assert.match(html,/id="ownerPanel"[^>]*\bhidden\b/);
 assert.match(html,/id="creatorLogin"/);
 assert.match(html,/type="password"/);
 assert.doesNotMatch(html,/service_role|secret_key|sb_secret_/i);
});

test('staff login and service authorization stay separate from owner login',()=>{
 const login=read('supabase-login.js');
 const bridge=read('supabase-service-bridge.js');
 assert.match(login,/\['reception','fb_admin'\]/);
 assert.match(bridge,/!\['reception','fb_admin'\]\.includes\(profile\.role\)/);
 assert.doesNotMatch(auth,/staff_profiles/);
});

test('no owner identity or password is baked into the code',()=>{
 assert.doesNotMatch(auth,/password\s*:\s*['"][^'"]+['"]/i);
 assert.doesNotMatch(html,/value="[^"]+@[^"]+"/i);
 assert.doesNotMatch(sql,/values\s*\(\s*'[-0-9a-f]{36}'/i);
});
