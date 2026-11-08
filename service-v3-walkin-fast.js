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

function draft(table){return {id:'walkin-preview',type:document.querySelector('input[name="walkinType"]:checked')?.value==='exterieur'?'exterieur':'hotel',client:$('walkinRoom').value.trim()||'Client de passage',...stamp(),guests:Number($('walkinGuests').value),duration:E.getDefaultDuration(),tables:Array.isArray(table)?table:[table],status:'seated',walkIn:true}}
function choices(all){const n=Number($('walkinGuests').value);if(!Number.isInteger(n)||n<1)return [];return E.rankedTableChoices(TableStore.get().tables,window.RestoFusion?.pairs()||[],n)
 .filter(c=>!all.some(r=>r.status==='seated'&&r.tables.some(t=>c.numbers.includes(t))))
 .filter(c=>{
  const r=draft(c.numbers),span=window.RestoBookingInterval?.(r.date,r.time,r.duration);
  return !(span&&window.RestoBookingDraft.occupied(c.numbers,...span).length)&&E.validate(r,all).valid;
 })}

function noAvailabilityReason(all){const tables=TableStore.get().tables;const n=Number($('walkinGuests').value);const suitable=tables.filter(t=>n>=Number(t.capacityMin||1)&&n<=Number(t.capacity));const result=E.validate(draft(suitable[0]?.number||1),all);const hours=result.errors.find(e=>e.includes('Horaire hors des services'));if(hours)return 'Service fermé à cette heure. Vérifiez les horaires du midi et du soir dans Gestion du restaurant.';return 'Aucune table libre pour '+n+' personne(s) à cette heure. Vérifiez les réservations et les tables occupées.'}
function refresh(){updateGuestControls();try{const available=choices(load()),sel=$('walkinTable'),best=(sel.dataset.manual===String($('walkinGuests').value)&&available.find(c=>c.value===sel.value))||available[0];sel.replaceChildren();for(const t of available){const o=document.createElement('option');o.value=t.value;o.textContent=t.label+' · '+t.capacity+' places';sel.append(o)}if(best)sel.value=best.value;window.RestoTableChoices?.refresh('walkinTable');$('walkinRecommendation').textContent=best?'✓ '+best.label+' disponible · '+best.capacity+' places':noAvailabilityReason(load());$('walkinForm').querySelector('button[type=submit]').disabled=installing||!best;document.querySelectorAll('[data-walkin-pax]').forEach(b=>b.classList.toggle('selected',b.dataset.walkinPax===$('walkinGuests').value))}catch(e){$('walkinRecommendation').textContent='Disponibilités indisponibles : '+e.message;$('walkinForm').querySelector('button[type=submit]').disabled=true}}
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
$('walkinForm').addEventListener('submit',async e=>{e.preventDefault();if(installing)return;installing=true;const submit=$('walkinForm').querySelector('button[type=submit]');submit.disabled=true;try{const all=load(),best=choices(all).find(c=>c.value===$('walkinTable').value);if(!best)throw Error('Aucune table disponible.');const r={...draft(best.numbers),id:'walkin-'+Date.now()+'-'+Math.random().toString(36).slice(2),seatedAt:now().toISOString(),createdAt:now().toISOString()};const validation=E.validate(r,all);if(!validation.valid)throw Error(validation.errors.join(' '));if(window.RestoSharedReservations){
 await window.RestoInstallWalkin(r);
}else{
 localStorage.setItem(KEY,JSON.stringify(all.concat(r)));if(!load().some(item=>item.id===r.id))throw Error('Enregistrement non confirmé. Vérifiez le service avant de réessayer.');}window.dispatchEvent(new Event('restomanager:v3-change'));const msg='Installation réussie · '+best.label+' · '+r.guests+' personne(s) · '+(r.type==='hotel'?'Hôtel':'Extérieur');$('walkinFeedback').textContent='✓ '+msg;showInstallNotice(msg);$('walkinRoom').value='';refresh()}catch(err){const msg='Installation impossible : '+err.message;$('walkinFeedback').textContent=msg;showInstallNotice(msg,true)}finally{installing=false;refresh()}});
window.addEventListener('restomanager:v3-change',refresh);window.addEventListener('storage',e=>{if(e.key===KEY)refresh()});window.addEventListener('focus',refresh);setInterval(refresh,30000);refresh();
})();