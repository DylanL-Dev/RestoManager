'use strict';
(function(){
const main=document.querySelector('.shell main');if(!main)return;
const groups=[
 {id:'tables',nodes:['.serviceIntro','.quickActions','#kpis','.content']},
 {id:'reservations',nodes:['#reservations']},
 {id:'reservationForm',nodes:['#reservationForm']},
 {id:'passages',nodes:['#passages']},
 {id:'administration',nodes:['#administration']}
];
const screens=new Map();
groups.forEach(group=>{const screen=document.createElement('section');screen.className='appScreen';screen.dataset.screen=group.id;screen.setAttribute('aria-label',({tables:'Service et tables',reservations:'Réservations',reservationForm:'Nouvelle réservation',passages:'Clients de passage',administration:'Gestion des tables'})[group.id]);group.nodes.forEach(selector=>{const el=main.querySelector(selector);if(el){if(el.tagName==='DETAILS')el.open=true;screen.append(el)}});main.append(screen);screens.set(group.id,screen)});
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
