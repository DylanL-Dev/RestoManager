'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/migrations/20261122170000_rm0172_dev_secure_signup.sql');
const html=read('inscription.html'),client=read('rm017-register.js');
test('RM-017.2: actual signup remains DEV-only, closed until SMTP, redirect allowlist and Confirm Email verified',()=>{
 const cfg=JSON.parse(read('rm017-runtime.json'));
 assert.equal(cfg.enabled,false);
 assert.equal(cfg.channel,'dev');
 assert.equal(cfg.confirmationEmailRequired,true);
 assert.match(cfg.redirectOrigin,/^https:\/\/restomanager-v3-supabase-integration\.onrender\.com$/);
 assert.match(html,/id="registrationPassword"/);
 assert.match(html,/id="registrationPasswordConfirm"/);
 assert.match(html,/id="submitRegistration" disabled/);
 assert.match(html,/rm017-register\.js/);
 assert.match(html,/name="robots" content="noindex, nofollow"/);
 assert.match(client,/runtime\?\.enabled!==true/);
 assert.match(client,/isDev/);
 assert.match(client,/runtime\?\.redirectOrigin!==location\.origin/);
 assert.match(client,/emailRedirectTo:canonical/);
 assert.match(client,/auth\.signUp\(/);
 assert.match(client,/auth\.getUser\(/);
 assert.match(client,/data\?\.session/);
 assert.match(client,/auth\.signOut/);
 assert.match(client,/\.rpc\('rm017_complete_signup_v1'/);
 assert.match(client,/password\.length/);
 assert.doesNotMatch(client,/service_role|sb_secret_|tnsrkargogckgtsxipwd/i);
 assert.doesNotMatch(html,/tnsrkargogckgtsxipwd/i);
});
test('RM-017.2: email and password authorization is never accepted from editable metadata',()=>{
 assert.match(sql,/u\.email_confirmed_at IS NOT NULL/);
 assert.match(sql,/u\.is_anonymous = false/);
 assert.match(sql,/u\.deleted_at IS NULL/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.doesNotMatch(sql,/raw_user_meta_data|user_metadata/i);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/FROM public\.staff_profiles WHERE user_id=v_uid/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.rm017_complete_signup_v1/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.rm017_complete_signup_v1/);
 assert.match(sql,/CREATE TABLE private\.rm017_signup_gate/);
 assert.match(sql,/VALUES\(1,false\)/);
 assert.match(sql,/IF NOT EXISTS \(SELECT 1 FROM private\.rm017_signup_gate/);
 assert.match(sql,/ALTER TABLE public\.rm017_establishment_profiles FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/INSERT INTO public\.restaurants/);
 assert.match(sql,/INSERT INTO public\.staff_profiles/);
 assert.doesNotMatch(sql,/INSERT INTO public\.restaurant_hours/);
 assert.match(sql,/INSERT INTO public\.restaurant_rooms/);
});
test('RM-017.2: permissive employee policies must include own restaurant and never grant all tenants',()=>{
 for(const policy of ['reservations_staff_read','reservation_tables_staff_read','tables_staff_read','tables_admin_insert','tables_admin_update','holds_staff_read','active_profile']){
  assert.match(sql,new RegExp('ALTER POLICY '+policy+' ON public\\.'));
 }
 for(const policy of ['"fb alerts read"','"fb alerts mark read"','"fb manage fusion links"','"staff read fusion links"']){
  assert.ok(sql.includes('ALTER POLICY '+policy));
 }
 assert.equal((sql.match(/private\.staff_restaurant\(\)/g)||[]).length>=11,true);
 assert.match(sql,/GRANT SELECT ON TABLE public\.rm017_establishment_profiles TO authenticated/);
 assert.doesNotMatch(sql,/GRANT (INSERT|UPDATE|DELETE|ALL) ON TABLE public\.rm017_establishment_profiles TO authenticated/);
 const login=read('supabase-login.js');
 assert.match(login,/supabaseEnvironment\.name==='DEV'/);
 assert.match(login,/role:'fb_admin'/);
 assert.match(login,/Object\.hasOwn\(accounts,input\)/);
});
