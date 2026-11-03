'use strict';
(function(){
const ids=['tableAdminRoom','roomFilter'];
const overlay=document.createElement('div');overlay.className='roomPickerOverlay';overlay.hidden=true;
overlay.innerHTML='<div class="roomPickerBackdrop"></div><section class="roomPickerSheet" role="dialog" aria-modal="true" aria-labelledby="roomPickerTitle" tabindex="-1"><header class="roomPickerHeader"><div><small>RESTOMANAGER</small><h2 id="roomPickerTitle">Choisir une salle</h2><p>Sélectionnez la salle souhaitée</p></div><button class="roomPickerClose" type="button" aria-label="Fermer">✕</button></header><div class="roomPickerOptions"></div></section>';
document.body.append(overlay);
const sheet=overlay.querySelector('.roomPickerSheet'),optionsBox=overlay.querySelector('.roomPickerOptions');let previous=null;
function close(){overlay.hidden=true;document.body.classList.remove('roomPickerOpen');previous?.focus();previous=null}
overlay.querySelector('.roomPickerBackdrop').onclick=close;overlay.querySelector('.roomPickerClose').onclick=close;
document.addEventListener('keydown',e=>{if(overlay.hidden)return;if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const buttons=[...sheet.querySelectorAll('button:not([disabled])')];const i=buttons.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();buttons[buttons.length-1].focus()}else if(!e.shiftKey&&i===buttons.length-1){e.preventDefault();buttons[0].focus()}}});
ids.forEach(id=>{const select=document.getElementById(id);if(!select)return;
const trigger=document.createElement('button');trigger.type='button';trigger.className='roomChoiceTrigger';trigger.setAttribute('aria-label','Choisir une salle');select.insertAdjacentElement('afterend',trigger);select.classList.add('visuallyHiddenSelect');select.tabIndex=-1;
function refresh(){const chosen=[...select.options].find(o=>o.value===select.value);trigger.replaceChildren();const name=document.createElement('span');name.textContent=chosen?.textContent||'Choisir une salle';const arrow=document.createElement('span');arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');trigger.append(name,arrow);trigger.disabled=!select.options.length}
trigger.addEventListener('click',()=>{previous=trigger;optionsBox.replaceChildren();[...select.options].forEach(o=>{const button=document.createElement('button');button.type='button';button.className='roomPickerOption'+(o.value===select.value?' selected':'');const name=document.createElement('span');name.textContent=o.textContent;const mark=document.createElement('span');mark.textContent=o.value===select.value?'✓':'';mark.setAttribute('aria-hidden','true');button.append(name,mark);button.addEventListener('click',()=>{select.value=o.value;select.dispatchEvent(new Event('change',{bubbles:true}));refresh();close()});optionsBox.append(button)});overlay.hidden=false;document.body.classList.add('roomPickerOpen');overlay.querySelector('.roomPickerClose').focus()});
select.addEventListener('change',refresh);
const observer=new MutationObserver(refresh);observer.observe(select,{childList:true,subtree:true});
refresh();
});
})();