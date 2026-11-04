'use strict';
(function(){
const main=document.querySelector('.shell main');if(!main)return;
const groups=[
 {id:'tables',nodes:['.serviceIntro','.quickActions','#kpis','#rushDashboard','.content']},
 {id:'reservations',nodes:['#reservations']},
 {id:'reservationForm',nodes:['#reservationForm']},
 {id:'passages',nodes:['.quickReleasePanel','#passages']},
 {id:'administration',nodes:['#restaurantShifts','#administration','#historyStats']}
];
const screens=new Map();
groups.forEach(group=>{const screen=document.createElement('section');screen.className='appScreen';screen.dataset.screen=group.id;screen.setAttribute('aria-label',({tables:'Service et tables',reservations:'Réservations',reservationForm:'Nouvelle réservation',passages:'Service en cours',administration:'Gestion des tables',history:'Historique et statistiques'})[group.id]);group.nodes.forEach(selector=>{const el=main.querySelector(selector);if(el){if(el.tagName==='DETAILS')el.open=true;screen.append(el)}});main.append(screen);screens.set(group.id,screen)});
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
let current=null;
function show(id,options={}){
 if(!screens.has(id))return;
 if(current===id&&!options.force)return;
 current=id;
 screens.forEach((screen,key)=>{const active=key===id;screen.hidden=!active;screen.classList.toggle('appScreenActive',active)});
 links.forEach(a=>{const active=a.dataset.nav===id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
 sidebar.forEach(a=>{const active=a.getAttribute('href')==='#'+id;a.classList.toggle('selected',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
 if(!options.keepScroll)window.scrollTo({top:0,behavior:'instant'});
}
function navigate(id){show(id);if(location.hash!=='#'+id)history.replaceState(null,'','#'+id)}
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const id=a.getAttribute('href').slice(1);if(!screens.has(id))return;e.preventDefault();navigate(id)});
window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(screens.has(id))show(id)});
window.RestoScreens={show:navigate,current:()=>current};
show(screens.has(location.hash.slice(1))?location.hash.slice(1):'tables',{keepScroll:true,force:true});
})();
