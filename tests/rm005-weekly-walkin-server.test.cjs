'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Engine=require('../reservation-engine.js');

const read=path=>fs.readFileSync(path,'utf8');
const sql=read('supabase/migrations/20261113153000_rm005_walkin_weekly_server_dev.sql');
const walkin=read('service-v3-walkin-fast.js');
const html=read('v3-connected.html');
const weekly={
 monday:{lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}},
 tuesday:{lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}},
 wednesday:{lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}},
 thursday:{lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}},
 friday:{lunch:{enabled:true,start:'12:00',end:'16:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}},
 saturday:{lunch:{enabled:true,start:'12:00',end:'17:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}},
 sunday:{lunch:{enabled:true,start:'12:00',end:'17:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}}
};
const withWeekly=fn=>{
 const prev=globalThis.RestoSharedHours;
 globalThis.RestoSharedHours={shifts:weekly.monday,weeklySchedule:weekly,duration:60,weekend:{supported:true,saturdayLunchClosed:false,sundayLunchClosed:false}};
 try{fn();}finally{if(prev===undefined)delete globalThis.RestoSharedHours;else globalThis.RestoSharedHours=prev;}
};

test('RM005 Friday extended 12:00-16:30 permits walk-in time but rejects 16:31',()=>{
 withWeekly(()=>{
  assert.equal(Engine.isServiceOpen('2026-11-13','15:30'),true);
  assert.equal(Engine.isServiceOpen('2026-11-13','16:30'),true);
  assert.equal(Engine.isServiceOpen('2026-11-13','16:31'),false);
 });
});
test('RM005 Saturday and Sunday extended lunch remain independent',()=>{
 withWeekly(()=>{
  for(const date of ['2026-11-14','2026-11-15']){
   assert.equal(Engine.isServiceOpen(date,'16:30'),true,date);
   assert.equal(Engine.isServiceOpen(date,'17:30'),true,date);
   assert.equal(Engine.isServiceOpen(date,'17:31'),false,date);
  }
 });
});
test('RM005 disabled Sunday lunch remains closed even if common hours are open',()=>{
 withWeekly(()=>{
  weekly.sunday.lunch.enabled=false;
  try{assert.equal(Engine.isServiceOpen('2026-11-15','13:00'),false);}
  finally{weekly.sunday.lunch.enabled=true;}
 });
});
test('RM005 DEV SQL restores weekly calendar check to all server booking paths without weakening authorizations',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION private\.restaurant_service_open_at_v1/);
 assert.match(sql,/SET search_path TO ''/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.restaurant_service_open_at_v1/);
 assert.match(sql,/AT TIME ZONE 'Europe\/Paris'/);
 assert.match(sql,/EXTRACT\(ISODOW FROM local_start\)/);
 for(const name of [
  'private.install_walkin_v3','public.install_walkin_group_v3','public.install_walkin_group_v4',
  'public.booking_draft_v3','public.reception_booking_v3','public.reception_update_reservation_v4',
  'public.reception_update_reservation_with_table_v1'
 ]){
  const escaped=name.replace(/[.*+?^{}()|[\]\\]/g,'\\$&');
  const section=sql.match(new RegExp('-- Preserve existing signature and authorization: '+escaped+'\\n([\\s\\S]*?)(?=-- Preserve existing signature and authorization: |-- All 7 legacy|$)'));
  assert.ok(section,'missing '+name);
  assert.match(section[1],/SECURITY DEFINER/);
  assert.match(section[1],/private\.restaurant_service_open_at_v1/);
 }
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE TABLE|DELETE FROM public\.reservations/i);
});
test('RM005 DEV walk-in hints use actual duration and point to the weekly planning',()=>{
 assert.match(walkin,/E\.getDefaultDuration\(\)\+' minutes\. Vérifiez/);
 assert.match(walkin,/Planning hebdomadaire/);
 assert.match(html,/service-v3-walkin-fast\.js\?v=20261113-weekly-walkin1/);
 assert.doesNotThrow(()=>new Function(walkin));
});
