'use strict';
(function(){
const configs=['bookingTable','walkinTable','editTable'];
let active=null;
const overlay=document.createElement('div');overlay.className='tablePickerOverlay';overlay.hidden=true;
overlay.innerHTML='<div class="tablePickerBackdrop"></div><section class="tablePickerSheet" role="dialog" aria-modal="true" aria-labelledby="tablePickerTitle" tabindex="-1"><header class="tablePickerHeader"><div><span class="tablePickerEyebrow">DISPONIBILITÉS</span><h2 id="tablePickerTitle">Choisir une table</h2><p id="tablePickerSubtitle">Sélectionnez la meilleure option</p></div><button class="tablePickerClose" type="button" aria-label="Fermer">✕</button></header><div class="tablePickerGrid"></div><footer class="tablePickerFooter">Les tables proposées respectent le créneau et la capacité indiqués.</footer></section>';
document.body.append(overlay);
const grid=overlay.querySelector('.tablePickerGrid'),sheet=overlay.querySelector('.tablePickerSheet');
let previousFocus=null;
function close(){overlay.hidden=true;document.body.classList.remove('tablePickerOpen');active=null;if(previousFocus)previousFocus.focus()}
overlay.querySelector('.tablePickerClose').addEventListener('click',close);
overlay.querySelector('.tablePickerBackdrop').addEventListener('click',close);
document.addEventListener('keydown',e=>{if(overlay.hidden)return;if(e.key==='Escape')close();if(e.key==='Tab'){const controls=Array.from(sheet.querySelectorAll('button:not([disabled])'));const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
const refreshers={};
configs.forEach(id=>{
 const select=document.getElementById(id);if(!select)return;
 const box=document.createElement('div');box.className='tableChoice';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='tableChoiceTrigger';
 select.parentNode.append(box);box.append(trigger);select.classList.add('visuallyHiddenSelect');select.tabIndex=-1;
 function refresh(){
 const options=Array.from(select.options).filter(o=>o.value);
 const chosen=options.find(o=>o.value===select.value);
 trigger.replaceChildren();
 const label=document.createElement('span');label.textContent=chosen?(chosen.textContent):'Aucune table disponible';
 const action=document.createElement('span');action.className='tableChoiceAction';action.textContent=chosen?'Changer':'Choisir';
 trigger.append(label,action);trigger.disabled=!options.length;
 if(active===id)render();
 }
 function render(){
 grid.replaceChildren();
 const options=Array.from(select.options).filter(o=>o.value);
 overlay.querySelector('#tablePickerTitle').textContent=id==='editTable'?'Modifier les tables':'Choisir une table';
 overlay.querySelector('#tablePickerSubtitle').textContent=id==='editTable'?'Sélectionnez une table ou une fusion autorisée':options.length+' table(s) compatible(s) avec votre réservation';
 overlay.querySelector('.tablePickerFooter').textContent=id==='editTable'?'La disponibilité sera vérifiée avant l’enregistrement.':'Les tables proposées respectent le créneau et la capacité indiqués.';
 options.sort((a,b)=>id==='editTable'?((b.dataset.availability==='available'?2:b.dataset.availability==='caution'?1:0)-(a.dataset.availability==='available'?2:a.dataset.availability==='caution'?1:0)):0);
 options.forEach((o,i)=>{
 const card=document.createElement('button');card.type='button';card.className='tablePickerCard'+(o.value===select.value?' selected':'')+(o.disabled?' unavailable':'')+(o.dataset.availability==='caution'?' caution':'');card.disabled=Boolean(o.disabled);
 const top=document.createElement('div');top.className='tablePickerCardTop';
 const name=document.createElement('strong');name.textContent=o.textContent.split(' · ')[0];top.append(name);
 if(i===0&&id!=='editTable'){const tag=document.createElement('span');tag.className='tablePickerBest';tag.textContent='★ Recommandée';top.append(tag)}
 const desc=document.createElement('small');desc.textContent=o.textContent.split('·').slice(1).join('·').replace('Recommandée','').trim();
 const indicator=document.createElement('span');indicator.className='tablePickerIndicator';indicator.textContent=id==='editTable'?(o.disabled?(o.dataset.reason||'Indisponible'):(o.dataset.availability==='caution'?(o.dataset.reason||'À confirmer'):(o.value===select.value?'✓ Sélectionnée':'✓ Disponible'))):(o.value===select.value?'✓ Sélectionnée':'Choisir cette table');
 card.append(top,desc,indicator);
 card.addEventListener('click',()=>{select.value=o.value;select.dispatchEvent(new Event('change',{bubbles:true}));close();refresh()});
 grid.append(card);
 });
 }
 trigger.addEventListener('click',()=>{previousFocus=trigger;active=id;render();overlay.hidden=false;document.body.classList.add('tablePickerOpen');overlay.querySelector('.tablePickerClose').focus()});
 select.addEventListener('change',refresh);refresh();refreshers[id]=refresh;
});
window.RestoTableChoices={refresh(id){refreshers[id]?.()}};
})();