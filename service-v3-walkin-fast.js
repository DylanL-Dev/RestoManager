'use strict';
(function(){
const $=id=>document.getElementById(id),E=ReservationEngine,KEY='restomanager_reservations';
const now=()=>new Date(),pad=n=>String(n).padStart(2,'0');
const stamp=()=>{const d=now();return {date:[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-'),time:pad(d.getHours())+':'+pad(d.getMinutes())}};
const load=()=>E.normalizeReservations(window.RestoSharedReservations||JSON.parse(localStorage.getItem(KEY)||'[]'));
let feedbackTimer;
function showInstallNotice(message,isError=false){
 let notice=document.getElementById('walkinInstallNotice');
 if(!notice){notice=document.createElement('div');notice.id='walkinInstallNotice';notice.className='walkinInstallNotice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');document.body.append(notice)}
 notice.replaceChildren();
 const symbol=document.createElement('span');symbol.className='walkinInstallNoticeIcon';symbol.textContent=isError?'!':'✓';
 const content=document.createElement('span');content.textContent=message;
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Fermer la notification');close.addEventListener('click',()=>notice.classList.remove('isVisible'));
 notice.append(symbol,content,close);notice.classList.toggle('isError',isError);notice.classList.add('isVisible');
 clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>notice.classList.remove('isVisible'),isError?7500:5000);
}
let installing=false;
const roomConflictOnly=result=>Boolean(result.roomConflict)&&!result.conflict&&result.errors.length===1&&result.errors[0].includes('possède déjà une réservation');
function roomConflict(all){const value=String($('walkinRoom').value||'').trim();if(!value||document.querySelector('input[name="walkinType"]:checked')?.value==='exterieur')return null;return E.findRoomConflict(draft(1),all)}
const roomNotice=document.createElement('div');
roomNotice.id='walkinSameRoomNotice';roomNotice.className='walkinSameRoomNotice';
roomNotice.setAttribute('role','status');roomNotice.hidden=true;
$('walkinForm').insertBefore(roomNotice,$('walkinRecommendation'));

function draft(table){return {id:'walkin-preview',type:document.querySelector('input[name="walkinType"]:checked')?.value==='exterieur'?'exterieur':'hotel',client:$('walkinRoom').value.trim()||'Client de passage',...stamp(),guests:Number($('walkinGuests').value),duration:E.getDefaultDuration(),tables:Array.isArray(table)?table:[table],status:'seated',walkIn:true}}
function choices(all){const n=Number($('walkinGuests').value);if(!Number.isInteger(n)||n<1)return [];return E.rankedTableChoices(TableStore.get().tables,window.RestoFusion?.pairs()||[],n)
 .filter(c=>!all.some(r=>r.status==='seated'&&r.tables.some(t=>c.numbers.includes(t))))
 .filter(c=>{
  const r=draft(c.numbers),span=window.RestoBookingInterval?.(r.date,r.time,r.duration);
  if(span&&window.RestoBookingDraft.occupied(c.numbers,...span).length)return false;
  const validation=E.validate(r,all);
  return validation.valid||roomConflictOnly(validation);
 })}

function noAvailabilityReason(all){
 const n=Number($('walkinGuests').value);
 if(!Number.isInteger(n)||n<1)return 'Indiquez un nombre de personnes valide.';
 // A pre-existing booking for the same hotel room must not masquerade as
 // every table being occupied. Keep normal duplicate-room protection.
 const hotelRoom=String($('walkinRoom').value||'').trim();
 if(document.querySelector('input[name="walkinType"]:checked')?.value!=='exterieur'&&hotelRoom){
  const duplicate=E.findRoomConflict(draft(1),all);
  if(duplicate)return 'Chambre '+hotelRoom+' : une réservation existe déjà sur ce créneau. Consultez-la dans Réservations avant de créer un nouveau passage. Ce blocage ne signifie pas que toutes les tables sont occupées.';
 }
 const ranked=E.rankedTableChoices(TableStore.get().tables,window.RestoFusion?.pairs()||[],n);
 if(!ranked.length)return 'Aucune table ni fusion adaptée à '+n+' personne(s). Vérifiez les capacités dans Gestion.';
 if(n>=5&&!ranked.some(candidate=>candidate.numbers.length>1)){
  return 'Aucune fusion autorisée pour '+n+' personnes. Dans Gestion > Fusions, associez des tables voisines de la même salle. Les groupes de 3 ou 4 tables seront proposés automatiquement.';
 }
 const result=E.validate(draft(ranked[0].numbers),all);
 if(result.errors.some(error=>error.includes('Horaire hors des services')))return 'Service fermé à cette heure. Vérifiez les jours et créneaux ouverts dans Gestion → Planning hebdomadaire.';
 return 'Aucune table libre pour '+n+' personne(s) pendant '+E.getDefaultDuration()+' minutes. Vérifiez les arrivées à venir et les tables encore occupées.';
}
function recommendationMessage(best,available,guests){
 if(!best)return '';
 const spare=best.capacity-guests;
 const fit=spare===0?'capacité exacte':spare===1?'1 place restante':spare+' places restantes';
 const fusion=best.numbers.length>1?'fusion de '+best.numbers.length+' tables':'table individuelle';
 const alternatives=available.length-1;
 return '✓ Recommandation : '+best.label+' · '+fit+' · '+fusion+
  (alternatives>0?' · '+alternatives+' autre'+(alternatives>1?'s':'')+' possibilité'+(alternatives>1?'s':''):'');
}
function refresh(){updateGuestControls();try{
 // On the connected service, never offer a table while the shared snapshot is stale.
 // A local fallback would give the impression that a passage can be installed offline.
 if(document.getElementById('integrationGate')&&window.RestoSupabaseReady!==true){
  const select=$('walkinTable');select.replaceChildren();select.dataset.manual='';
  $('walkinRecommendation').textContent='Synchronisation en cours ou connexion interrompue. Réessayez après le retour de la connexion.';
  $('walkinForm').querySelector('button[type=submit]').disabled=true;
  window.RestoTableChoices?.refresh('walkinTable');
  return;
 }
 const all=load(),existingRoom=roomConflict(all);
 roomNotice.hidden=!existingRoom;
 roomNotice.textContent=existingRoom?'Chambre '+String($('walkinRoom').value).trim()+' : une réservation existe déjà. Si une autre personne de cette chambre souhaite dîner séparément, choisissez sa table et confirmez « Autre occupant » avant installation.':'';
 const available=choices(all),sel=$('walkinTable'),best=(sel.dataset.manual===String($('walkinGuests').value)&&available.find(c=>c.value===sel.value))||available[0];sel.replaceChildren();for(const t of available){const o=document.createElement('option');o.value=t.value;o.textContent=t.label+' · '+t.capacity+' places';sel.append(o)}if(best)sel.value=best.value;window.RestoTableChoices?.refresh('walkinTable');$('walkinRecommendation').textContent=best?recommendationMessage(best,available,Number($('walkinGuests').value)):noAvailabilityReason(load());$('walkinForm').querySelector('button[type=submit]').disabled=installing||!best;document.querySelectorAll('[data-walkin-pax]').forEach(b=>b.classList.toggle('selected',b.dataset.walkinPax===$('walkinGuests').value))}catch(e){$('walkinRecommendation').textContent='Disponibilités indisponibles : '+e.message;$('walkinForm').querySelector('button[type=submit]').disabled=true}}
function updateGuestControls(){
 const input=$('walkinGuests'),value=Number(input.value);
 const valid=Number.isInteger(value)&&value>=1;
 $('walkinMinus').disabled=!valid||value===1;
 $('walkinPlus').disabled=!valid;
 $('walkinGuestUnit').textContent=valid&&value===1?'personne':'personnes';
 document.querySelectorAll('[data-walkin-pax]').forEach(button=>{
  const active=valid&&Number(button.dataset.walkinPax)===value;
  button.setAttribute('aria-pressed',String(active));
 });
}
function adjustGuestCount(delta){
 const input=$('walkinGuests'),value=Number(input.value);
 if(!Number.isInteger(value)||value<1)return;
 input.value=String(Math.max(1,value+delta));
 input.dispatchEvent(new Event('input',{bubbles:true}));
}
function updateClientType(){
 const hotel=document.querySelector('input[name="walkinType"]:checked')?.value!=='exterieur';
 $('walkinRoomLabel').textContent=hotel?'Chambre ou nom du client (facultatif)':'Nom du client (facultatif)';
 $('walkinRoom').placeholder=hotel?'Ex. 755 ou Dupont':'Ex. Dupont';
}
$('walkinMinus').addEventListener('click',()=>adjustGuestCount(-1));
$('walkinPlus').addEventListener('click',()=>adjustGuestCount(1));
document.querySelectorAll('input[name="walkinType"]').forEach(input=>input.addEventListener('change',updateClientType));
updateClientType();
document.querySelectorAll('[data-walkin-pax]').forEach(b=>b.addEventListener('click',()=>{$('walkinGuests').value=b.dataset.walkinPax;refresh()}));
$('walkinTable').addEventListener('change',()=>{$('walkinTable').dataset.manual=$('walkinGuests').value});
$('walkinGuests').addEventListener('input',refresh);$('walkinRoom').addEventListener('input',refresh);document.querySelectorAll('input[name="walkinType"]').forEach(input=>input.addEventListener('change',refresh));
$('walkinForm').addEventListener('submit',async e=>{e.preventDefault();if(installing)return;installing=true;const submit=$('walkinForm').querySelector('button[type=submit]');submit.disabled=true;try{if(document.getElementById('integrationGate')&&window.RestoSupabaseReady!==true)throw Error('Synchronisation indisponible. Attendez la reconnexion avant d’installer un client.');const all=load(),best=choices(all).find(c=>c.value===$('walkinTable').value);if(!best)throw Error('Aucune table disponible.');const r={...draft(best.numbers),id:'walkin-'+Date.now()+'-'+Math.random().toString(36).slice(2),seatedAt:now().toISOString(),createdAt:now().toISOString()};const validation=E.validate(r,all);
 if(!validation.valid&&!roomConflictOnly(validation))throw Error(validation.errors.join(' '));
 let allowSameRoom=false;
 if(roomConflictOnly(validation)){
  if(!window.RestoSharedReservations)throw Error('Le passage d’un second occupant doit être validé sur le service connecté.');
  allowSameRoom=await window.RestoDialog.confirm(
   'La chambre '+String($('walkinRoom').value).trim()+' possède déjà une réservation sur ce créneau.\n\nConfirmez uniquement s’il s’agit d’une AUTRE personne qui souhaite dîner séparément, à '+best.label+'.\n\nSi c’est le même client, retrouvez sa réservation existante.',
   {title:'Autre occupant de la même chambre',acceptLabel:'Installer cet autre occupant'});
  if(!allowSameRoom){$('walkinFeedback').textContent='Installation annulée : la réservation existante a été conservée.';return}
 }
 if(window.RestoSharedReservations){
 await window.RestoInstallWalkin(r,{allowSameRoom});
}else{
 localStorage.setItem(KEY,JSON.stringify(all.concat(r)));if(!load().some(item=>item.id===r.id))throw Error('Enregistrement non confirmé. Vérifiez le service avant de réessayer.');}window.dispatchEvent(new Event('restomanager:v3-change'));const msg='Installation réussie · '+best.label+' · '+r.guests+' personne(s) · '+(r.type==='hotel'?'Hôtel':'Extérieur');$('walkinFeedback').textContent='✓ '+msg;showInstallNotice(msg);$('walkinRoom').value='';refresh()}catch(err){const msg='Installation impossible : '+err.message;$('walkinFeedback').textContent=msg;showInstallNotice(msg,true)}finally{installing=false;refresh()}});
window.addEventListener('restomanager:v3-change',refresh);window.addEventListener('restomanager:connection-state',refresh);window.addEventListener('storage',e=>{if(e.key===KEY)refresh()});window.addEventListener('focus',refresh);setInterval(refresh,30000);refresh();
})();