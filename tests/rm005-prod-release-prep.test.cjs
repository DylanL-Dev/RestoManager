'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const archivedRls=fs.readFileSync('supabase/release-prep/rm005_prod_hours_rls_candidate_NOT_APPROVED.sql','utf8');
const preflight=fs.readFileSync('supabase/release-prep/rm005_prod_readonly_preflight.sql','utf8');
const weekly=fs.readFileSync('supabase/release-prep/rm005_weekly_phase_a_candidate_NOT_APPLIED.sql','utf8');

test('RM-005: the already-applied RLS correction is archived and cannot be replayed from this candidate',()=>{
  assert.match(archivedRls,/ARCHIVED: TARGETED RM-005 RLS SECURITY FIX ALREADY APPLIED IN SUPABASE PROD/);
  assert.match(archivedRls,/rm005_prod_hours_rls_role_guard_20261114/);
  assert.match(archivedRls,/DO NOT RE-EXECUTE/);
  assert.doesNotMatch(archivedRls,/^\s*(?:DROP|CREATE|ALTER)\s+POLICY\s+/im);
  assert.doesNotMatch(archivedRls,/^\s*(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+public\./im);
});
test('RM-005: production audit script is read-only and inventories RLS and operating hours',()=>{
  assert.match(preflight,/SELECT jsonb_pretty/);
  assert.match(preflight,/pg_policies/);
  assert.match(preflight,/future_active_reservations_count/);
  assert.match(preflight,/restaurant_hours_summary/);
  assert.doesNotMatch(preflight,/\b(?:UPDATE|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO|ALTER|DROP\s+TABLE)\s+public\./i);
});
test('RM-005: weekly schedule candidate preserves business settings and stays unapproved',()=>{
  assert.match(weekly,/NOT APPROVED \/ NOT APPLIED/);
  assert.match(weekly,/WITHOUT A RESTORABLE BACKUP/);
  assert.match(weekly,/BEGIN;/);
  assert.match(weekly,/COMMIT;/);
  assert.match(weekly,/same_restaurant/);
  assert.match(weekly,/existing_hours=0/);
  assert.match(weekly,/ADD COLUMN weekly_schedule jsonb/);
  assert.match(weekly,/CREATE TRIGGER rm005_seed_weekly_hours_on_insert/);
  assert.match(weekly,/CREATE TRIGGER validate_restaurant_weekly_schedule/);
  assert.match(weekly,/SET weekly_schedule = \(/);
  assert.match(weekly,/WHERE h\.weekly_schedule IS NULL/);
  assert.match(weekly,/h\.lunch_enabled/);
  assert.match(weekly,/h\.dinner_enabled/);
  assert.match(weekly,/to_char\(h\.lunch_start,'HH24:MI'\)/);
  assert.match(weekly,/to_char\(h\.dinner_end,'HH24:MI'\)/);
  assert.doesNotMatch(weekly,/\bUPDATE\s+public\.reservations\b/i);
  assert.doesNotMatch(weekly,/\bDELETE\s+FROM\s+public\.reservations\b/i);
  assert.doesNotMatch(weekly,/SET\s+saturday_lunch_closed\s*=\s*true/i);
  assert.doesNotMatch(weekly,/SET\s+sunday_lunch_closed\s*=\s*true/i);
  assert.doesNotMatch(weekly,/\b(?:tnsrkargogckgtsxipwd|lykoybacslvmhtzftqsf)\b/i);
});
