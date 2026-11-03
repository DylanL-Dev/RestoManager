'use strict';
(function(){
const configs=[['bookingTable','bookingGuests'],['walkinTable','walkinGuests']];
function setup(selectId,guestsId){
 const select=document.getElementById(selectId);if(!select)return;
 const box=document.createElement('div');box.className='tableChoice';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='tableChoiceTrigger';trigger.setAttribute('aria-expanded','false');
 const panel=document.createElement('div');panel.className='tableChoicePanel';panel.hidden=true;
 const caption=document.createElement('p');caption.className='tableChoiceCaption';caption.textContent='Tables disponibles pour ce créneau';
 const grid=document.createElement('div');grid.className='tableChoiceGrid';panel.append(caption,grid);
 select.parentNode.append(box);box.append(trigger,panel);select.classList.add('visuallyHiddenSelect');select.tabIndex=-1;
 function refresh(){
 const options=Array.from(select.options).filter(o=>o.value);
 trigger.textContent=select.selectedOptions[0]?.value?'Table '+select.value+' · '+select.selectedOptions[0].textContent.split('·')[1]?.trim():'Aucune table disponible';
 trigger.disabled=!options.length;
 grid.replaceChildren();
 options.forEach((option,i)=>{
 const card=document.createElement('button');card.type='button';card.className='tableChoiceCard'+(option.value===select.value?' selected':'');
 const name=document.createElement('strong');name.textContent='Table '+option.value;
 const desc=document.createElement('small');desc.textContent=option.textContent.split('·').slice(1).join('·').replace('Recommandée','').trim();
 card.append(name,desc);
 if(i===0){const tag=document.createElement('em');tag.textContent='Suggestion';card.append(tag)}
 card.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));panel.hidden=true;trigger.setAttribute('aria-expanded','false');refresh()});
 grid.append(card);
 });
 }
 trigger.addEventListener('click',()=>{panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)refresh()});
 document.addEventListener('click',e=>{if(!box.contains(e.target)){panel.hidden=true;trigger.setAttribute('aria-expanded','false')}});
 select.addEventListener('change',refresh);refresh();return refresh;
}
const refreshers={};configs.forEach(([id,guest])=>{refreshers[id]=setup(id,guest)});
window.RestoTableChoices={refresh(id){refreshers[id]?.()}};
})();