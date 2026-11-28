'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

module.exports=async function run(context,waitFor){
 const {accounts,root,sql}=context;
 const apply=file=>sql(fs.readFileSync(path.join(root,file),'utf8'));
 for(const file of ['mission2_reservation_edits.sql','mission3_validation_integration.sql','reception_right_size_recommendations.sql',
  'platform_owner_foundation.sql','bug01_private_reports.sql'])await apply('supabase/scripts/'+file);
 await sql('alter table public.restaurant_hours add column saturday_lunch_closed boolean not null default false,add column sunday_lunch_closed boolean not null default false,add column arrival_limit_percent integer not null default 60;');
 for(const file of ['20261112211500_weekly_schedule_dev.sql','20261112212500_weekly_hours_rls_dev.sql',
  '20261113153000_rm005_walkin_weekly_server_dev.sql','20261113164500_rm005_weekly_helper_writer_grant_dev.sql',
  '20261117083046_rm012_intelligent_closeout.sql'])await apply('supabase/migrations/'+file);
 await sql(require('../../scripts/prepare-rm-release-03b.cjs').buildExpressReleaseSql());
 const reservationId=n=>'50000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const night=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[
  day,{lunch:{enabled:false,start:'12:00',end:'14:00'},dinner:{enabled:true,start:'00:00',end:'23:59'}}
 ]));
 await sql(`update public.restaurant_hours set lunch_enabled=false,dinner_enabled=true,dinner_start='00:00',dinner_end='23:59',weekly_schedule='${JSON.stringify(night)}';
  update public.reservations set starts_at=now(),ends_at=now()+interval '90 minutes'
  where id in ('${reservationId(1)}','${reservationId(2)}');
  update public.reservations set status='seated',seated_at=now()-interval '100 minutes'
  where id='${reservationId(3)}';
  notify pgrst,'reload schema';`);
 await waitFor(async()=>{
  const {data,error}=await accounts[0].client.rpc('service_sync_state_v1');
  return !error&&data?.capabilities?.express_service===1&&data?.capabilities?.quick_release===1;
 },'Express capabilities on disposable PostgREST');
 const express=page=>page.locator('#rmExpress');
 await require('./browser-tests.cjs')({...context,webSync:async({open,passed})=>{
  const a=await open(accounts[0],false,834), b=await open(accounts[1],false,390), c=await open(accounts[3],false,1440);
  for(const {page} of [a,b,c]){
   const toggle=page.locator('#mobileAccountToggle');
   const mobile=await toggle.isVisible();if(mobile)await toggle.click();
   await page.locator(mobile?'#mobileAccountMenu':'.sidebar').getByRole('button',{name:'Mode Coup de feu',exact:true}).press('Enter');
   await express(page).waitFor();
  }
  const select=async(page,room,table)=>{
   const view=express(page);
   await view.getByRole('searchbox').fill(room);
   await view.locator('[data-arrivals]').getByRole('button',{name:new RegExp('Ch. '+room)}).click();
   const label=new RegExp('^T'+table+' ');
   const primary=view.locator('[data-suggestions]').getByRole('button',{name:label});
   if(await primary.count())await primary.click();
   else{
    await view.locator('[data-other-tables] summary').click();
    await view.locator('[data-all-tables]').getByRole('button',{name:label}).click();
   }
  };
  await select(a.page,'101',2);
  await select(b.page,'102',2);
  await express(a.page).getByRole('button',{name:'Permuter et installer 101 en T2'}).click();
  await express(a.page).getByText('installation enregistrée en T2.',{exact:true}).waitFor();
  await express(b.page).getByText(/Le placement a changé/).waitFor();
  await waitFor(()=>b.realtimeEvents.some(event=>event.id===reservationId(1)&&event.type==='UPDATE'),'Realtime seat');
  await express(b.page).locator('[data-suggestions]').getByRole('button',{name:/^T1 /}).click();
  await express(b.page).getByRole('button',{name:'Installer 102 en T1'}).click();
  await express(b.page).getByText('installation enregistrée en T1.',{exact:true}).waitFor();

  await express(a.page).getByRole('button',{name:'Passage',exact:true}).click();
  const passage=express(a.page).getByRole('region',{name:'Passage express'});
  await passage.getByRole('button',{name:/^T5 /}).click();
  await passage.getByRole('button',{name:'Installer 2 couverts en T5'}).click();
  await express(a.page).getByText('passage installé en T5.',{exact:true}).waitFor();
  await b.page.waitForFunction(()=>window.RestoSharedReservations.some(r=>r.walkIn&&r.status==='seated'&&r.tables.includes(5)));
  const walkId=await b.page.evaluate(()=>window.RestoSharedReservations.find(r=>r.walkIn&&r.tables.includes(5)).id);
  await waitFor(()=>b.realtimeEvents.some(event=>event.id===walkId&&event.type==='INSERT'),'Realtime walk-in');
  const floor=express(a.page).locator('details[data-floor]');
  if(!await floor.evaluate(node=>node.open))await floor.locator('summary').click();
  const departed=floor.locator('[data-state=departure][data-cf-arm]').filter({has:a.page.getByText('T3',{exact:true})});
  await departed.waitFor();
  await departed.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
  await a.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await departed.click();
  await a.page.locator('.cf-dep.cf-show').getByRole('button',{name:'Libérer T3',exact:true}).press('Enter');
  const toast=a.page.locator('.cf-rel');
  await toast.getByText('T3 libérée',{exact:true}).waitFor();
  const statusOnPhone=status=>b.page.waitForFunction(({id,status})=>window.RestoSharedReservations.some(r=>r.id===id&&r.status===status),{id:reservationId(3),status});
  await statusOnPhone('released');
  await toast.getByRole('button',{name:'Annuler',exact:true}).click();
  await toast.getByText('Libération annulée.',{exact:true}).waitFor();
  await statusOnPhone('seated');
  await waitFor(()=>b.realtimeEvents.filter(event=>event.id===reservationId(3)&&event.type==='UPDATE').length>=2,'Realtime release and undo');
  assert.equal(await c.page.evaluate(ids=>window.RestoSharedReservations.some(r=>ids.includes(r.id)),[reservationId(1),walkId]),false);
  for(const device of [a,b,c])assert.deepEqual(device.errors,[]);
  passed('Express : permutation, installation, passage, libération et annulation avec Auth, PostgREST et Realtime réels');
 }});
};
