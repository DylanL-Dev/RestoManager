'use strict';
/* Sélecteur horaire RestoManager : remplacement hors ligne des horloges Android. */
(function(){
 const inputs=[...document.querySelectorAll('input[type="time"]')];
 if(!inputs.length)return;
 const dialog=document.createElement('div');dialog.className='rmTimeOverlay';dialog.hidden=true;
 dialog.innerHTML='<div class="rmTimeBackdrop"></div><section class="rmTimeDialog" role="dialog" aria-modal="true" aria-labelledby="rmTimeTitle"><header><div><span class="rmTimeEyebrow">RESTOMANAGER</span><h2 id="rmTimeTitle">Choisir une heure</h2></div><button class="rmTimeClose" type="button" aria-label="Fermer">×</button></header><div class="rmTimePreview" aria-live="polite">12:00</div><div class="rmTimeFields"><label>Heures<select class="rmTimeHours"></select></label><label>Minutes<select class="rmTimeMinutes"></select></label></div><label class="rmTimePrecision"><input type="checkbox" class="rmTimeExact"> Minutes précises (pas de 1 minute)</label><div class="rmTimeActions"><button type="button" class="rmTimeCancel">Annuler</button><button type="button" class="rmTimeSave">Valider l’heure</button></div></section>';
 document.body.append(dialog);
 const hour=dialog.querySelector('.rmTimeHours'),minute=dialog.querySelector('.rmTimeMinutes'),exact=dialog.querySelector('.rmTimeExact'),preview=dialog.querySelector('.rmTimePreview');
 let current=null,prior=null;
 const pad=n=>String(n).padStart(2,'0');
 for(let h=0;h<24;h++)hour.add(new Option(pad(h)+' h',pad(h)));
 const fillMinutes=(value)=>{minute.replaceChildren();for(let m=0;m<60;m++){if(!exact.checked&&m%5!==0&&m!==Number(value))continue;minute.add(new Option(pad(m)+' min',pad(m)))}minute.value=value};
 const refresh=()=>preview.textContent=hour.value+':'+minute.value;
 const close=()=>{dialog.hidden=true;document.body.classList.remove('rmTimeOpen');const target=prior;current=null;target?.focus({preventScroll:true})};
 const open=input=>{
  prior=document.activeElement===input?null:document.activeElement;current=input;
  const value=/^([01]\d|2[0-3]):[0-5]\d$/.test(input.value)?input.value:'12:00';
  const [h,m]=value.split(':');exact.checked=false;hour.value=h;fillMinutes(m);refresh();
  const label=input.closest('label')?.textContent?.trim()||'Choisir une heure';dialog.querySelector('#rmTimeTitle').textContent=label.length<45?label:'Choisir une heure';
  dialog.hidden=false;document.body.classList.add('rmTimeOpen');hour.focus();
 };
 inputs.forEach(input=>{
  input.type='text';input.inputMode='none';input.autocomplete='off';input.readOnly=true;
  input.classList.add('rmTimeInput');input.setAttribute('aria-haspopup','dialog');
  input.addEventListener('click',()=>open(input));
  input.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '||event.key==='ArrowDown'){event.preventDefault();open(input)}});
 });
 hour.addEventListener('change',refresh);minute.addEventListener('change',refresh);
 exact.addEventListener('change',()=>{const previous=minute.value;fillMinutes(exact.checked?previous:pad(Math.round(Number(previous)/5)*5%60));refresh()});
 dialog.querySelector('.rmTimeSave').addEventListener('click',()=>{
  if(!current)return;const value=hour.value+':'+minute.value;const input=current;
  input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close();
 });
 dialog.querySelector('.rmTimeCancel').addEventListener('click',close);
 dialog.querySelector('.rmTimeClose').addEventListener('click',close);
 dialog.querySelector('.rmTimeBackdrop').addEventListener('click',close);
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close()}
  if(event.key==='Tab'){const focusables=[...dialog.querySelectorAll('button,select,input')];const first=focusables[0],last=focusables[focusables.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
 });
})();
