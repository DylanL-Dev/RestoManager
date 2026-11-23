'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/migrations/20261123080000_rm01732_dev_lifecycle_requests.sql');
const html=read('creator.html'),client=read('creator-console.js'),css=read('creator-console.css');
test('RM-017.3.2 security: separate request and review gates default OFF, no deletion SQL',()=>{
 assert.match(sql,/requests_enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/reviews_enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/VALUES \(1,false,false\)/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public.rm017_lifecycle_requests FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT SELECT ON public.rm017_lifecycle_requests TO authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.rm017_lifecycle_request_v1\(text,uuid\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.rm017_lifecycle_review_v1\(uuid,text\)/);
 assert.doesNotMatch(sql,/\bDELETE FROM (public|auth)\./i);
 assert.doesNotMatch(sql,/\bUPDATE (public\.(restaurants|staff_profiles|reservations)|auth\.users)\b/i);
 assert.doesNotMatch(sql,/\bTRUNCATE\b/i);
});
test('RM-017.3.2 auth: no user metadata, verified owner, active Root, MFA and audit',()=>{
 assert.match(sql,/v_uid uuid := auth\.uid\(\)/);
 assert.match(sql,/p\.created_by=v_uid/);
 assert.match(sql,/u\.email_confirmed_at IS NOT NULL/);
 assert.match(sql,/u\.is_anonymous=false/);
 assert.match(sql,/FROM public\.platform_admins/);
 assert.match(sql,/role='platform_admin' AND active=true/);
 assert.match(sql,/auth\.jwt\(\)->>'aal'/);
 assert.match(sql,/<> 'aal2'/);
 assert.match(sql,/rm01732_read_self/);
 assert.match(sql,/rm01732_read_active_root/);
 assert.match(sql,/private\.rm017_lifecycle_events/);
 assert.match(sql,/p_decision IN \('reviewing','closed_reviewed','closed_rejected'\)/);
 assert.doesNotMatch(sql,/raw_user_meta_data|user_metadata/);
});
test('RM-017.3.2 Root console is read only and preserves isolation',()=>{
 assert.match(html,/data-owner-nav="lifecycle"/);
 assert.match(html,/data-owner-section="lifecycle"/);
 for(const id of ['ownerLifecycleStatus','ownerLifecycleList','ownerRefreshLifecycle'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(client,/from\('rm017_lifecycle_requests'\)/);
 assert.match(client,/\.select\('id,kind,restaurant_id,status,created_at,updated_at'\)/);
 assert.match(client,/\.textContent/);
 assert.doesNotMatch(client,/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|auth\.admin|service_role/);
 assert.match(css,/\.ownerLifecycleList/);
 assert.match(css,/@media\(max-width:760px\)/);
});
