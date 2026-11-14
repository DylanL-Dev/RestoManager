'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'service-v3.js'), 'utf8');
const firstModuleEnd = js.indexOf('\n})();\n(function(){');
if (firstModuleEnd < 1000) throw new Error('Module de pression introuvable');
const rushCode = js.slice(0, firstModuleEnd + '\n})();'.length);
const baseShifts = {
  lunch: { enabled: true, start: '12:00', end: '14:30' },
  dinner: { enabled: true, start: '19:00', end: '21:30' },
};
const copy = obj => JSON.parse(JSON.stringify(obj));
function sandbox(weekly, sharedPercent=45, storedPercent=60) {
  const win = { addEventListener(){} };
  const context = vm.createContext({
    window: win,
    document: {getElementById(){return null},addEventListener(){},visibilityState:'visible'},
    localStorage: {getItem(){return JSON.stringify({percent:storedPercent})}},
    TableStore: {get(){return {tables: Array.from({length:22}, (_,i)=>({number:i+1,capacity:2}))
      .concat([{number:25,capacity:10}])}}},
    setInterval(){},
    console, Date, Intl, Math, Number, String, Object, Array, JSON, Set, Map,
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'reservation-engine.js'), 'utf8'), context);
  context.RestoSharedHours = {
    shifts: copy(baseShifts), weeklySchedule:weekly,
    weekend:{supported:true,saturdayLunchClosed:true,sundayLunchClosed:true},
    duration:90, arrivalLimitPercent:sharedPercent,
  };
  vm.runInContext(rushCode, context);
  return {rush:win.RestoRush,context};
}
const weekly=(()=>{
 const s={};
 for (const day of ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])
   s[day]=copy(baseShifts);
 s.saturday.lunch.enabled=false;
 s.sunday.lunch.enabled=false;
 return s;
})();

test('RM-008: le seuil partagé supplante le réglage local',()=>{
 const {rush}=sandbox(weekly,45,60);
 assert.equal(rush.settings().percent,45);
 assert.equal(rush.evaluate({date:'2026-11-14',time:'19:00',guests:0},[]).limit,25);
});
test('RM-008: samedi et dimanche midi affichent un service fermé',()=>{
 const {rush}=sandbox(weekly);
 for(const date of ['2026-11-14','2026-11-15']){
  assert.equal(rush.evaluate({date,time:'12:00',guests:0},[]).invalid,true);
  assert.equal(rush.windowFor(date,'12:00'),null);
  assert.equal(rush.evaluate({date,time:'19:00',guests:0},[]).invalid,undefined);
 }
});
test('RM-008: le seuil est identique pour les deux comptes',()=>{
 const reception=sandbox(weekly,45,60).rush;
 const restaurant=sandbox(weekly,45,45).rush;
 for(const role of [reception,restaurant]){
  const data=role.evaluate({date:'2026-11-14',time:'19:00',guests:0},[]);
  assert.equal(data.limit,25);
  assert.equal(data.current,0);
 }
});
test('RM-008: dates ouvertes et réservations prises en compte',()=>{
 const {rush}=sandbox(weekly);
 const list=[{id:'a',date:'2026-11-16',time:'19:00',guests:7,status:'confirmed'}];
 const data=rush.evaluate({date:'2026-11-16',time:'19:00',guests:0},list);
 assert.equal(data.current,7);
 assert.equal(data.limit,25);
 assert.equal(rush.evaluate({date:'2026-11-16',time:'12:00',guests:0},[]).invalid,undefined);
});
test('RM-008: instantané Supabase expose le pourcentage partagé',()=>{
 let source=fs.readFileSync(path.join(root,'service-snapshot.js'),'utf8');
 source=source.replace('export function prepareServiceSnapshot','function prepareServiceSnapshot');
 const ctx=vm.createContext({Intl,Date,Number,Map,String,Array,Object,Math,Error});
 vm.runInContext(source+'\nthis.prepareServiceSnapshot=prepareServiceSnapshot;',ctx);
 const snapshot={hours:{
  lunch_enabled:true,lunch_start:'12:00:00',lunch_end:'14:30:00',
  dinner_enabled:true,dinner_start:'19:00:00',dinner_end:'21:30:00',
  duration:90,arrival_limit_percent:45,weekly_schedule:weekly,
  saturday_lunch_closed:true,sunday_lunch_closed:true,
 },rooms:[{id:'main',name:'Salle',active:true}],tables:[],reservations:[],assignments:[],holds:[],fusionLinks:[],revision:'1',capabilities:{}};
 const result=ctx.prepareServiceSnapshot(snapshot,()=>({notes:'',allergies:'',type:'hotel'}));
 assert.equal(result.values.RestoSharedHours.arrivalLimitPercent,45);
});
