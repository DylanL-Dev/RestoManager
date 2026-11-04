'use strict';
/* Choix rapide depuis le bouton Ajouter : réservation ou passage express. */
(function(){
 const overlay=document.createElement('div');overlay.className='restoAddChoiceOverlay';overlay.hidden=true;
 overlay.innerHTML='<div class="restoAddChoiceBackdrop"></div><section class="restoAddChoiceDialog" role="dialog" aria-modal="true" aria-labelledby="restoAddChoiceTitle"><div class="restoAddChoiceTop"><div><p>ACCUEIL CLIENT</p><h2 id="restoAddChoiceTitle">Ajouter un client</h2><span>Que souhaitez-vous faire ?</span></div><button type="button" class="restoAddChoiceClose" aria-label="Fermer"><i data-lucide="x"></i></button></div><button type="button" class="restoAddChoiceOption" data-choice="reservation"><i data-lucide="calendar-plus"></i><span><strong>Nouvelle réservation</strong><small>Enregistrer une réservation pour une date et une heure.</small></span><i data-lucide="chevron-right"></i></button><button type="button" class="restoAddChoiceOption" data-choice="walkin"><i data-lucide="users"></i><span><strong>Installer un client de passage</strong><small>Installer immédiatement un client sans réservation.</small></span><i data-lucide="chevron-right"></i></button></section>';
 document.body.append(overlay);
 let previousFocus=null;
 const close=()=>{overlay.hidden=true;document.body.classList.remove('restoAddChoiceOpen');previousFocus?.focus()};
 const open=()=>{previousFocus=document.activeElement;overlay.hidden=false;document.body.classList.add('restoAddChoiceOpen');window.lucide?.createIcons?.({nodes:[overlay]});overlay.querySelector('.restoAddChoiceClose').focus()};
 document.addEventListener('click',event=>{
  const anchor=event.target.closest('a[href="#reservationForm"]');
  if(anchor&&(anchor.classList.contains('mobileNavAdd')||anchor.closest('.sidebar'))){
   event.preventDefault();event.stopImmediatePropagation();open();
  }
 },true);
 overlay.querySelector('.restoAddChoiceClose').addEventListener('click',close);
 overlay.querySelector('.restoAddChoiceBackdrop').addEventListener('click',close);
 overlay.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close()}
  if(event.key==='Tab'){const controls=[...overlay.querySelectorAll('button')];const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
 });
 overlay.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{
  const choice=button.dataset.choice;close();
  if(choice==='reservation'){window.RestoScreens?.show('reservationForm');document.getElementById('reservationForm')?.scrollIntoView({block:'start'});return}
  const panel=document.getElementById('passages');if(panel)panel.open=true;
  window.RestoScreens?.show('passages');
  requestAnimationFrame(()=>{panel?.scrollIntoView({block:'start',behavior:'instant'});document.getElementById('walkinGuests')?.focus({preventScroll:true})});
 }));
})();
