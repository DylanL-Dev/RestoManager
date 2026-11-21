'use strict';
// Application schema on real local Auth/PostgREST/Realtime. No shared project.
const fs=require('node:fs'),path=require('node:path');
module.exports=async({sql,root})=>{
 const apply=file=>sql(fs.readFileSync(path.join(root,file),'utf8'));
 await sql('grant anon,authenticated,resto_service_writer to postgres;');
 await apply('tests/postgres/dev-snapshot-20261110.sql');
 await sql('alter table public.restaurant_hours add column if not exists saturday_lunch_closed boolean not null default false,add column if not exists sunday_lunch_closed boolean not null default false,add column if not exists arrival_limit_percent integer not null default 85;');
 for(const file of ['20261112211500_weekly_schedule_dev.sql','20261112212500_weekly_hours_rls_dev.sql','20261117100000_rm012_intelligent_closeout.sql']){
  const actual=fs.readdirSync(path.join(root,'supabase/migrations')).find(name=>file.includes('rm012_')?name.endsWith('_rm012_intelligent_closeout.sql'):name===file);
  await apply('supabase/migrations/'+actual);
 }
 await apply('supabase/migrations/20261118190351_rm015_secure_public_booking.sql');
 await sql('revoke usage on schema auth from public,rm015_public_writer;grant usage on schema auth to anon,authenticated,service_role,resto_service_writer;');
 await apply('supabase/migrations/20261119085721_rm015_backend_auth_permissions.sql');
 // Storage SQL boundary only: this mission exercises Auth/REST/Realtime, not Storage HTTP.
 await sql("create role supabase_storage_admin nologin;create schema storage authorization supabase_storage_admin;create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null references storage.buckets(id),name text not null,metadata jsonb,owner uuid,unique(bucket_id,name));alter table storage.buckets owner to supabase_storage_admin;alter table storage.objects owner to supabase_storage_admin;alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to anon,authenticated;grant all on storage.buckets,storage.objects to service_role;");
 for(const file of ['20261119182041_rm015_portal_cover_media.sql','20261120074140_rm015_public_restaurant_profile.sql','20261120173728_rm015_public_hotel_guests.sql'])await apply('supabase/migrations/'+file);
 const plan=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}}]));
 await sql("delete from public.reservation_tables;delete from public.reservations;delete from public.table_holds;update public.restaurant_hours set weekly_schedule='"+JSON.stringify(plan)+"'::jsonb,arrival_limit_percent=85,duration=60;update public.restaurant_tables set seats=case when label='1' then 4 else 2 end;");
 await sql('notify pgrst,\'reload schema\';');
};
