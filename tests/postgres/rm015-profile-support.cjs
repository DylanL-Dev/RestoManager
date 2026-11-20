'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {start:baseStart}=require('./rm015-media-support.cjs');
async function start(){const db=await baseStart();try{
 const snapshot=()=>db.json("select jsonb_build_object('bookings',(select jsonb_agg(to_jsonb(r) order by id) from public.reservations r),'hours',(select jsonb_agg(to_jsonb(h) order by restaurant_id) from public.restaurant_hours h),'settings',(select jsonb_agg(to_jsonb(s)-'public_profile' order by restaurant_id) from private.rm015_settings s))");
 const before=await snapshot(),migration=fs.readdirSync(path.resolve(__dirname,'../../supabase/migrations')).find(f=>f.endsWith('_rm015_public_restaurant_profile.sql')),body=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',migration),'utf8');await db.ok(body);await db.ok(body);assert.deepEqual(await snapshot(),before,'Public profile migration preserves existing business data, photo and settings');
 return {...db,profileMigration:migration};
}catch(e){await db.stop();throw e;}}
module.exports={start};
