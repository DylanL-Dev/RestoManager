'use strict';
// Actual app/auth/permissions and screens; fictional in-memory boundary only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const fixture=require('./rm013a-management.cjs');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.BROWSER_ARTIFACTS||'test-results/rm016-learning');
const widths=[360,390,430,768,1024,1440,1920],results=[];
const learningKeys=()=>Object.keys(localStorage).filter(k=>k.startsWith('restomanager:learning:v1:')&&!k.endsWith(':invitation'));
function pass(name){results.push(name);console.log('PASS '+name)}
async function screen(page){return page.evaluate(()=>window.RestoScreens.current())}
async function openHelp(page){await page.locator('#rmLearningHelp').click();await page.locator('#rmLearningCenter').waitFor({state:'visible'})}
async function start(page,id,options={}){await page.evaluate(async({id,options})=>window.RestoTutorial.startCourse(id,options),{id,options});await page.locator('#rmLearningCoach').waitFor({state:'visible'})}
async function next(page){await page.locator('#rmGuideNext').click();await page.waitForTimeout(35)}
async function targetAction(page){await page.locator('.rmLearnTarget').click();await page.waitForTimeout(55)}
async function capture(page,name){if(name.startsWith('help'))await page.evaluate(()=>{document.getElementById('rmLearningCenter').scrollTop=0});await page.screenshot({path:path.join(out,name+'.png'),fullPage:false,animations:'disabled'})}
async function layout(page,name){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow '+name);const box=await page.locator('#rmLearningCenter').boundingBox();if(box)assert.ok(box.x>=-1&&box.x+box.width<=(await page.viewportSize()).width+1,'Center fits '+name)}
async function guideLayout(page,name){
 const bounds=await page.evaluate(()=>{const c=document.getElementById('rmLearningCoach'),t=document.querySelector('.rmLearnTarget');if(!c||!t)return null;const a=c.getBoundingClientRect(),b=t.getBoundingClientRect();return{coach:{x:a.x,y:a.y,r:a.right,b:a.bottom,w:a.width,h:a.height},target:{x:b.x,y:b.y,r:b.right,b:b.bottom},width:innerWidth,height:innerHeight,overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top}});
 assert.ok(bounds,'Target and coach '+name);assert.ok(bounds.coach.x>=0&&bounds.coach.r<=bounds.width+1&&bounds.coach.y>=0&&bounds.coach.b<=bounds.height+1,JSON.stringify(bounds));assert.equal(bounds.overlap,false,'Coach leaves the target visible '+name+' '+JSON.stringify(bounds));
}
async function firstSteps(page,role,width){
 const calls=fixture.getCalls().length;
 if(width===360)await page.evaluate(()=>{const style=document.createElement('style');style.id='rm016ReadabilityStress';style.textContent='.rmLearnCoach p{font-size:18px!important;line-height:1.7!important}.rmLearnCoach h2{font-size:24px!important}';document.head.append(style)});
 await page.locator('.rmLearnSuggested [data-learning-course="first-steps"] button').first().click();await page.locator('#rmLearningCoach').waitFor({state:'visible'});assert.match(await page.locator('#rmGuideTitle').innerText(),/espace/);await guideLayout(page,'first '+role+width);
 await next(page);assert.equal(await page.locator('#rmGuideNext').isDisabled(),true);await guideLayout(page,'nav '+role+width);assert.match(await page.locator('#rmGuideDescription').innerText(),width<=1024?/Touchez/:/Cliquez/);
 if(width===390){await page.locator('#rmGuideFocus').click();await page.keyboard.press('Enter');await page.waitForTimeout(60)}else await targetAction(page);assert.equal(await screen(page),'reservations');assert.match(await page.locator('#rmGuideTitle').innerText(),/Retrouver/);await guideLayout(page,'search '+role+width);await page.locator('.rmLearnCoachExtra summary').click();await page.waitForTimeout(30);await guideLayout(page,'expanded explanation '+role+width);await page.locator('.rmLearnCoachExtra summary').click();if([390,768,1440].includes(width))await capture(page,'guide-'+role+'-'+width);
 await page.locator('#rmGuidePrev').click();await page.waitForTimeout(30);assert.match(await page.locator('#rmGuideTitle').innerText(),/Ouvrir/);await targetAction(page);await next(page);
 assert.match(await page.locator('#rmGuideTitle').innerText(),/aide/);await guideLayout(page,'help '+role+width);await next(page);await page.locator('#rmLearningCenter').waitFor({state:'visible'});assert.match(await page.locator('.rmLearningCenter>.rmLearnStatus').innerText(),/terminé/);
 assert.equal(fixture.getCalls().length,calls,'No business calls in a complete real-screen tutorial');
 const stored=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('restomanager:learning:v1:')&&!k.endsWith(':invitation')).map(([,v])=>JSON.parse(v)));assert.ok(stored.some(s=>s.progress['first-steps@1:beginner']?.complete===true));
 if(width===360)await page.evaluate(()=>document.getElementById('rm016ReadabilityStress').remove());
 pass('First-time employee: navigation, real targets, back and completion '+role+' '+width);
}
async function practiceWelcome(page,role,width){
 const before=fixture.getCalls().length;await page.getByRole('button',{name:'M’entraîner',exact:true}).click();
 const iframe=page.frameLocator('#rmLearningTraining');await iframe.getByRole('searchbox',{name:'Rechercher',exact:true}).fill('204');await iframe.getByRole('button',{name:'Voir la fiche',exact:true}).click();
 assert.match(await iframe.locator('#practice-booking-status').innerText(),/Attendu/);
 if(role==='fb_admin'){
  assert.equal(await iframe.getByRole('button',{name:'Confirmer',exact:true}).count(),0);await iframe.getByText('Plus d’actions (⋯)',{exact:true}).click();await iframe.getByRole('button',{name:'Installer à table',exact:true}).click();assert.equal(await iframe.locator('#practice-booking-status').innerText(),'Installé');
  await iframe.getByRole('button',{name:'Libérer la table',exact:true}).click();await iframe.getByRole('button',{name:'Revenir sans libérer',exact:true}).click();assert.equal(await iframe.locator('#practice-booking-status').innerText(),'Installé');
  await iframe.getByRole('button',{name:'Libérer la table',exact:true}).click();await iframe.getByRole('button',{name:'Les clients sont partis',exact:true}).click();assert.equal(await iframe.locator('#practice-booking-status').innerText(),'Libéré');
 }else{
  assert.equal(await iframe.getByRole('button',{name:'Installer à table',exact:true}).count(),0);assert.equal(await iframe.getByRole('button',{name:'Libérer la table',exact:true}).count(),0);
  await iframe.getByRole('button',{name:'Confirmer',exact:true}).click();assert.equal(await iframe.locator('#practice-booking-status').innerText(),'Confirmé · Attendu');
 }
 await page.waitForFunction(()=>document.querySelector('.rmLearningCenter>.rmLearnStatus').textContent.includes('Exercice réussi'));
 if([390,768,1440].includes(width))await capture(page,'practice-'+role+'-'+width);
 await iframe.getByRole('button',{name:'Recommencer',exact:true}).click();await iframe.getByRole('searchbox',{name:'Rechercher',exact:true}).fill('204');await iframe.getByRole('button',{name:'Voir la fiche',exact:true}).click();assert.match(await iframe.locator('#practice-booking-status').innerText(),/À confirmer/);
 const isolated=await page.locator('#rmLearningTraining').evaluate(frame=>({sandbox:frame.getAttribute('sandbox'),csp:frame.srcdoc.includes("default-src 'none'")}));assert.deepEqual(isolated,{sandbox:'allow-scripts',csp:true});
 const child=page.frames().find(f=>f.url()==='about:srcdoc');assert.ok(child);assert.equal(await child.evaluate(()=>{try{void parent.document.body;return false}catch{return true}}),true,'Opaque origin denies parent access');assert.equal(await child.evaluate(()=>typeof window.supabase),'undefined');
 const beforeSpoof=await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('spoof-scenario')));await page.evaluate(()=>window.postMessage({type:'rm016:practice-complete',scenario:'spoof-scenario',token:'bad'},'*'));assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('spoof-scenario'))),beforeSpoof);
 assert.equal(fixture.getCalls().length,before,'Training never reaches the actual service boundary');
 await page.getByRole('button',{name:'Retour à l’aide',exact:true}).click();pass('Isolated practice, real role semantics, reset and no writes '+role+' '+width);
}
async function allGuides(page,role,width){
 const before=fixture.getCalls().length;
 const ids=await page.evaluate(()=>window.RestoLearning.available(window.RestoReception?'reception':'restaurant').map(g=>g.id));
 for(const id of ids){
  await start(page,id,{restart:true});let steps=0;
  while(await page.locator('#rmLearningCoach').isVisible()){
   if(++steps>12)throw Error('Guide does not complete '+id);
   assert.equal(await page.locator('.rmLearnTarget').count(),1,'Visible guide target '+id+' step '+steps+' '+role+' '+width);

   if(id==='notifications'&&steps===2&&[390,768,1440].includes(width)){await guideLayout(page,'actual notification '+role+width);await capture(page,'notification-guide-'+role+'-'+width)}
   const disabled=await page.locator('#rmGuideNext').isDisabled();if(disabled)await targetAction(page);else await next(page);
  }
  assert.equal(await page.locator('#rmLearningCenter').isVisible(),true,id+' returns to help');
 }
 assert.equal(fixture.getCalls().length,before,'All real-screen guides stay read-only: '+JSON.stringify(fixture.getCalls().slice(before)));
 pass('Every available beginner module completes using real app targets '+role+' '+width+' ('+ids.length+' modules)');
}
async function extraExercises(page,role,width){
 const menu=page.getByText('Autres exercices sans risque',{exact:true});await menu.click();await page.getByRole('button',{name:'Créer une réservation fictive',exact:true}).click();
 let frame=page.frameLocator('#rmLearningTraining');await frame.getByRole('button',{name:'Enregistrer l’exemple',exact:true}).click();assert.match(await frame.locator('#status').innerText(),/Vérifiez/);
 await frame.getByRole('button',{name:'Choisir une date',exact:true}).click();await frame.getByRole('button',{name:'8 novembre 2032',exact:true}).click();await frame.getByRole('button',{name:'Choisir un horaire',exact:true}).click();await frame.getByRole('button',{name:'18 h 30 · indisponible',exact:true}).click();assert.match(await frame.locator('#status').innerText(),/pas ouvert/);await frame.getByRole('button',{name:'19 h 30',exact:true}).click();await frame.getByRole('button',{name:'Enregistrer l’exemple',exact:true}).click();assert.match(await frame.getByRole('heading',{name:'Exemple enregistré',exact:true}).innerText(),/enregistré/);
 await page.getByRole('button',{name:'Retour à l’aide',exact:true}).click();await page.getByText('Autres exercices sans risque',{exact:true}).click();await page.getByRole('button',{name:'Comprendre une notification fictive',exact:true}).click();frame=page.frameLocator('#rmLearningTraining');
 await frame.getByRole('button',{name:'Marquer comme lue',exact:true}).click();assert.match(await frame.locator('#status').innerText(),/ne résout pas/);await frame.getByRole('button',{name:'Retirer',exact:true}).click();await frame.getByRole('button',{name:'Annuler le retrait',exact:true}).click();assert.match(await frame.getByRole('heading',{name:'Votre nouveau centre d’aide'}).innerText(),/centre d’aide/);
 await page.getByRole('button',{name:'Retour à l’aide',exact:true}).click();pass('Basic dates/hours, save, error recovery and notification undo '+role+' '+width);
}
(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>fixture.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+fixture.server.address().port;browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of widths)for(const role of ['fb_admin','reception']){
  const v=await fixture.open(browser,origin,width,role,{serviceWorkers:'allow'});const {page}=v;
  fixture.configure(s=>{s.reservations=[{id:'00000000-0000-4000-8000-000000000901',guest_name:'Exemple fictif Martin',hotel_room:'204',party_size:2,starts_at:'2032-11-08T18:30Z',ends_at:'2032-11-08T19:30Z',status:'reserved',edit_version:'00000000-0000-4000-8000-000000000902',notes:''}];s.assignments=[{reservation_id:s.reservations[0].id,table_id:s.tables[0].id}]});await page.evaluate(()=>window.RestoRefreshSharedService());
  await page.evaluate(()=>window.RestoManagementCategories.open('manageNews'));const news=page.locator('#manageNews .rmNewsLaunch');
  const style=await news.evaluate(b=>({height:b.getBoundingClientRect().height,background:getComputedStyle(b).backgroundColor,radius:parseFloat(getComputedStyle(b).borderRadius),icon:!!b.querySelector('svg')}));assert.ok(style.height>=48&&style.radius>=12&&style.icon);assert.equal(style.background,'rgb(20, 108, 85)');
  if([390,768,1440].includes(width))await capture(page,'news-button-'+role+'-'+width);
  await page.evaluate(()=>window.RestoAppRelease.check());await news.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('rmNcTitle').textContent==='Quoi de neuf ?');await page.getByRole('button',{name:'Fermer les notifications',exact:true}).click();
  await openHelp(page);await layout(page,role+width);
  if(width===360){await page.keyboard.press('Shift+Tab');assert.match(await page.evaluate(()=>document.activeElement.textContent),/Quoi de neuf/);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Fermer l’aide')}
  const targets=await page.evaluate(()=>window.RestoTutorial.checkTargets());assert.deepEqual(targets.filter(t=>!t.exists),[],'Static selector contract '+role+width);
  assert.equal(await page.locator('[data-learning-course="online-booking"]').count(),0);assert.equal(await page.locator('[data-learning-course="closeout"]').count(),0);
  if(role==='reception')for(const id of ['seat','release','changes','walkin','management'])assert.equal(await page.locator('[data-learning-course="'+id+'"]').count(),0,id);
  await page.locator('#rmLearningSearch').fill('confirmé');await page.locator('#rmLearningAnswers summary').first().click();assert.match(await page.locator('#rmLearningAnswers').innerText(),/attendu/i);await page.locator('#rmLearningSearch').fill('');
  if([390,768,1440].includes(width))await capture(page,'help-'+role+'-'+width);
  await firstSteps(page,role,width);
  if(width===390){
   await page.getByRole('button',{name:'Fermer l’aide',exact:true}).click();const calls=fixture.getCalls().length;
   assert.match(await page.locator('#bookingForm .bookingSubmitPrimary').textContent(),/Ajouter la réservation/);
   assert.equal(await page.locator('#reservationList [data-reservation-action="confirm"]').count(),role==='reception'?1:0);
   await page.locator('#reservationList .reservationMoreTrigger').click();const menu=page.getByRole('dialog',{name:'Actions de la réservation',exact:true});
   assert.equal(await menu.getByRole('button',{name:'Installer à table',exact:true}).count(),role==='fb_admin'?1:0);
   assert.equal(await menu.getByRole('button',{name:'Changer la table',exact:true}).count(),role==='fb_admin'?1:0);
   assert.equal(await menu.getByRole('button',{name:'Retard',exact:true}).count(),1);
   await menu.getByRole('button',{name:'Fermer les actions',exact:true}).click();await page.clock.runFor(200);
   assert.equal(fixture.getCalls().length,calls);await openHelp(page);pass('Published instruction labels agree with actual reservation buttons and role rights '+role);
  }
  await practiceWelcome(page,role,width);
  await page.locator('[data-learning-level="quick"]').click();await start(page,'home',{restart:true});const count=await page.locator('#rmGuideCount').innerText();assert.match(count,/\/2$/);await page.keyboard.press('Escape');assert.equal(await page.locator('#rmLearningCoach').count(),0);await openHelp(page);await page.locator('[data-learning-level="beginner"]').click();
  if([390,768,1440].includes(width)){await extraExercises(page,role,width);await allGuides(page,role,width);}
  await start(page,'find-booking',{restart:true});await targetAction(page);await next(page);const old=await page.locator('#rmGuideCount').innerText();await page.keyboard.press('Escape');await start(page,'find-booking');assert.equal(await page.locator('#rmGuideCount').innerText(),old,'Resume exact step');await page.keyboard.press('Escape');
  await page.evaluate(()=>{window.RestoTutorial.open();document.documentElement.dataset.theme='dark'});if([390,768,1440].includes(width))await capture(page,'help-dark-'+role+'-'+width);await layout(page,'dark '+role+width);
  assert.deepEqual(v.errors,[]);await v.context.close();pass('Responsive help, quick level, pause/resume, permissions and dark mode '+role+' '+width);
 }
 // Non-visual adversarial and unsaved-input scenarios use the actual screen guard.
 const v=await fixture.open(browser,origin,390,'fb_admin',{serviceWorkers:'allow'});const {page}=v;
 await page.evaluate(()=>window.RestoScreens.request('reservationForm'));await page.locator('#bookingClient').fill('Brouillon fictif conservé');await page.locator('#bookingNotes').fill('Ne pas perdre cette note');
 const pending=page.evaluate(()=>window.RestoTutorial.startCourse('home'));await page.getByRole('alertdialog').waitFor();await page.getByRole('alertdialog').getByRole('button',{name:'Annuler',exact:true}).click();await pending;assert.equal(await screen(page),'reservationForm');assert.equal(await page.locator('#bookingNotes').inputValue(),'Ne pas perdre cette note');assert.match(await page.locator('#rmGuideTitle').innerText(),/conservée/);await page.keyboard.press('Escape');
 assert.equal(await page.locator('#bookingForm').evaluate(f=>f.inert),false,'Guide restores form interactivity');pass('RM-011 dirty booking: denied navigation preserves every field and restores inputs');
 await page.evaluate(()=>{window.RestoScreens.markBookingSaved();window.RestoScreens.show('tables')});await start(page,'home');const before=fixture.getCalls().length;await page.evaluate(()=>document.getElementById('bookingForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(fixture.getCalls().length,before);assert.match(await page.locator('#rmGuideStatus').innerText(),/lecture/);await page.keyboard.press('Escape');pass('Read-only guide blocks real form submission at capture phase');
 await page.evaluate(()=>{window.RestoLearning.guides.find(g=>g.id==='find-booking').steps[1].target=['#rm016-control-no-longer-exists']});await start(page,'find-booking',{restart:true});await targetAction(page);assert.match(await page.locator('#rmGuideStatus').innerText(),/pas disponible/);assert.equal(await page.locator('#rmGuideNext').isDisabled(),false);await page.keyboard.press('Escape');await page.evaluate(()=>{window.RestoLearning.guides.find(g=>g.id==='find-booking').steps[1].target=['#reservationQuery']});pass('Removed target is explained and never blocks the employee');
 await page.evaluate(()=>{window.RestoServiceCapabilities={service_regularization:1};window.RestoTutorial.open()});assert.ok(await page.locator('[data-learning-course="closeout"]').count()>0);assert.equal(await page.locator('[data-learning-course="online-booking"]').count(),0);pass('Published RM-012 capability reveals guide; future RM-015 remains hidden');
 await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await page.context().setOffline(true);await page.getByRole('button',{name:'Fermer l’aide',exact:true}).click();await openHelp(page);assert.match(await page.locator('.rmLearningCenter>.rmLearnStatus').innerText(),/hors connexion/);await page.context().setOffline(false);pass('Help stays available without network or extra loading');
 await page.getByRole('button',{name:'Quoi de neuf dans RestoManager ?',exact:true}).click();await page.locator('.rmNcHistoryEntry').first().getByRole('button',{name:'Comprendre cette nouveauté',exact:true}).click();assert.equal(await page.locator('#rmLearningCenter').isVisible(),true);pass('Verified Quoi de neuf links directly to the matching learning module');
 await page.getByRole('button',{name:'Fermer l’aide',exact:true}).click();await start(page,'first-steps',{restart:true});await next(page);await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(80);assert.equal(await page.locator('.rmLearnTarget').evaluate(n=>n.closest('.sidebar')!==null),true);await targetAction(page);await page.keyboard.press('Escape');pass('Rotation/layout change replaces the highlighted mobile control with the desktop control');
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('restomanager:learning:'))throw new DOMException('Unavailable','QuotaExceededError');return original.call(this,k,v)}});await start(page,'home');await page.keyboard.press('Escape');await openHelp(page);assert.match(await page.locator('.rmLearningCenter>.rmLearnStatus').innerText(),/cette visite seulement/);pass('Unavailable storage keeps help usable and explains the progress limitation');
 await page.evaluate(()=>{window.RestoNotificationContext={userId:'another-person',restaurantId:'another-venue',role:'reception'};window.dispatchEvent(new Event('restomanager:notification-context'))});assert.equal(await page.locator('#rmLearningCenter').isVisible(),false);assert.equal(await page.locator('#rmLearningHelp').count(),0);assert.equal(await page.evaluate(()=>window.RestoTutorial.startCourse('seat')),false);pass('Identity transition closes learning and refuses stale role actions');
 assert.deepEqual(v.errors,[]);await v.context.close();
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,failed:0,widths,roles:['Restaurant','Réception'],data:'Fictional memory fixture; real frontend and auth; external HTTP/WS blocked; sandboxed opaque practice',humanEmployeeTrials:false,results},null,2));
 }finally{await browser?.close();fixture.server.closeAllConnections();await new Promise(resolve=>fixture.server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
