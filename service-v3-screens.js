'use strict';
(function(){
const main=document.querySelector('.shell main');if(!main)return;
const groups=[
 {id:'tables',nodes:['.serviceIntro','.quickActions','#kpis','#currentOccupancy','#rushDashboard','.content']},
 {id:'reservations',nodes:['#reservations']},
 {id:'reservationForm',nodes:['#reservationForm']},
 {id:'passages',nodes:['.quickReleasePanel','#passages']},
 {id:'administration',nodes:['#restaurantShifts','#administration','#historyStats']}
];
const screens=new Map();
groups.forEach(group=>{const screen=document.createElement('section');screen.className='appScreen';screen.dataset.screen=group.id;screen.setAttribute('aria-label',({tables:'Service et tables',reservations:'Réservations',reservationForm:'Nouvelle réservation',passages:'Service en cours',administration:'Gestion des tables',history:'Historique et statistiques'})[group.id]);group.nodes.forEach(selector=>{const el=main.querySelector(selector);if(el){if(el.tagName==='DETAILS')el.open=true;screen.append(el)}});main.append(screen);screens.set(group.id,screen)});
// The Reception service tab is a safe, read-only screen, not the restaurant's passage actions.
const receptionService=document.createElement('section');receptionService.id='receptionServiceOverview';receptionService.className='receptionServiceOverview';screens.get('passages').append(receptionService);
// Gestion: one accordion hierarchy. Panels retain their DOM and unsaved input.
const management=screens.get('administration');
if(management){
 const hours=document.getElementById('restaurantShifts'),tables=document.getElementById('administration'),reports=document.getElementById('historyStats'),closure=document.getElementById('serviceClosure');
 const intro=document.createElement('header');intro.className='managementIntro';intro.innerHTML='<span class="managementEyebrow">ESPACE DE GESTION</span><h1>Gestion du restaurant</h1><p>Dépliez une rubrique pour consulter ou modifier ses réglages.</p>';
 management.prepend(intro);
 const workspace=document.createElement('div');workspace.className='rmManagementWorkspace';
 const categoryContent=document.createElement('div');categoryContent.className='rmManagementCategoryContent';
 workspace.append(categoryContent);management.append(workspace);
 const categoryGroups=[];
 function setOpen(entry,active){
  if(!active&&entry.body.contains(document.activeElement))entry.button.focus({preventScroll:true});
  entry.wrapper.classList.toggle('rmManagementCategoryActive',active);
  entry.button.setAttribute('aria-expanded',String(active));
  if(entry.native)entry.wrapper.open=active;else entry.body.hidden=!active;
 }
 function activateCategory(id,{focus=false,toggle=false}={}){
  const chosen=categoryGroups.find(entry=>entry.id===id);if(!chosen)return;
  const close=toggle&&chosen.button.getAttribute('aria-expanded')==='true';
  for(const entry of categoryGroups)setOpen(entry,entry===chosen&&!close);
  if(focus){chosen.button.focus({preventScroll:true});chosen.button.scrollIntoView({block:'nearest',behavior:'instant'})}
 }
 function group(id,symbol,title,description,element){
  if(!element)return;
  const wrapper=document.createElement('section');wrapper.className='managementGroup';wrapper.id=id;
  const heading=document.createElement('h2');heading.className='rmManagementHeading';
  const button=document.createElement('button');button.type='button';button.className='managementGroupHead rmManagementCategoryButton';button.dataset.category=id;button.id=id+'Toggle';
  const badge=document.createElement('span');badge.className='managementGroupIcon';badge.innerHTML='<i data-lucide="'+symbol+'"></i>';badge.setAttribute('aria-hidden','true');
  const words=document.createElement('span');words.className='managementGroupWords';
  const strong=document.createElement('strong');strong.textContent=title;
  const small=document.createElement('small');small.textContent=description;words.append(strong,small);
  const chevron=document.createElement('span');chevron.className='managementChevron';chevron.innerHTML='<i data-lucide="chevron-down"></i>';chevron.setAttribute('aria-hidden','true');
  button.append(badge,words,chevron);heading.append(button);
  const body=document.createElement('div');body.className='managementGroupBody';body.id=id+'Panel';body.setAttribute('role','region');body.setAttribute('aria-labelledby',button.id);body.append(element);
  button.setAttribute('aria-controls',body.id);wrapper.append(heading,body);categoryContent.append(wrapper);
  const entry={id,wrapper,button,body};categoryGroups.push(entry);setOpen(entry,false);
  button.addEventListener('click',()=>activateCategory(id,{toggle:true}));
  return wrapper;
 }
 const fusions=tables?.querySelector('.fusionAdmin');
 if(fusions)fusions.remove();
 const settings=document.createElement('div');settings.className='rmManagementSettings';
 group('manageSettings','settings','Paramètres du service','Durée, arrivées et apparence',settings);
 group('manageHours','clock-3','Horaires du restaurant','Services du midi et du soir, par jour',hours);
 group('manageRooms','building-2','Salles','Espaces, tables et places',tables?.querySelector('.roomManager'));
 if(tables){tables.open=true;group('manageTables','layout-grid','Tables','Choisir une salle et configurer ses tables',tables)}
 group('manageFusions','link-2','Fusions','Associations autorisées de 2 à 4 tables',fusions);
 group('manageClosure','check-check','Clôture du service / historique','Fermeture et services archivés',closure);
 group('manageReports','chart-no-axes-column','Rapports & statistiques','Activité et export PDF',reports);
 // Modules loaded later (auth, help, network) join this same hierarchy.
 // Native details keep their identity so existing shortcuts can still set .open.
 function registerNative(wrapper){
  if(categoryGroups.some(entry=>entry.wrapper===wrapper))return;
  const button=wrapper.querySelector(':scope > summary'),body=wrapper.querySelector(':scope > .managementGroupBody');
  if(!button||!body)return;
  const id=wrapper.id;button.classList.add('rmManagementCategoryButton');button.dataset.category=id;
  button.id=id+'Toggle';body.id=id+'Panel';button.setAttribute('aria-controls',body.id);
  const entry={id,wrapper,button,body,native:true};categoryGroups.push(entry);setOpen(entry,false);
  wrapper.addEventListener('toggle',()=>{
   if(wrapper.open)for(const other of categoryGroups)if(other!==entry)setOpen(other,false);
   button.setAttribute('aria-expanded',String(wrapper.open));wrapper.classList.toggle('rmManagementCategoryActive',wrapper.open);
  });
  categoryContent.append(wrapper);
 }
 function organizeModules(){
  const duration=management.querySelector('.restaurantDurationSetting');
  if(duration&&duration.parentElement!==settings){duration.querySelector('select')?.setAttribute('form','restaurantShiftForm');settings.prepend(duration)}
  const rush=management.querySelector('#rushArrivalSettings');if(rush&&rush.parentElement!==settings)settings.append(rush);
  const theme=management.querySelector('.themeSettingsGroup');if(theme&&theme.parentElement!==settings){theme.classList.remove('managementGroup');settings.append(theme)}
  for(const wrapper of management.querySelectorAll(':scope > details.managementGroup'))registerNative(wrapper);
  const readonly=document.getElementById('receptionWeeklyReadOnly');
  if(readonly&&readonly.parentElement===categoryContent)group('manageReadonlyHours','clock-3','Horaires du restaurant','Planning partagé · lecture seule',readonly);
 }
 new MutationObserver(organizeModules).observe(management,{childList:true,subtree:true});organizeModules();
 categoryContent.addEventListener('keydown',event=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||!event.target.matches('.rmManagementCategoryButton'))return;
  const buttons=categoryGroups.map(entry=>entry.button).filter(button=>button.getClientRects().length&&getComputedStyle(button).visibility!=='hidden');
  const current=buttons.indexOf(event.target);if(current<0)return;
  event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[index].focus();
 });
 window.RestoManagementCategories={open:id=>activateCategory(id,{focus:true})};
 if(location.hash==='#manageFusions')activateCategory('manageFusions');
}
const links=[...document.querySelectorAll('.mobileNavItem')],sidebar=[...document.querySelectorAll('.sidebar a[href^="#"]')];
const titles={tables:'Votre service',reservations:'Réservations',reservationForm:'Ajouter un client',passages:'Suivi du service',administration:'Gestion'};
const navKey='restomanager-navigation-v1';
let current=null,depth=0,navigationBusy=false,allowPop=false;
const toolbar=document.createElement('div');toolbar.className='navBackToolbar';toolbar.hidden=true;
const back=document.createElement('button');back.type='button';back.id='navBackBtn';back.className='navBackButton';
back.setAttribute('aria-label','Retour à l’étape précédente');back.title='Retour à l’étape précédente';
back.innerHTML='<i data-lucide="arrow-left" aria-hidden="true"></i><span>Retour</span>';
const context=document.createElement('span');context.className='navBackContext';toolbar.append(back,context);
main.prepend(toolbar);
if(window.lucide?.createIcons)window.lucide.createIcons();
function editForm(){const form=document.getElementById('editForm');return form&&!form.hidden?form:null}
function captureForm(form){return JSON.stringify([...form.querySelectorAll('input,select,textarea')].filter(el=>!el.disabled&&el.type!=='submit'&&el.type!=='button'&&el.type!=='hidden').map(el=>[el.id||el.name,el.type==='checkbox'||el.type==='radio'?el.checked:el.value]))}
let bookingBaseline=null,walkinBaseline=null;
function resetBookingBaseline(){const form=document.getElementById('bookingForm');bookingBaseline=form?captureForm(form):null}
function resetWalkinBaseline(){const form=document.getElementById('walkinForm');walkinBaseline=form?captureForm(form):null}
function editDirty(){
 const edit=window.RestoEditNavigation;
 return !!(edit?.isDirty?.());
}
function bookingDirty(){const form=document.getElementById('bookingForm');return current==='reservationForm'&&bookingBaseline!==null&&form&&bookingBaseline!==captureForm(form)}
function walkinDirty(){const form=document.getElementById('walkinForm');return current==='passages'&&walkinBaseline!==null&&form&&!window.RestoReception&&walkinBaseline!==captureForm(form)}
function updateBack(){
 const editor=editForm();
 // Home has no contextual Back action, even when navigation history has depth.
 const visible=!!editor||current!=='tables';
 toolbar.hidden=!visible;
 context.textContent=editor?'Modifier une réservation':titles[current]||'RestoManager';
 back.disabled=!visible;
}
function show(id,options={}){
 if(!screens.has(id))return;
 if(current===id&&!options.force){updateBack();return}
 current=id;
 screens.forEach((screen,key)=>{const active=key===id;screen.hidden=!active;screen.classList.toggle('appScreenActive',active)});
 links.forEach(a=>{const active=a.dataset.nav===id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
 sidebar.forEach(a=>{const active=a.getAttribute('href')==='#'+id;a.classList.toggle('selected',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
 window.dispatchEvent(new CustomEvent('restomanager:screen',{detail:id}));
 if(id==='reservationForm')resetBookingBaseline();
 if(id==='passages')resetWalkinBaseline();
 updateBack();
 if(!options.keepScroll)window.scrollTo({top:0,behavior:'instant'});
}
function stateFor(id,n){return {[navKey]:true,screen:id,depth:n}}
function commit(id,mode='push'){
 if(!screens.has(id))return;
 if(current===id){updateBack();return}
 if(mode==='push')depth+=1;
 if(mode==='replace')history.replaceState(stateFor(id,depth),'','#'+id);
 else history.pushState(stateFor(id,depth),'','#'+id);
 show(id);
}
function hasUnsavedChanges(){
 const assistance=document.getElementById('reportIssueForm');
 const assistanceDirty=assistance&&['reportIssueTitle','reportIssueDescription','reportIssueContact'].some(id=>document.getElementById(id)?.value?.trim());
 return Boolean(editDirty()||bookingDirty()||walkinDirty()||assistanceDirty||window.RestoPublicBookings?.isDirty?.());
}
async function mayLeave(options={}){
 if(options.preserveDraft&&hasUnsavedChanges()){
  await window.RestoDialog?.alert?.('Votre saisie est conservée. Terminez-la ou enregistrez-la avant de mettre à jour l’application. Vous pourrez réessayer plus tard.',{title:'Mise à jour reportée'});
  return false;
 }
 if(editDirty()||bookingDirty()||walkinDirty()){
  if(!window.RestoDialog?.confirm)return false;
  const approved=await window.RestoDialog.confirm(
   'Vous avez des modifications non enregistrées. Voulez-vous quitter cette page ?',
   {title:'Modifications non enregistrées',acceptLabel:'Quitter sans enregistrer',danger:true});
  if(!approved)return false;
 }
 if(editForm())window.RestoEditNavigation?.close?.();
 return true;
}
async function request(id,{scrollTables=false}={}){
 if(navigationBusy||!screens.has(id))return false;
 if(id===current&&!editForm()){
  if(scrollTables)document.getElementById('tables')?.scrollIntoView({behavior:'smooth',block:'start'});
  return true;
 }
 navigationBusy=true;
 try{
  if(!await mayLeave())return false;
  if(id!==current)commit(id);
  updateBack();
  if(scrollTables)document.getElementById('tables')?.scrollIntoView({behavior:'smooth',block:'start'});
  return true;
 }finally{navigationBusy=false}
}
async function goBack(){
 if(navigationBusy)return;
 if(editForm()){
  navigationBusy=true;
  try{if(await mayLeave()){updateBack();document.querySelector('#reservations .panelHead')?.scrollIntoView({behavior:'smooth',block:'start'})}}
  finally{navigationBusy=false}
  return;
 }
 if(depth<=0){
  navigationBusy=true;
  try{if(await mayLeave())commit('tables','replace')}
  finally{navigationBusy=false}
  return;
 }
 navigationBusy=true;
 try{
  if(!await mayLeave())return;
  allowPop=true;
  history.back();
 }finally{navigationBusy=false}
}
back.addEventListener('click',goBack);
document.addEventListener('click',e=>{
 const a=e.target.closest('a[href^="#"]');if(!a)return;
 const id=a.getAttribute('href').slice(1);if(!screens.has(id))return;
 e.preventDefault();request(id,{scrollTables:id==='tables'&&a.matches('.quickAction[href="#tables"]')});
});
window.addEventListener('popstate',async event=>{
 const state=event.state;
 if(!state?.[navKey]||!screens.has(state.screen))return;
 if(allowPop){allowPop=false;depth=state.depth;show(state.screen);return}
 if(state.screen===current){depth=state.depth;updateBack();return}
 if(!editDirty()&&!bookingDirty()&&!walkinDirty()){
  if(editForm())window.RestoEditNavigation?.close?.();
  depth=state.depth;show(state.screen);return;
 }
 // Native Android/browser Back has already moved one history entry.
 // Return to the current entry first, ask permission, and only then go back.
 const destination=state;
 const restored=new Promise(resolve=>{
  const listen=e=>{window.removeEventListener('popstate',listen);resolve(e.state)};
  window.addEventListener('popstate',listen,{once:true});
 });
 history.forward();
 const restoredState=await restored;
 if(!restoredState?.[navKey])return;
 const canLeave=await mayLeave();
 if(!canLeave){updateBack();return}
 allowPop=true;
 history.back();
});
window.addEventListener('hashchange',()=>{
 const id=location.hash.slice(1);
 if(screens.has(id)&&id!==current&&!history.state?.[navKey])request(id);
});
window.addEventListener('restomanager:editor-open',updateBack);
window.addEventListener('restomanager:editor-close',updateBack);
window.RestoScreens={show:id=>commit(id),current:()=>current,back:goBack,request,
 markBookingSaved:resetBookingBaseline,hasUnsavedChanges,confirmLeaveForRefresh:mayLeave};
const initialHash=location.hash;
const initial=screens.has(initialHash.slice(1))?initialHash.slice(1):'tables';
const restoring=history.state?.[navKey]&&screens.has(history.state.screen);
if(restoring)depth=Math.max(0,Number(history.state.depth)||0);
// A fresh dashboard has no anchor. Keep explicit anchors and browser restores intact.
history.replaceState(stateFor(initial,depth),'',location.href);
show(initial,{keepScroll:Boolean(initialHash||restoring),force:true});

// Express is an optional DEV presentation over the existing screen tree.
if(document.currentScript?.src&&/^(localhost|127\.0\.0\.1)$|\.onrender\.com$/i.test(location.hostname)){
 import(new URL('./service-v3-express.mjs?v=2027.4',document.currentScript.src))
  .then(({mountExpress})=>mountExpress(main,()=>TableStore.get()))
  .catch(error=>window.RestoErrors?.diagnostic('express-interface',error));
}
})();
