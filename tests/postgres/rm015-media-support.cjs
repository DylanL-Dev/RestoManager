'use strict';
// Storage transport is isolated by browser tests; these tables reproduce its RLS boundary.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {start:baseStart}=require('./rm015-support.cjs');
async function start(){
 const db=await baseStart();try{
  const before=await db.json("select jsonb_build_object('bookings',(select jsonb_agg(to_jsonb(r) order by id) from public.reservations r),'hours',(select jsonb_agg(to_jsonb(h) order by restaurant_id) from public.restaurant_hours h),'settings',(select jsonb_agg(to_jsonb(s) order by restaurant_id) from private.rm015_settings s))");
  await db.ok("create role supabase_storage_admin nologin;create schema storage authorization supabase_storage_admin;create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null references storage.buckets(id),name text not null,metadata jsonb,owner uuid,unique(bucket_id,name));alter table storage.buckets owner to supabase_storage_admin;alter table storage.objects owner to supabase_storage_admin;alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to anon,authenticated;grant all on storage.buckets,storage.objects to service_role;");
  const migration=fs.readdirSync(path.resolve(__dirname,'../../supabase/migrations')).find(f=>f.endsWith('_rm015_portal_cover_media.sql')),body=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',migration),'utf8');await db.ok(body);await db.ok(body);
  const after=await db.json("select jsonb_build_object('bookings',(select jsonb_agg(to_jsonb(r) order by id) from public.reservations r),'hours',(select jsonb_agg(to_jsonb(h) order by restaurant_id) from public.restaurant_hours h),'settings',(select jsonb_agg(to_jsonb(s)-'cover_path'-'cover_alt' order by restaurant_id) from private.rm015_settings s))");assert.deepEqual(after,before,'Media migration preserves existing business data and does not enable a restaurant');
  return {...db,mediaMigration:migration};
 }catch(e){await db.stop();throw e;}
}
module.exports={start};
