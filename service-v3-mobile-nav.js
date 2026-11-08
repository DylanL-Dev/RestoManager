'use strict';
(function(){
const links=[...document.querySelectorAll('.mobileNavItem')];
function activate(id){links.forEach(a=>{const on=a.dataset.nav===id;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')})}
function go(id){const target=document.getElementById(id);if(!target)return;if(target.tagName==='DETAILS')target.open=true;activate(id);target.scrollIntoView({behavior:'smooth',block:'start'});}
links.forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const id=a.dataset.nav;go(id);history.replaceState(null,'','#'+id)}));
const start=location.hash.slice(1);if(links.some(a=>a.dataset.nav===start)){activate(start);const target=document.getElementById(start);if(target&&target.tagName==='DETAILS')target.open=true;}
window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(links.some(a=>a.dataset.nav===id))go(id)});
})();