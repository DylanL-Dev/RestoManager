'use strict';
/* Calendrier RestoManager, autonome et utilisable hors connexion. */
(function(){
 const inputs=[...document.querySelectorAll('input[type="date"]')];if(!inputs.length)return;
 const pad=n=>String(n).padStart(2,'0'),iso=(y,m,d)=>y+'-'+pad(m+1)+'-'+pad(d);
 const parse=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||'');if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3],12);return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]?d:null};
 const months=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
 const root=document.createElement('div');root.className='rmCalendarOverlay';root.hidden=true;
 root.innerHTML='<div class="rmCalendarBackdrop"></div><section class="rmCalendarDialog" role="dialog" aria-modal="true" aria-labelledby="rmCalendarTitle"><header><div><span class="rmCalendarEyebrow">CHOIX DE LA DATE</span><h2 id="rmCalendarTitle">Calendrier</h2></div><button type="button" class="rmCalendarClose" aria-label="Fermer"><i data-lucide="x"></i></button></header><div class="rmCalendarNav"><button type="button" class="rmCalendarPrev" aria-label="Mois précédent"><i data-lucide="chevron-left"></i></button><div class="rmCalendarMonth"></div><button type="button" class="rmCalendarNext" aria-label="Mois suivant"><i data-lucide="chevron-right"></i></button></div><div class="rmCalendarWeek"><span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span></div><div class="rmCalendarDays" role="group" aria-label="Jours du mois"></div><div class="rmCalendarActions"><button type="button" class="rmCalendarToday">Aujourd’hui</button><button type="button" class="rmCalendarCancel">Annuler</button></div></section>';
 document.body.append(root);
 let active=null,previousFocus=null,year,month;
 const days=root.querySelector('.rmCalendarDays');
 const allowed=value=>{if(!active)return false;const min=active.getAttribute('min'),max=active.getAttribute('max');return (!min||value>=min)&&(!max||value<=max)};
 const close=()=>{root.hidden=true;document.body.classList.remove('rmCalendarOpen');active=null;previousFocus?.focus?.({preventScroll:true})};
 const choose=value=>{if(!active||!allowed(value))return;const el=active;el.value=value;el.dataset.rmDateValue=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));close()};
 const render=()=>{
  root.querySelector('.rmCalendarMonth').textContent=months[month]+' '+year;days.replaceChildren();
  const offset=(new Date(year,month,1).getDay()+6)%7,total=new Date(year,month+1,0).getDate(),today=new Date(),todayIso=iso(today.getFullYear(),today.getMonth(),today.getDate());
  for(let i=0;i<offset;i++){const blank=document.createElement('span');blank.className='rmCalendarBlank';days.append(blank)}
  for(let day=1;day<=total;day++){const value=iso(year,month,day),btn=document.createElement('button');btn.type='button';btn.className='rmCalendarDay';btn.textContent=day;btn.disabled=!allowed(value);btn.setAttribute('aria-label',new Date(year,month,day).toLocaleDateString('fr-FR',{dateStyle:'full'}));if(value===active?.value)btn.classList.add('isSelected');if(value===todayIso)btn.classList.add('isToday');btn.addEventListener('click',()=>choose(value));days.append(btn)}
 };
 const open=input=>{active=input;previousFocus=input;const date=parse(input.value)||new Date();year=date.getFullYear();month=date.getMonth();root.querySelector('#rmCalendarTitle').textContent=input.closest('label')?.textContent?.trim().slice(0,48)||'Choisir une date';root.hidden=false;document.body.classList.add('rmCalendarOpen');render();root.querySelector('.rmCalendarPrev').focus({preventScroll:true})};
 for(const input of inputs){
  // Conserver le type date natif pour les formulaires, la validation et les valeurs ISO.
  // Un bouton transparent superposé intercepte l'interaction sans invoquer le calendrier Android.
  const wrapper=document.createElement('span');wrapper.className='rmCalendarField';input.parentNode.insertBefore(wrapper,input);wrapper.append(input);
  const trigger=document.createElement('button');trigger.type='button';trigger.className='rmCalendarTrigger';trigger.setAttribute('aria-label','Choisir une date');trigger.addEventListener('click',()=>open(input));wrapper.append(trigger);
  input.classList.add('rmCalendarInput');input.tabIndex=-1;
  const update=()=>{trigger.replaceChildren();const label=document.createElement('span');label.textContent=parse(input.value)?parse(input.value).toLocaleDateString('fr-FR'):'Choisir une date';const icon=document.createElement('i');icon.setAttribute('data-lucide','calendar-days');trigger.append(label,icon);window.lucide?.createIcons?.();trigger.classList.toggle('isEmpty',!parse(input.value))};
  input.addEventListener('input',update);input.addEventListener('change',update);
  const observer=new MutationObserver(update);observer.observe(input,{attributes:true,attributeFilter:['value']});
  update();
  // Certaines vues changent la valeur en JavaScript sans émettre d'événement.
  wrapper.addEventListener('pointerenter',update);
 }
 root.querySelector('.rmCalendarPrev').addEventListener('click',()=>{month--;if(month<0){month=11;year--}render()});
 root.querySelector('.rmCalendarNext').addEventListener('click',()=>{month++;if(month>11){month=0;year++}render()});
 root.querySelector('.rmCalendarToday').addEventListener('click',()=>{const d=new Date();const value=iso(d.getFullYear(),d.getMonth(),d.getDate());if(allowed(value))choose(value);else{year=d.getFullYear();month=d.getMonth();render()}});
 for(const sel of ['.rmCalendarClose','.rmCalendarCancel','.rmCalendarBackdrop'])root.querySelector(sel).addEventListener('click',close);
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const controls=[...root.querySelectorAll('button:not(:disabled)')].filter(x=>x.getClientRects().length);if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
})();
