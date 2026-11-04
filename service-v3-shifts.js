'use strict';
(function(){
const form=document.getElementById('restaurantShiftForm');if(!form)return;
const KEY='restomanager_shifts_v1',names=['lunch','dinner'],defaults=ReservationEngine.getShifts();
for(const key of names){const shift=defaults[key];for(const [field,value] of Object.entries(shift)){const input=document.getElementById('shift-'+key+'-'+field);if(!input)continue;if(field==='enabled')input.checked=value;else input.value=value}}
form.addEventListener('submit',event=>{event.preventDefault();const next={};for(const key of names){const enabled=document.getElementById('shift-'+key+'-enabled').checked,start=document.getElementById('shift-'+key+'-start').value,end=document.getElementById('shift-'+key+'-end').value;if(!start||!end||start>=end){document.getElementById('shiftFeedback').textContent='Horaires invalides : vérifiez les heures de début et de dernière commande.';return}next[key]={enabled,start,end}}
if(next.lunch.enabled&&next.dinner.enabled&&next.lunch.end>=next.dinner.start){document.getElementById('shiftFeedback').textContent='Les deux services ne doivent pas se chevaucher.';return}
localStorage.setItem(KEY,JSON.stringify(next));document.getElementById('shiftFeedback').textContent='Horaires enregistrés. Les nouvelles réservations et les passages suivent ces créneaux.';window.dispatchEvent(new Event('restomanager:v3-change'))});
})();