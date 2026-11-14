'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync('supabase/release-prep/rm005_weekly_phase_b_rpc_candidate_NOT_APPLIED.sql','utf8');

test('RM-005 Phase B cannot be mistaken for a production-ready migration',()=>{
  assert.match(sql,/NOT APPROVED, NEVER APPLIED TO PROD/);
  assert.match(sql,/BEGIN;/);
  assert.match(sql,/COMMIT;/);
  assert.match(sql,/Phase A missing; abort Phase B/);
  assert.match(sql,/helper already exists; refuse unreviewed replay/);
  assert.doesNotMatch(sql,/\bDROP\s+(?:TABLE|FUNCTION|SCHEMA|ROLE)\b/i);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO)\s+public\.reservations\b/i);
  assert.doesNotMatch(sql,/CREATE\s+POLICY|DROP\s+POLICY/i);
  assert.doesNotMatch(sql,/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.reception_update_reservation_with_table_v1/);
});
test('RM-005 Phase B retains private weekly helper and writer-only function privileges',()=>{
  assert.match(sql,/CREATE FUNCTION private\.restaurant_service_open_at_v1/);
  assert.match(sql,/LANGUAGE plpgsql STABLE SECURITY INVOKER/);
  assert.match(sql,/REVOKE ALL ON FUNCTION private\.restaurant_service_open_at_v1\(uuid,timestamptz\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION private\.restaurant_service_open_at_v1\(uuid,timestamptz\)\s+TO resto_service_writer/);
  assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION private\.restaurant_service_open_at_v1\(uuid,timestamptz\) TO (?:authenticated|anon|PUBLIC)/);
});
test('RM-005 Phase B patches exactly six known production RPCs with drift and access guards',()=>{
  const allowed = [
    'private.install_walkin_v3',
    'public.booking_draft_v3',
    'public.install_walkin_group_v3',
    'public.install_walkin_group_v4',
    'public.reception_booking_v3',
    'public.reception_update_reservation_v4',
  ];
  const sections = [...sql.matchAll(/DO \$rm005_patch_(\d)\$/g)];
  assert.equal(sections.length,6);
  for(const name of allowed){
    assert.match(sql,new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' definition drift, abort'));
    assert.match(sql,new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' changed owner/security/privileges'));
  }
  assert.equal((sql.match(/EXECUTE v_def;/g)||[]).length,6);
  assert.equal((sql.match(/definition drift, abort/g)||[]).length,6);
  assert.equal((sql.match(/clock\/tenant anchor mismatch/g)||[]).length,7);
  assert.equal((sql.match(/has_function_privilege\('authenticated',v_oid,'EXECUTE'\)/g)||[]).length,12);
  assert.match(sql,/private\.staff_restaurant\(\) for share/);
  assert.match(sql,/restaurant_service_open_at_v1\(private\.staff_restaurant\(\),p_start\)/);
  assert.match(sql,/restaurant_service_open_at_v1\(private\.staff_restaurant\(\),p_starts_at\)/);
});
