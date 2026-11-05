'use strict';
(function(){
const form=document.getElementById('restaurantShiftForm');if(!form)return;
const KEY='restomanager_shifts_v1',names=['lunch','dinner'],defaults=ReservationEngine.getShifts();
for(const key of names){const shift=defaults[key];for(const [field,value] of Object.entries(shift)){const input=document.getElementById('shift-'+key+'-'+field);if(!input)continue;if(field==='enabled')input.checked=value;else input.value=value}}
const durationBox=document.createElement('div');durationBox.className='restaurantDurationSetting';
const durationLabel=document.createElement('label');durationLabel.textContent='Durée standard d’occupation des tables';
const durationSelect=document.createElement('select');durationSelect.id='restaurantDefaultDuration';
for(const [mins,label] of [[30,'30 min'],[45,'45 min'],[60,'1 h'],[75,'1 h 15'],[90,'1 h 30'],[105,'1 h 45'],[120,'2 h'],[150,'2 h 30'],[180,'3 h']]){const option=document.createElement('option');option.value=String(mins);option.textContent=label;durationSelect.append(option)}
durationSelect.value=String(ReservationEngine.getDefaultDuration());
const help=document.createElement('p');help.className='muted';help.textContent='Appliquée à toutes les nouvelles réservations et installations, sans modifier celles déjà enregistrées.';
durationLabel.append(durationSelect);durationBox.append(durationLabel,help);form.prepend(durationBox);
form.addEventListener('submit',event=>{event.preventDefault();const next={};for(const key of names){const enabled=document.getElementById('shift-'+key+'-enabled').checked,start=document.getElementById('shift-'+key+'-start').value,end=document.getElementById('shift-'+key+'-end').value;if(!start||!end||start>=end){document.getElementById('shiftFeedback').textContent='Horaires invalides : vérifiez les heures de début et de dernière commande.';return}next[key]={enabled,start,end}}
if(next.lunch.enabled&&next.dinner.enabled&&next.lunch.end>=next.dinner.start){document.getElementById('shiftFeedback').textContent='Les deux services ne doivent pas se chevaucher.';return}
localStorage.setItem(KEY,JSON.stringify(next));localStorage.setItem('restomanager_default_duration_v1',durationSelect.value);document.getElementById('shiftFeedback').textContent='Horaires et durée standard enregistrés. Les nouvelles réservations et installations utilisent ces réglages.';window.dispatchEvent(new Event('restomanager:v3-change'))});
})();