'use strict';
(function(){
 const overlay=document.createElement('div');
 overlay.className='restoConfirmOverlay';
 overlay.hidden=true;
 overlay.innerHTML='<div class="restoConfirmBackdrop"></div><section class="restoConfirmSheet" role="alertdialog" aria-modal="true" aria-labelledby="restoConfirmTitle" aria-describedby="restoConfirmDescription"><div class="restoConfirmSymbol" aria-hidden="true">!</div><p class="restoConfirmEyebrow">ATTRIBUTION À VÉRIFIER</p><h2 id="restoConfirmTitle">Table encore occupée</h2><p id="restoConfirmDescription">Un départ reste à confirmer.</p><div class="restoConfirmWarnings"></div><p class="restoConfirmNote">Le départ est estimé sur la durée prévue. La réservation existante restera « Installé » tant que son départ ne sera pas confirmé.</p><div class="restoConfirmActions"><button type="button" data-decision="cancel">Choisir une autre table</button><button type="button" data-decision="accept">Confirmer l’attribution</button></div></section>';
 document.body.append(overlay);
 let resolvePending=null,focusBefore=null;
 const finish=answer=>{
  if(!resolvePending)return;
  const done=resolvePending;resolvePending=null;overlay.hidden=true;document.body.classList.remove('restoConfirmOpen');focusBefore?.focus();done(answer);
 };
 overlay.querySelector('[data-decision="cancel"]').addEventListener('click',()=>finish(false));
 overlay.querySelector('[data-decision="accept"]').addEventListener('click',()=>finish(true));
 overlay.querySelector('.restoConfirmBackdrop').addEventListener('click',()=>finish(false));
 document.addEventListener('keydown',event=>{
  if(overlay.hidden)return;
  if(event.key==='Escape'){event.preventDefault();finish(false)}
  if(event.key==='Tab'){
   const buttons=[...overlay.querySelectorAll('button')],first=buttons[0],last=buttons[buttons.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
 });
 window.RestoConfirmSeating=function(warnings,client,time){
  if(resolvePending)return Promise.resolve(false);
  focusBefore=document.activeElement;
  overlay.querySelector('#restoConfirmDescription').textContent='Pour '+client+' à '+time+', les tables sélectionnées sont encore marquées occupées.';
  const list=overlay.querySelector('.restoConfirmWarnings');list.replaceChildren();
  warnings.forEach(w=>{
   const card=document.createElement('div');card.className='restoConfirmWarning';
   const label=document.createElement('strong');label.textContent='Client '+w.client+' · Tables '+w.tables.join(' + ');
   const end=document.createElement('span');end.textContent='Fin de repas prévue : '+w.plannedEnd;
   const gap=document.createElement('span');gap.textContent='Marge avant la nouvelle réservation : '+w.gapMinutes+' min';
   card.append(label,end,gap);list.append(card);
  });
  overlay.hidden=false;document.body.classList.add('restoConfirmOpen');
  overlay.querySelector('[data-decision="cancel"]').focus();
  return new Promise(resolve=>{resolvePending=resolve});
 };
})();
