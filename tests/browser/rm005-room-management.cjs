'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const script=fs.readFileSync(path.join(root,'service-v3-table-admin.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'v3-connected-auth.js'),'utf8');
const guardStart=auth.indexOf('const allowedForms=window.RestoReception?');
const guardEnd=auth.indexOf(' // Native HTML validation can prevent submit events entirely',guardStart);
assert.ok(guardStart>0&&guardEnd>guardStart,'Production form guard must be found');
const guardCode=auth.slice(guardStart,guardEnd);

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [390,800,1440]){
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.setContent('<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><section style="max-width:900px;margin:auto"><div class="actionPanelBody"><button id="tableAdminNew" type="button">Nouvelle table</button><form id="tableAdminForm"><input id="tableAdminNumber" type="number"><input id="tableAdminMin" type="number" value="1"><input id="tableAdminMax" type="number" value="2"><select id="tableAdminRoom"></select><button id="tableAdminSubmit" type="submit">Ajouter la table</button></form><p id="tableAdminFeedback"></p><div id="tableAdminList"></div></div></section></body></html>');
   await page.evaluate(()=>{
    let plan={version:1,rooms:[{id:'main',name:'Salle principale'},{id:'p1',name:'Salle Prestige'},{id:'e1',name:'Salle temporaire'}],tables:[{id:'table-1',number:1,capacityMin:1,capacity:4,roomId:'main'},{id:'table-2',number:2,capacityMin:1,capacity:2,roomId:'main'}]};
    window.TableStore={get:()=>structuredClone(plan),save:next=>{plan=structuredClone(next)}};
    window.ReservationEngine={normalizeReservations:v=>v,isBlocking:()=>false};
    window.RestoSharedReservations=[];
    window.RestoSupabaseReady=true;
    window.RestoReception=false;
    window.RestoSharedRoomIds=new Map([['main','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],['p1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],['e1','cccccccc-cccc-cccc-cccc-cccccccccccc']]);
    window.RestoInactiveRestaurantTables=[];
    window.RestoErrors={business:message=>Error(message),diagnostic:()=>{},message:e=>e.message};
    window.RestoDialog={confirm:async()=>true};
    window.renameCalls=[];
    window.createdRooms=[];
    const emit=()=>window.dispatchEvent(new Event('restomanager:supabase-snapshot'));
    window.RestoRenameRestaurantRoom=async(id,name)=>{
     window.renameCalls.push({id,name});
     const key=[...window.RestoSharedRoomIds].find(([,uuid])=>uuid===id)?.[0];
     plan.rooms.find(room=>room.id===key).name=name;emit();
    };
    window.RestoRefreshSharedService=async()=>{emit()};
    window.RestoCreateRestaurantRoom=async name=>{
     const id='room-added',uuid='dddddddd-dddd-dddd-dddd-dddddddddddd';
     plan.rooms.push({id,name});
     window.RestoSharedRoomIds.set(id,uuid);window.createdRooms.push(name);emit();
    };
    window.RestoCreateRestaurantTable=async({label,seats,roomId})=>{
     const roomKey=[...window.RestoSharedRoomIds].find(([,id])=>id===roomId)?.[0];
     plan.tables.push({id:'new-table',roomId:roomKey,number:Number(label.replace(/^Table /,'')),capacityMin:1,capacity:seats});
     emit();
    };
    window.RestoUpdateRestaurantTable=async()=>{};
    window.RestoSetRestaurantTableActive=async()=>{};
    window.RestoDeactivateRestaurantRoom=async id=>{
     const key=[...window.RestoSharedRoomIds].find(([,uuid])=>uuid===id)?.[0];
     plan.rooms=plan.rooms.filter(room=>room.id!==key);emit();
    };
   });
   // Install the REAL authenticated capture-phase gate before UI listeners.
   // Earlier browser mocks omitted this gate and missed the production bug.
   await page.evaluate(source=>{
    const label={textContent:''},logout=null;
    const install=new Function('label','logout',source+
      "\n document.addEventListener('submit',forbidden,true); document.addEventListener('click',forbidden,true);");
    install(label,logout);
   },guardCode);
   await page.addScriptTag({content:script});
   const manager=page.locator('.roomManager');
   assert.equal(await manager.locator('.roomManagerItem').count(),3);
   assert.match(await manager.innerText(),/Salle principale · 2 tables/);
   assert.match(await manager.innerText(),/Salle Prestige · 0 tables/);
   // A real click+submit must pass the capture-phase authorization gate.
   await manager.locator('#roomManagerName').fill('Salle supplémentaire');
   await manager.locator('#roomManagerForm button[type=submit]').click();
   await page.waitForFunction(()=>window.createdRooms.length===1);
   assert.match(await manager.innerText(),/Salle supplémentaire · 0 tables/);

   await page.locator('#tableAdminRoom').selectOption('p1');
   assert.match(await page.locator('#tableAdminList').innerText(),/Aucune table dans Salle Prestige/);
   assert.doesNotMatch(await page.locator('#tableAdminList').innerText(),/Table 1 ·/);

   const prestige=manager.locator('.roomManagerItem').filter({hasText:'Salle Prestige'});
   await prestige.locator('.roomManagerRenameToggle').click();
   assert.equal(await prestige.locator('.roomManagerRenameForm').isVisible(),true);
   await prestige.locator('.roomManagerRenameForm input').fill('Salon privé');
   await prestige.locator('.roomManagerRenameForm button[type=submit]').click();
   await page.waitForFunction(()=>window.renameCalls.length===1);
   const result=await page.evaluate(()=>window.renameCalls);
   assert.equal(result[0].id,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
   assert.equal(result[0].name,'Salon privé');
   assert.match(await manager.innerText(),/Salon privé · 0 tables/);
   assert.match(await page.locator('#tableAdminList').innerText(),/Aucune table dans Salon privé/);

   await page.locator('#tableAdminNumber').fill('27');
   await page.locator('#tableAdminMin').fill('1');
   await page.locator('#tableAdminMax').fill('2');
   await page.locator('#tableAdminSubmit').click();
   assert.match(await page.locator('#tableAdminList').innerText(),/Table 27/);
   assert.doesNotMatch(await page.locator('#tableAdminList').innerText(),/Table 1 ·/);

   await page.locator('#tableAdminRoom').selectOption('main');
   assert.match(await page.locator('#tableAdminList').innerText(),/Table 1/);
   assert.doesNotMatch(await page.locator('#tableAdminList').innerText(),/Table 27/);

   const empty=manager.locator('.roomManagerItem').filter({hasText:'Salle temporaire'});
   await empty.locator('button').filter({hasText:'Supprimer'}).click();
   assert.doesNotMatch(await manager.innerText(),/Salle temporaire/);
   assert.equal(await manager.locator('.roomManagerItem').count(),3);

   const protectedRoom=manager.locator('.roomManagerItem').filter({hasText:'Salon privé'});
   await protectedRoom.locator('button').filter({hasText:'Supprimer'}).click();
   assert.match(await manager.locator('#roomManagerFeedback').innerText(),/contient encore des tables/);
   assert.match(await manager.innerText(),/Salon privé/);

   const docWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
   assert.ok(docWidth<=width+4,'Unexpected horizontal overflow at '+width+'px: '+docWidth);
   assert.deepEqual(errors,[],'Page errors: '+errors.join(', '));
   await page.close();
   console.log('PASS room create, rename, table isolation and deletion WITH auth guard at '+width+'px');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
