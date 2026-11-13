'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const script=fs.readFileSync('supabase/release-prep/rm005_prod_hours_rls_candidate_NOT_APPROVED.sql','utf8');
const preflight=fs.readFileSync('supabase/release-prep/rm005_prod_readonly_preflight.sql','utf8');

test('RM-005 release prep: policy candidate is guarded and stays outside migration paths',()=>{
  assert.match(script,/DO NOT EXECUTE WITHOUT EXPLICIT OWNER APPROVAL/);
  assert.match(script,/BEGIN;/);
  assert.match(script,/COMMIT;/);
  assert.match(script,/expected original same_restaurant FOR ALL policy absent/);
  assert.match(script,/expected internal writer_access policy absent/);
  assert.match(script,/relrowsecurity = true/);
  assert.match(script,/DROP POLICY same_restaurant ON public\.restaurant_hours/);
  assert.match(script,/CREATE POLICY same_restaurant ON public\.restaurant_hours\s+FOR SELECT/);
  assert.match(script,/CREATE POLICY admin_edit ON public\.restaurant_hours\s+FOR UPDATE/);
  assert.match(script,/WITH CHECK \(restaurant_id=/);
  assert.match(script,/current_staff_role\(\)\)='fb_admin'/);
  assert.match(script,/FOR SELECT TO authenticated/);
  assert.doesNotMatch(script,/GRANT UPDATE .* TO (?:anon|authenticated)/i);
  assert.doesNotMatch(script,/DROP POLICY writer_access/i);
  assert.doesNotMatch(script,/\b(?:UPDATE|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO)\s+public\.(?:reservations|restaurant_hours|restaurant_tables)\b/i);
});
test('RM-005 release prep: audit script is read-only and inventories RLS and current operating values',()=>{
  assert.match(preflight,/SELECT jsonb_pretty/);
  assert.match(preflight,/pg_policies/);
  assert.match(preflight,/future_active_reservations_count/);
  assert.match(preflight,/restaurant_hours_summary/);
  assert.doesNotMatch(preflight,/\b(?:UPDATE|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO|ALTER|DROP\s+TABLE)\s+public\./i);
});
