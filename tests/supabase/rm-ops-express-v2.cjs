'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const type='private.confirm_reservation(text,text,integer,timestamptz,timestamptz,uuid[],text)';
const table=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
const booking=n=>'50000000-0000-4000-8000-'+String(n).padStart(12,'0');

module.exports=async function verify(context,waitFor){
 const {sql,accounts,root}=context;
 const apply=name=>sql(fs.readFileSync(path.join(root,'supabase/proposals/rm-ops-engine',name),'utf8'));
 // The local fixture predates the hosted v4 occupant exception. Reproduce
 // that exact predecessor and apply #292 before applying the B3 proposal.
 const previous=await sql(`select pg_get_functiondef('${type}'::regprocedure)`);
 const old='if v_room is not null and exists (';
 assert.ok(previous.includes(old));
 await sql(previous.replace(old,"if v_room is not null and not (v_role='fb_admin' and p_notes='[RM:WALKIN_SEPARATE_OCCUPANT_V1]' and current_setting('restomanager.second_occupant_confirmed',true)='yes') and exists ("));
 await apply('express-room-conflict-v1.PROPOSAL.sql');
 await sql(fs.readFileSync(path.join(root,'tests/postgres/rm-b3-dev-four-table-fixture.sql'),'utf8'));
 await apply('express-service-v2.PROPOSAL.sql');
 const links=[[5,6],[7,8],[2,4]];
 for(const link of links){
  const {error}=await accounts[0].client.rpc('change_fusion_link_v3',{p_old:null,p_new:link.map(table)});
  assert.equal(error,null);
 }
 await sql(`update public.reservations set party_size=7 where id='${booking(2)}';
  insert into public.reservation_tables(reservation_id,table_id,restaurant_id) values
   ('${booking(2)}','${table(4)}','${accounts[0].restaurantId}');`);
 await waitFor(async()=>{
  const {data,error}=await accounts[0].client.rpc('service_sync_state_v1');
  return !error&&data?.capabilities?.express_service_v2===1;
 },'B3 capabilities');

 const express=page=>page.locator('#rmExpress');
 await require('./browser-tests.cjs')({...context,webSync:async({open,passed})=>{
  const [a,b,c]=await Promise.all([open(accounts[0],false,834),open(accounts[1],false,390),open(accounts[3],false,1440)]);
  for(const {page} of [a,b,c]){
   const toggle=page.locator('#mobileAccountToggle');
   const mobile=await toggle.isVisible();if(mobile)await toggle.click();
   await page.locator(mobile?'#mobileAccountMenu':'.sidebar').getByRole('button',{name:'Mode Coup de feu',exact:true}).press('Enter');
   await express(page).waitFor();
  }
  const walk=async({page},numbers)=>{
   await express(page).getByRole('button',{name:'Passage',exact:true}).click();
   const form=express(page).getByRole('region',{name:'Passage express'});
   await form.getByRole('spinbutton',{name:'Couverts'}).fill('7');
   await form.getByRole('radio',{name:'Hôtel'}).click();
   await form.getByLabel('Chambre (facultatif)').fill('237A');
   const label=numbers.map(n=>'T'+n).join(' + ');
   await form.getByRole('button',{name:'Fusion autorisée',exact:false}).filter({hasText:label}).click();
   await form.getByRole('button',{name:'Installer 7 couverts en '+label,exact:true}).click();
   return form;
  };
  const showsRoom=(page,count)=>page.waitForFunction(count=>
   window.RestoSharedReservations.filter(row=>row.hotelRoom.toLowerCase()==='237a'&&row.status==='seated'&&row.tables.length===2).length===count,count);
  await walk(a,[5,6]);await showsRoom(b.page,1);
  const panel=(await walk(b,[7,8])).getByRole('group',{name:'Une réservation existe déjà pour cette chambre.'});
  await panel.waitFor();
  await showsRoom(a.page,1);
  await panel.getByRole('button',{name:'Installer un occupant distinct'}).click();
  await showsRoom(a.page,2);
  const ids=await a.page.evaluate(()=>window.RestoSharedReservations.filter(row=>row.hotelRoom.toLowerCase()==='237a').map(row=>row.id));
  await waitFor(()=>ids.some(id=>a.realtimeEvents.some(e=>e.id===id&&e.type==='INSERT')),'Realtime second occupant');
  assert.equal(await c.page.evaluate(()=>window.RestoSharedReservations.some(row=>row.hotelRoom.toLowerCase()==='237a')),false);
  assert.ok(!c.realtimeEvents.some(e=>ids.includes(e.id)));

  const view=express(a.page);
  await view.getByRole('searchbox').fill('102');
  await view.locator('[data-arrivals]').getByRole('button',{name:/Ch. 102/}).click();
  await view.locator('[data-suggestions]').getByRole('button',{name:/^T2 \+ T4 /}).click();
  await view.getByRole('button',{name:'Installer 102 en T2 + T4'}).click();
  await b.page.waitForFunction(id=>window.RestoSharedReservations.some(row=>row.id===id&&row.status==='seated'&&row.tables.length===2),booking(2));
  await waitFor(()=>b.realtimeEvents.some(event=>event.id===booking(2)&&event.type==='UPDATE'),'Realtime group seat');
  for(const device of [a,b,c])assert.deepEqual(device.errors,[]);
  passed('B3 Auth/PostgREST/Realtime : deuxième occupant, fusion passage et réservation, isolation de trois comptes');
 }});
 await apply('express-service-v2.ROLLBACK.sql');
 await waitFor(async()=>{
  const {data,error}=await accounts[0].client.rpc('service_sync_state_v1');
  return !error&&data?.capabilities?.express_service===1&&data.capabilities.express_service_v2===undefined;
 },'B3 rollback to B2');
 const result=await accounts[0].client.from('reservations').select('id,status').eq('id',booking(2)).single();
 assert.equal(result.error,null);assert.equal(result.data.status,'seated');
 console.log('PASS B3 retour B2 sur PostgREST, installations conservées');
};
