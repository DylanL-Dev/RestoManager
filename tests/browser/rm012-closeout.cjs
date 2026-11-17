'use strict';
// Real application + actual RM-012 PostgreSQL functions, isolated behind auth fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {open,server}=require('./rm013a-management.cjs'),{start,uid,rid,booking,lit}=require('../postgres/rm012-support.cjs');
const out=process.env.BROWSER_ARTIFACTS||path.resolve('test-results/rm012-browser'),results=[];
const selected=p=>p.locator('#rm012DayTitle'),item=(p,n)=>p.locator('.rm012Item[data-reservation-id="'+booking(n)+'"]');
async function capture(page,name){await page.clock.runFor(120);if(!await page.getByRole('alertdialog').count()&&await page.locator('#rm012Workspace').isVisible())await page.evaluate(name=>{const target=document.querySelector(name.startsWith('closed-history')?'.rm012Audit':'#rm012Workspace');const top=target.getBoundingClientRect().top+scrollY;scrollTo({top:Math.max(0,top-84),behavior:'instant'})},name);await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'})}
async function category(page){await page.waitForFunction(()=>window.RestoCloseout?.enabled===true);await page.evaluate(()=>window.RestoManagementCategories.open('manageClosure'));await selected(page).waitFor();await page.waitForFunction(()=>!document.querySelector('#rm012Workspace .rm012Status').textContent.includes('Actualisation'));}
const confirm=p=>p.getByRole('alertdialog').getByRole('button',{name:/^(Libérer la table|Confirmer l’absence|Le client a été servi|Clôturer ce service|Corriger une arrivée erronée)$/,exact:true}).click();
async function layout(page){
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow');
 const controls=await page.locator('#rm012Workspace button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({text:n.textContent,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
 for(const c of controls)assert.ok(c.width>=24&&c.height>=43,JSON.stringify(c));
 assert.equal(await page.locator('#rm012Workspace [data-lucide]').count(),0,'All icons resolved from local Lucide');
}
(async()=>{let db,browser;try{
 fs.mkdirSync(out,{recursive:true});db=await start();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
 const calls=[];let loseResponse=false;
 async function app(width,role='fb_admin',user=role==='reception'?3:1,missingCapability=false){
  return open(browser,origin,width,role,{userId:uid(user),restaurantId:rid(1),snapshot:async()=>{const snapshot=await db.snapshot(user);if(missingCapability)delete snapshot.capabilities.service_regularization;return snapshot},query:(spec,fallback)=>spec.table==='restaurants'?{data:spec.single?{id:rid(1),name:'Restaurant de démonstration'}:[{id:rid(1),name:'Restaurant de démonstration'}],error:null}:fallback(spec),rpc:async(name,args)=>{
   calls.push({name,args:structuredClone(args),user});const value=await db.rpc(name,args,user);
   if(loseResponse&&name==='rm012_regularize_v1'&&!value.error){loseResponse=false;return {data:null,error:{code:'NETWORK',message:'Isolated test: committed response lost'}}}return value;
  }});
 }
 for(const width of (process.env.RM012_WIDTH?[Number(process.env.RM012_WIDTH)]:[360,390,430,768,1024,1440,1920]))for(const role of ['fb_admin','reception']){
  await db.reset();calls.length=0;const v=await app(width,role),{page}=v;
  try{
   if(role==='reception'){
    await page.clock.runFor(300);assert.equal(await page.locator('#rm012Workspace').isVisible(),false);assert.equal(calls.filter(c=>c.name.startsWith('rm012_')).length,0);
    const denied=await page.evaluate(async()=>{const {supabase}=await import('./supabase-service-bridge.js?v=20261114-rm010-sync-poll1');return supabase.rpc('rm012_services_v1',{})});assert.equal(denied.error.code,'42501');
    if([390,768,1440].includes(width))await capture(page,'reception-protected-'+width);
   }else{
    await category(page);assert.match(await selected(page).innerText(),/07\/11\/2032/);assert.equal(await page.locator('.rm012Item').count(),3);assert.equal(await page.getByRole('button',{name:'Clôturer le service du 07/11/2032',exact:true}).isDisabled(),true);
    await layout(page);if([390,768,1440].includes(width))await capture(page,'review-'+width);
    await page.evaluate(()=>document.documentElement.dataset.theme='dark');await layout(page);if([390,768,1440].includes(width))await capture(page,'review-dark-'+width);await page.evaluate(()=>document.documentElement.dataset.theme='light');
    const today=await db.json('select to_jsonb(r) from public.reservations r where id='+lit(booking(4)));
    await item(page,1).getByRole('button',{name:'Libérer la table',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.match(await page.getByRole('alertdialog').innerText(),/Service du 07\/11\/2032/i);
    assert.equal(await db.ok('select count(*) from public.service_regularization_audit'),'0');await page.keyboard.press('Escape');assert.equal(await item(page,1).count(),1,'Cancelling does not infer a departure');
    await item(page,1).getByRole('button',{name:'Libérer la table',exact:true}).click();if([390,768,1440].includes(width))await capture(page,'confirm-release-'+width);await confirm(page);await item(page,1).waitFor({state:'detached'});
    await item(page,2).getByRole('button',{name:'Confirmer l’absence',exact:true}).click();await confirm(page);await item(page,2).waitFor({state:'detached'});
    await item(page,3).getByRole('button',{name:'Le client a été servi',exact:true}).click();await confirm(page);assert.match(await page.getByRole('alertdialog').innerText(),/au moins 5 caractères/);assert.equal(await db.ok('select count(*) from public.service_regularization_audit'),'2');await page.getByRole('textbox',{name:'Motif de la correction',exact:true}).fill('Service effectué, suivi oublié au départ');await confirm(page);await item(page,3).waitFor({state:'detached'});
    const close=page.getByRole('button',{name:'Clôturer le service du 07/11/2032',exact:true});await page.waitForFunction(()=>document.querySelector('[data-focus="close-day"]')?.disabled===false);
    await page.locator('.serviceBell').click();const alert=page.locator('[data-notification-id="rm012:service:2032-11-07"]');assert.equal(await alert.count(),1);assert.match(await alert.innerText(),/clôture reste à confirmer/);assert.equal(await alert.locator('.rmNcDismiss').count(),0);await page.getByRole('button',{name:'Tout marquer comme lu',exact:true}).click();assert.equal(await alert.count(),1,'Reading never resolves an unclosed service');await alert.getByRole('button',{name:'Régulariser ce service',exact:true}).click();await selected(page).waitFor();
    await close.click();assert.match(await page.getByRole('alertdialog').innerText(),/uniquement la journée du 07\/11\/2032/);assert.equal(await db.ok('select count(*) from public.service_closures'),'0');assert.equal(await page.getByRole('alertdialog').getByRole('textbox').count(),0,'No unused comment field on administrative closure');await confirm(page);
    await page.waitForFunction(()=>document.querySelector('.rm012DayHead .rm012Badge')?.textContent==='Clôturé');assert.match(await page.locator('.rm012Detail').innerText(),/clôturé le 08\/11/);assert.deepEqual(await db.json('select to_jsonb(r) from public.reservations r where id='+lit(booking(4))),today);
    await page.locator('.rm012Audit>summary').click();assert.equal(await page.locator('.rm012AuditRow').count(),4);if([390,768,1440].includes(width))await capture(page,'closed-history-'+width);
    await page.locator('.serviceBell').click();assert.equal(await alert.count(),0,'Service notification disappears only after real closure');await page.getByRole('button',{name:'Fermer les notifications',exact:true}).click();await layout(page);
   }
   assert.deepEqual(v.errors,[]);results.push(role+' '+width+' real database review, confirmation, audit, current-day preservation and notifications');console.log('PASS RM-012 '+role+' '+width);
  }catch(error){await capture(page,'failure-'+role+'-'+width);console.error('Last RM-012 calls',calls.slice(-4));throw error}finally{await v.context.close()}
 }
 // Responses lost AFTER a committed write must never create a duplicate audit.
 await db.reset();const v=await app(390),{page}=v;await category(page);loseResponse=true;calls.length=0;
 await item(page,1).getByRole('button',{name:'Libérer la table',exact:true}).click();await confirm(page);await page.locator('.rm012Outcome').waitFor({state:'visible'});assert.equal(await db.ok('select count(*) from public.service_regularization_audit'),'1');
 await page.evaluate(()=>{window.__rm012NoReload=true;void window.RestoAppRefresh.request({kind:'update'})});await page.getByRole('alertdialog').waitFor();assert.match(await page.getByRole('alertdialog').innerText(),/enregistrement.*en cours/);await page.getByRole('alertdialog').getByRole('button',{name:'Fermer',exact:true}).click();assert.equal(await page.evaluate(()=>window.__rm012NoReload),true);
 await page.getByRole('button',{name:'Vérifier l’enregistrement',exact:true}).click();await page.locator('.rm012Outcome').waitFor({state:'hidden'});assert.equal(await db.ok('select count(*) from public.service_regularization_audit'),'1');const writes=calls.filter(c=>c.name==='rm012_regularize_v1');assert.equal(writes.length,2);assert.deepEqual(writes[0].args,writes[1].args);console.log('PASS RM-012 lost committed response');results.push('Lost committed response: same operation, one audit, PWA update blocked until confirmed');
 await v.context.setOffline(true);await page.evaluate(()=>dispatchEvent(new Event('offline')));assert.match(await page.locator('#rm012Workspace .rm012Status').innerText(),/revérifier|connexion/);assert.equal(await item(page,2).getByRole('button',{name:'Confirmer l’absence',exact:true}).isDisabled(),true);await v.context.setOffline(false);await page.evaluate(async()=>{dispatchEvent(new Event('online'));await window.RestoRefreshSharedService();await window.RestoCloseout.refresh()});await category(page);console.log('PASS RM-012 offline reconnect');results.push('Offline suspension and fresh reconnect with retained business anomalies');
 await page.locator('.rm012DatePicker>summary').click();await page.getByLabel('Consulter une date précise',{exact:false}).fill('2032-11-08');await selected(page).filter({hasText:'08/11/2032'}).waitFor();assert.equal(await page.locator('.rm012Item .rm012Primary').count(),0);assert.equal(await page.getByRole('button',{name:'Clôturer le service du 08/11/2032',exact:true}).isDisabled(),true);console.log('PASS RM-012 current-day protection');results.push('Explicit active current date is read-only');
 await v.context.close();
 // Two actual browser sessions, separate users, same PostgreSQL transaction locks.
 await db.reset();const a=await app(390,'fb_admin',1),b=await app(768,'fb_admin',2);await category(a.page);await category(b.page);
 for(const p of [a.page,b.page])await item(p,1).getByRole('button',{name:'Libérer la table',exact:true}).click();await confirm(a.page);await item(a.page,1).waitFor({state:'detached'});await confirm(b.page);await b.page.waitForFunction(()=>document.querySelector('#rm012Workspace .rm012Status').textContent.includes('autre poste'));assert.equal(await db.ok('select count(*) from public.service_regularization_audit'),'1');assert.equal(await item(b.page,1).count(),0);console.log('PASS RM-012 two-session stale correction');results.push('Two real sessions: stale correction refused, synchronized row and single audit');
 await a.context.close();await b.context.close();
 // Both browser users confirm the same dated close; PostgreSQL returns one archive.
 await db.reset();await db.ok("update public.reservations set status='completed' where id in ('"+[1,2,3].map(booking).join("','")+"')");
 const c=await app(390,'fb_admin',1),d=await app(1440,'fb_admin',2);await category(c.page);await category(d.page);
 for(const p of [c.page,d.page])await p.getByRole('button',{name:'Clôturer le service du 07/11/2032',exact:true}).click();
 await Promise.all([confirm(c.page),confirm(d.page)]);
 for(const p of [c.page,d.page])await p.waitForFunction(()=>document.querySelector('.rm012DayHead .rm012Badge')?.textContent==='Clôturé');
 assert.equal(await db.ok('select count(*) from public.service_closures'),'1');assert.equal(await db.ok("select count(*) from public.service_regularization_audit where action='close_service'"),'1');console.log('PASS RM-012 concurrent browser closure');results.push('Two browsers concurrently close: one archive, one closure audit');await c.context.close();await d.context.close();
 // Real RM-012 notification navigation obeys RM-011 dirty-draft guard.
 await db.reset();const dirty=await app(390);await category(dirty.page);
 await dirty.page.evaluate(()=>window.RestoScreens.show('reservationForm'));await dirty.page.locator('#bookingNotes').fill('BROUILLON RM012 À CONSERVER');
 await dirty.page.locator('.serviceBell').click();await dirty.page.locator('[data-notification-id="rm012:service:2032-11-07"]').getByRole('button',{name:'Régulariser ce service',exact:true}).click();
 await dirty.page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();assert.equal(await dirty.page.evaluate(()=>window.RestoScreens.current()),'reservationForm');assert.equal(await dirty.page.locator('#bookingNotes').inputValue(),'BROUILLON RM012 À CONSERVER');console.log('PASS RM-012 dirty draft navigation');results.push('RM-012 notification cancellation preserves the actual RM-011 dirty draft');await dirty.context.close();
 // A code deployment without the reviewed migration cannot fabricate RM-012 capability.
 calls.length=0;const inactive=await app(390,'fb_admin',1,true);await inactive.page.evaluate(()=>window.RestoManagementCategories.open('manageClosure'));
 assert.equal(await inactive.page.evaluate(()=>window.RestoCloseout.enabled),false);assert.match(await inactive.page.locator('#rm012Workspace .rm012Status').innerText(),/en attente de sa migration/);assert.equal(calls.filter(c=>c.name.startsWith('rm012_')).length,0);
 await inactive.page.clock.fastForward(16*60*60*1000);assert.equal(await db.ok('select count(*) from public.service_closures'),'0','Passing 23:30 never automatically closes a day');console.log('PASS RM-012 missing migration, no automatic close');results.push('Missing migration is explicit: no RM-012 calls and no legacy automatic midnight close');await inactive.context.close();
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,failed:0,data:'Actual PostgreSQL functions; disposable --network none container; fictional auth identities; all external browser HTTP/WS blocked',results},null,2));
}finally{await browser?.close();await db?.stop();server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
