'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const read=file=>fs.readFileSync(file,'utf8');
const admin=read('service-v3-table-admin.js');
const actions=read('v3-supabase-booking.js');
const html=read('v3-connected.html');
const start=actions.indexOf('export async function renameRestaurantRoomShared(');
const assignment='window.RestoRenameRestaurantRoom=renameRestaurantRoomShared;';
const end=actions.indexOf(assignment,start);
assert.ok(start>=0&&end>start,'The room-rename service must be exported');
const isolatedSource=actions.slice(start,end+assignment.length).replace('export async function','async function');

function fakeService(rooms){
 const updates=[],reads=[],venue='venue-1';
 const fakeRooms=rooms.map(room=>({restaurant_id:venue,active:true,...room}));
 const supabase={from(table){
  assert.equal(table,'restaurant_rooms');
  return {
   filters:[],mode:'read',values:null,
   select(){return this},
   eq(column,value){this.filters.push({column,value});return this},
   update(values){this.mode='update';this.values=values;return this},
   then(resolve,reject){
    reads.push(this.filters.slice());
    const matches=fakeRooms.filter(row=>this.filters.every(({column,value})=>row[column]===value));
    return Promise.resolve({data:matches,error:null}).then(resolve,reject);
   },
   single(){
    const matches=fakeRooms.filter(row=>this.filters.every(({column,value})=>row[column]===value));
    if(matches.length!==1)return Promise.resolve({data:null,error:{message:'Row missing'}});
    const row=matches[0];
    updates.push({values:this.values,filters:this.filters.slice()});
    Object.assign(row,this.values);
    return Promise.resolve({data:{id:row.id,name:row.name},error:null});
   }
  };
 }};
 const window={RestoErrors:{business:message=>new Error(message)}};
 vm.runInNewContext(isolatedSource,{supabase,roomAdminClient:async()=>({restaurant_id:venue}),window,Error});
 return {rename:window.RestoRenameRestaurantRoom,rooms:fakeRooms,reads,updates};
}

test('room rename preserves UUID/table mapping and restricts writes to the current venue',async()=>{
 const salle='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const service=fakeService([{id:salle,name:'Salle à configurer'},{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',name:'Salle Prestige'}]);
 const assignments=[{room_id:salle,table_id:'table-1'},{room_id:salle,table_id:'table-2'}];
 const result=await service.rename(salle,'Salle principale');
 assert.equal(result.name,'Salle principale');
 assert.equal(service.rooms[0].id,salle);
 assert.equal(service.rooms[0].name,'Salle principale');
 assert.equal(assignments[0].room_id,salle);
 assert.equal(assignments[1].room_id,salle);
 assert.equal(service.updates.length,1);
 assert.deepEqual(Object.keys(service.updates[0].values),['name']);
 for(const expected of [
  ['restaurant_id','venue-1'],['id',salle],['active',true]
 ])assert.ok(service.updates[0].filters.some(f=>f.column===expected[0]&&f.value===expected[1]));
});

test('invalid and duplicate room names are rejected without writing',async()=>{
 const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const service=fakeService([{id,name:'Salle principale'},{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',name:'Salle Prestige'}]);
 await assert.rejects(service.rename(id,'  '),/nom de salle/i);
 await assert.rejects(service.rename(id,' salle prestige '),/porte déjà ce nom/i);
 await assert.rejects(service.rename('missing','Autre salle'),/plus disponible/i);
 assert.equal(service.updates.length,0);
});

test('unchanged room names perform no writes',async()=>{
 const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const service=fakeService([{id,name:'Salle principale'}]);
 const result=await service.rename(id,' Salle principale ');
 assert.equal(result.id,id);
 assert.equal(service.updates.length,0);
});

test('front-end offers inline rename with cancel, scoped room table list and empty state',()=>{
 assert.match(admin,/function addRoomRenameControls\(/);
 assert.match(admin,/roomManagerRenameForm/);
 assert.match(admin,/roomManagerRenameToggle/);
 assert.match(admin,/window\.RestoRenameRestaurantRoom\(roomId,name\)/);
 assert.match(admin,/RestoSharedRoomIds\?\.get\(room\.id\)/);
 assert.match(admin,/RestoRefreshSharedService\(\)/);
 assert.match(admin,/editor\.hidden=true/);
 assert.match(admin,/selectedTables=plan\.tables\.filter\(t=>t\.roomId===rooms\.value\)/);
 assert.match(admin,/Aucune table dans /);
 assert.match(admin,/RestoCreateRestaurantTable/);
 assert.match(admin,/RestoDeactivateRestaurantRoom/);
 assert.match(actions,/if\(profile\.role!=='fb_admin'\)/);
 assert.match(html,/service-v3-table-admin\.js\?v=20261114-room-rename1/);
 assert.match(html,/v3-supabase-booking\.js\?v=20261114-room-rename1/);
});
