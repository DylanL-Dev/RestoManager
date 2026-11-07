'use strict';
/* RestoManager : choix des heures sans composants natifs Android, 100 % hors ligne. */
(function(){
 const inputs=[...document.querySelectorAll('input[type="time"]')];if(!inputs.length)return;
 const root=document.createElement('div');root.className='rmTimeOverlay';root.hidden=true;
 root.innerHTML='<div class="rmTimeBackdrop"></div><section class="rmTimeDialog" role="dialog" aria-modal="true" aria-labelledby="rmTimeTitle"><header><div><span class="rmTimeEyebrow">CHOIX DE L’HEURE</span><h2 id="rmTimeTitle">Horaire</h2></div><button class="rmTimeClose" type="button" aria-label="Fermer">×</button></header><div class="rmTimePreview" aria-live="polite"><button class="rmTimePreviewHour" type="button">12</button><span>:</span><button class="rmTimePreviewMinute" type="button">00</button></div><div class="rmTimeSwitch"><button type="button" class="rmTimeTabHour">Heures</button><button type="button" class="rmTimeTabMinute">Minutes</button></div><div class="rmTimeGrid" role="group" aria-label="Choix de l’heure"></div><label class="rmTimePrecision"><input type="checkbox" class="rmTimeExact"> Précision à la minute</label><div class="rmTimeActions"><button type="button" class="rmTimeCancel">Annuler</button><button type="button" class="rmTimeSave">Valider</button></div></section>';
 document.body.append(root);
 const grid=root.querySelector('.rmTimeGrid'),exact=root.querySelector('.rmTimeExact'),hourBtn=root.querySelector('.rmTimePreviewHour'),minuteBtn=root.querySelector('.rmTimePreviewMinute');
 let active=null,previousFocus=null,h=12,m=0,tab='hour';
 const pad=n=>String(n).padStart(2,'0');
 const render=()=>{
  hourBtn.textContent=pad(h);minuteBtn.textContent=pad(m);
  root.querySelector('.rmTimeTabHour').classList.toggle('isActive',tab==='hour');
  root.querySelector('.rmTimeTabMinute').classList.toggle('isActive',tab==='minute');
  hourBtn.classList.toggle('isActive',tab==='hour');minuteBtn.classList.toggle('isActive',tab==='minute');
  grid.replaceChildren();grid.classList.toggle('rmTimeGridHours',tab==='hour');
  const values=tab==='hour'?Array.from({length:24},(_,i)=>i):Array.from({length:exact.checked?60:12},(_,i)=>exact.checked?i:i*5);
  for(const n of values){const b=document.createElement('button');b.type='button';b.className='rmTimeNumber';b.textContent=pad(n);b.setAttribute('aria-label',tab==='hour'?n+' heures':n+' minutes');b.setAttribute('aria-pressed',String(n===(tab==='hour'?h:m)));if(n===(tab==='hour'?h:m))b.classList.add('isSelected');b.addEventListener('click',()=>{if(tab==='hour'){h=n;tab='minute'}else m=n;render()});grid.append(b)}
 };
 const close=()=>{root.hidden=true;document.body.classList.remove('rmTimeOpen');active=null;previousFocus?.focus?.({preventScroll:true})};
 const open=input=>{
  previousFocus=input;active=input;const value=/^([01]\d|2[0-3]):[0-5]\d$/.test(input.value)?input.value:'12:00';
  [h,m]=value.split(':').map(Number);exact.checked=m%5!==0;tab=input.id==='bookingTime'?'minute':'hour';
  root.querySelector('#rmTimeTitle').textContent=input.closest('label')?.textContent?.trim().slice(0,45)||'Choisir une heure';
  root.hidden=false;document.body.classList.add('rmTimeOpen');render();root.querySelector(tab==='minute'?'.rmTimeTabMinute':'.rmTimeTabHour').focus({preventScroll:true});
 };
 for(const input of inputs){
  input.type='text';input.inputMode='none';input.autocomplete='off';input.readOnly=true;
  input.classList.add('rmTimeInput');input.setAttribute('aria-haspopup','dialog');
  input.addEventListener('click',()=>open(input));
  input.addEventListener('keydown',e=>{if(['Enter',' ','ArrowDown'].includes(e.key)){e.preventDefault();open(input)}});
 }
 root.querySelector('.rmTimeTabHour').addEventListener('click',()=>{tab='hour';render()});
 root.querySelector('.rmTimeTabMinute').addEventListener('click',()=>{tab='minute';render()});
 hourBtn.addEventListener('click',()=>{tab='hour';render()});minuteBtn.addEventListener('click',()=>{tab='minute';render()});
 exact.addEventListener('change',()=>{if(!exact.checked&&m%5)m=Math.min(55,Math.round(m/5)*5);render()});
 root.querySelector('.rmTimeSave').addEventListener('click',()=>{if(!active)return;const input=active;input.value=pad(h)+':'+pad(m);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close()});
 root.querySelector('.rmTimeCancel').addEventListener('click',close);root.querySelector('.rmTimeClose').addEventListener('click',close);root.querySelector('.rmTimeBackdrop').addEventListener('click',close);
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const items=[...root.querySelectorAll('button,input')].filter(el=>el.getClientRects().length);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
})();
