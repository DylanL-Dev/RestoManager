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
// Gestion : navigation compacte, sections indépendantes et accessibles.
const management=screens.get('administration');
if(management){
 const hours=document.getElementById('restaurantShifts'),tables=document.getElementById('administration'),reports=document.getElementById('historyStats'),closure=document.getElementById('serviceClosure');
 const intro=document.createElement('header');intro.className='managementIntro';intro.innerHTML='<span class="managementEyebrow">ESPACE DE GESTION</span><h1>Gestion du restaurant</h1><p>Retrouvez les réglages et les bilans de votre établissement.</p>';
 management.prepend(intro);
 function group(id,symbol,title,description,element,opened){
  if(!element)return;
  const wrapper=document.createElement('details');wrapper.className='managementGroup';wrapper.id=id;wrapper.open=!!opened;
  const summary=document.createElement('summary');summary.className='managementGroupHead';
  const badge=document.createElement('span');badge.className='managementGroupIcon';const iconNames={clock:'clock-3',tables:'layout-grid',check:'check-check',report:'chart-no-axes-column'};
  badge.innerHTML='<i data-lucide="'+(iconNames[symbol]||'settings')+'"></i>';badge.setAttribute('aria-hidden','true');
  const words=document.createElement('span');words.className='managementGroupWords';
  const strong=document.createElement('strong');strong.textContent=title;
  const small=document.createElement('small');small.textContent=description;
  words.append(strong,small);
  const chevron=document.createElement('span');chevron.className='managementChevron';chevron.innerHTML='<i data-lucide="chevron-down"></i>';chevron.setAttribute('aria-hidden','true');
  summary.append(badge,words,chevron);
  const body=document.createElement('div');body.className='managementGroupBody';body.append(element);
  wrapper.append(summary,body);management.append(wrapper);
  return wrapper;
 }
 group('manageHours','clock','Restaurant & horaires','Services du midi et du soir',hours,true);
 if(tables){tables.open=false;group('manageTables','tables','Tables & salle','Ajouter et organiser les tables',tables,false)}
 group('manageClosure','check','Clôture du service','Clôture et archives du service',closure,false);
 group('manageReports','report','Rapports & statistiques','Historique, couverts et PDF',reports,false);
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
 // The home screen never needs an in-app Back button, even with history entries.
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
async function mayLeave(){
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
 if(navigationBusy||!screens.has(id))return;
 if(id===current&&!editForm()){
  if(scrollTables)document.getElementById('tables')?.scrollIntoView({behavior:'smooth',block:'start'});
  return;
 }
 navigationBusy=true;
 try{
  if(!await mayLeave())return;
  if(id!==current)commit(id);
  updateBack();
  if(scrollTables)document.getElementById('tables')?.scrollIntoView({behavior:'smooth',block:'start'});
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
window.RestoScreens={show:id=>commit(id),current:()=>current,back:goBack,request};
const initial=screens.has(location.hash.slice(1))?location.hash.slice(1):'tables';
if(history.state?.[navKey]&&screens.has(history.state.screen))depth=Math.max(0,Number(history.state.depth)||0);
history.replaceState(stateFor(initial,depth),'','#'+initial);
show(initial,{keepScroll:true,force:true});
})();
