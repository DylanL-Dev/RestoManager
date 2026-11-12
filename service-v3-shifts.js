'use strict';
(function(){
const form=document.getElementById('restaurantShiftForm');if(!form)return;
const KEY='restomanager_shifts_v1',names=['lunch','dinner'],defaults=ReservationEngine.getShifts();
for(const key of names){const shift=defaults[key];for(const [field,value] of Object.entries(shift)){const input=document.getElementById('shift-'+key+'-'+field);if(!input)continue;if(field==='enabled')input.checked=value;else input.value=value}}
// Explicit, restaurant-scoped closure settings for Saturday and Sunday lunch.
const weekendBox=document.createElement('fieldset');
weekendBox.id='restaurantWeekendLunch';weekendBox.hidden=true;
const weekendLegend=document.createElement('legend');weekendLegend.textContent='Service du midi le week-end';
weekendBox.append(weekendLegend);
const weekendFields={};
for(const [key,title] of [['saturdayLunchClosed','Samedi midi fermé'],['sundayLunchClosed','Dimanche midi fermé']]){
 const label=document.createElement('label'),input=document.createElement('input');
 input.type='checkbox';input.id='shift-weekend-'+key;weekendFields[key]=input;
 label.append(input,document.createTextNode(' '+title));weekendBox.append(label);
}
const weekendHint=document.createElement('p');weekendHint.className='muted';
weekendHint.textContent='Les créneaux fermés sont refusés à la Réception et par Supabase, même si des tables sont libres.';
weekendBox.append(weekendHint);
(form.querySelector('.shiftSettingsGrid')||form).append(weekendBox);
const durationBox=document.createElement('div');durationBox.className='restaurantDurationSetting';
const durationLabel=document.createElement('label');durationLabel.textContent='Durée par défaut d’une table';
const durationSelect=document.createElement('select');durationSelect.id='restaurantDefaultDuration';
for(const [mins,label] of [[30,'30 min'],[45,'45 min'],[60,'1 h'],[75,'1 h 15'],[90,'1 h 30'],[105,'1 h 45'],[120,'2 h'],[150,'2 h 30'],[180,'3 h']]){const option=document.createElement('option');option.value=String(mins);option.textContent=label;durationSelect.append(option)}
durationSelect.value=String(ReservationEngine.getDefaultDuration());
const help=document.createElement('p');help.className='muted';help.textContent='Utilisée pour les nouvelles réservations et installations. Les clients déjà enregistrés ne changent pas.';
// Keep the select as data model; show a button to avoid a second Android-native menu.
const durationTrigger=document.createElement('button');durationTrigger.type='button';
durationTrigger.className='managementSelectTrigger durationSelectTrigger';
durationTrigger.setAttribute('aria-label','Choisir la durée par défaut d’une table');
const refreshDurationTrigger=()=>{durationTrigger.textContent=durationSelect.selectedOptions[0]?.textContent||'Choisir';durationTrigger.setAttribute('aria-haspopup','dialog')};
durationSelect.style.display='none';durationSelect.tabIndex=-1;durationSelect.setAttribute('aria-hidden','true');
durationTrigger.addEventListener('click',()=>{window.RestoOpenSelectPicker?.(durationSelect)});
durationSelect.addEventListener('change',refreshDurationTrigger);
durationLabel.append(durationSelect,durationTrigger);
durationBox.append(durationLabel,help);form.prepend(durationBox);
refreshDurationTrigger();
const durationFeedback=document.createElement('p');
durationFeedback.className='durationSettingFeedback';
durationFeedback.setAttribute('role','status');
durationFeedback.setAttribute('aria-live','polite');
durationBox.append(durationFeedback);
let savedDuration=Number(durationSelect.value);
let durationSaving=false;
durationSelect.addEventListener('change',async()=>{
 if(durationSaving)return;
 const chosen=Number(durationSelect.value);
 if(!Number.isInteger(chosen))return;
 if(chosen===savedDuration)return;
 if(window.RestoSharedReservations){
  durationSaving=true;durationSelect.disabled=true;
  durationFeedback.textContent='Enregistrement de la durée…';
  try{
   if(!window.RestoSupabaseReady||!window.RestoSharedHours||typeof window.RestoSaveSharedHours!=='function')
    throw Error('Synchronisation indisponible : durée non enregistrée.');
   // Save the currently persisted shift times, not unsaved changes in the form.
   await window.RestoSaveSharedHours(window.RestoSharedHours.shifts,chosen);
   savedDuration=chosen;
   durationFeedback.textContent='Durée enregistrée pour toute l’équipe.';
  }catch(error){
   durationSelect.value=String(savedDuration);refreshDurationTrigger();
   window.RestoErrors?.diagnostic('save-duration',error);durationFeedback.textContent=window.RestoErrors?.message(error,'Durée non confirmée. Réessayez après synchronisation.')||'Durée non confirmée. Réessayez après synchronisation.';
  }finally{durationSaving=false;durationSelect.disabled=false}
 }else{
  try{
   localStorage.setItem('restomanager_default_duration_v1',String(chosen));
   savedDuration=chosen;
   durationFeedback.textContent='Durée enregistrée sur cet appareil.';
   window.dispatchEvent(new Event('restomanager:v3-change'));
  }catch(error){
   durationSelect.value=String(savedDuration);refreshDurationTrigger();
   durationFeedback.textContent='Impossible d’enregistrer la durée.';
  }
 }
});
let lastSharedHours=null;
function refreshSharedHours(){
 if(!window.RestoSharedHours)return;
 const signature=JSON.stringify(window.RestoSharedHours);
 if(signature===lastSharedHours)return;
 const {shifts,duration,weekend}=window.RestoSharedHours;
 lastSharedHours=signature;
 weekendBox.hidden=!weekend?.supported;
 for(const key of Object.keys(weekendFields)){weekendFields[key].checked=weekend?.[key]===true;weekendFields[key].disabled=!weekend?.supported;}
 for(const key of names){
  document.getElementById('shift-'+key+'-enabled').checked=shifts[key].enabled;
  for(const field of ['start','end'])document.getElementById('shift-'+key+'-'+field).value=shifts[key][field];
 }
 durationSelect.value=String(duration);
 savedDuration=Number(duration);refreshDurationTrigger();
}
window.addEventListener('restomanager:hours',refreshSharedHours);
window.addEventListener('restomanager:supabase-snapshot',refreshSharedHours);
form.addEventListener('submit',async event=>{event.preventDefault();const next={};for(const key of names){const enabled=document.getElementById('shift-'+key+'-enabled').checked,start=document.getElementById('shift-'+key+'-start').value,end=document.getElementById('shift-'+key+'-end').value;if(!start||!end||start>=end){document.getElementById('shiftFeedback').textContent='Horaires invalides : vérifiez les heures de début et de dernière commande.';return}next[key]={enabled,start,end}}
if(next.lunch.enabled&&next.dinner.enabled&&next.lunch.end>=next.dinner.start){document.getElementById('shiftFeedback').textContent='Les deux services ne doivent pas se chevaucher.';return}
if(window.RestoSharedReservations){
 const feedback=document.getElementById('shiftFeedback'),button=form.querySelector('[type=submit]');
 button.disabled=true;
 try{
  await window.RestoSaveSharedHours(next,Number(durationSelect.value),{saturdayLunchClosed:weekendFields.saturdayLunchClosed.checked,sundayLunchClosed:weekendFields.sundayLunchClosed.checked});
  feedback.textContent='Horaires et durée enregistrés pour toute l’équipe.';
 }catch(error){window.RestoErrors?.diagnostic('save-hours',error);feedback.textContent=window.RestoErrors?.message(error,'Horaires non confirmés. Réessayez après synchronisation.')||'Horaires non confirmés. Réessayez après synchronisation.'}finally{button.disabled=false}
 return;
}
localStorage.setItem(KEY,JSON.stringify(next));localStorage.setItem('restomanager_default_duration_v1',durationSelect.value);document.getElementById('shiftFeedback').textContent='Horaires et durée standard enregistrés. Les nouvelles réservations et installations utilisent ces réglages.';window.dispatchEvent(new Event('restomanager:v3-change'))});
})();