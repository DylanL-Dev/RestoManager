'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../reservation-engine.js');
const html=fs.readFileSync(path.resolve(__dirname,'../v3-connected.html'),'utf8');
const ui=fs.readFileSync(path.resolve(__dirname,'../service-v3-weekly-schedule.js'),'utf8');
const css=fs.readFileSync(path.resolve(__dirname,'../service-v3-weekly-schedule.css'),'utf8');
const shifts=fs.readFileSync(path.resolve(__dirname,'../service-v3-shifts.js'),'utf8');
const auth=fs.readFileSync(path.resolve(__dirname,'../v3-connected-auth.js'),'utf8');
const snapshot=fs.readFileSync(path.resolve(__dirname,'../service-snapshot.js'),'utf8');
const week=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const sample={};for(const name of week)sample[name]={lunch:{enabled:true,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}};
sample.saturday.lunch.enabled=false;sample.sunday.lunch.enabled=false;sample.wednesday.dinner.enabled=false;
const withSchedule=fn=>{
 const previous=globalThis.RestoSharedHours;
 globalThis.RestoSharedHours={weeklySchedule:sample,shifts:sample.monday,duration:60};
 try{fn();}finally{if(previous===undefined)delete globalThis.RestoSharedHours;else globalThis.RestoSharedHours=previous;}
};
test('each weekday has independent lunch/dinner opening hours',()=>{
 withSchedule(()=>{
  assert.equal(engine.isServiceOpen('2026-11-16','12:15'),true,'Monday lunch');
  assert.equal(engine.isServiceOpen('2026-11-18','19:15'),false,'Wednesday dinner');
  assert.equal(engine.isServiceOpen('2026-11-19','19:15'),true,'Thursday dinner');
  assert.equal(engine.isServiceOpen('2026-11-21','12:15'),false,'Saturday lunch');
  assert.equal(engine.isServiceOpen('2026-11-21','19:15'),true,'Saturday dinner');
  assert.equal(engine.isServiceOpen('2026-11-22','12:15'),false,'Sunday lunch');
 });
});
test('a future reservation is checked against its target date, not current weekday',()=>{
 withSchedule(()=>{
  assert.equal(engine.getShiftsForDate('2026-11-18').dinner.enabled,false);
  assert.equal(engine.getShiftsForDate('2026-11-19').dinner.enabled,true);
  assert.equal(engine.isServiceOpen('2026-11-19','21:45'),false,'last reservation 21:30');
 });
});
test('the responsive editor loads on DEV and never writes directly to Supabase',()=>{
 assert.doesNotThrow(()=>new Function(ui));
 assert.match(html,/service-v3-weekly-schedule\.css\?v=20261112-weekly1/);
 assert.match(html,/service-v3-weekly-schedule\.js\?v=20261112-weekly1/);
 assert.match(css,/@media\(min-width:1050px\)/);
 assert.match(css,/@media\(min-width:701px\) and \(max-width:1049px\)/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(ui,/rmWeeklyCopyAll/);assert.match(ui,/rmWeeklyCopyTarget/);
 assert.doesNotMatch(ui,/\.from\(|\.rpc\(|\.insert\(|\.update\(/);
 assert.match(shifts,/RestoWeeklyScheduleDraft/);
 assert.match(auth,/profile\.role!=='fb_admin'/);
 assert.match(auth,/values\.weekly_schedule=weeklySchedule/);
 assert.match(snapshot,/weeklySchedule:hours\.weekly_schedule/);
});
