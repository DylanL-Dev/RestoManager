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

function draft(table){return {id:'walkin-preview',type:document.querySelector('input[name="walkinType"]:checked')?.value==='exterieur'?'exterieur':'hotel',client:$('walkinRoom').value.trim()||'Client de passage',...stamp(),guests:Number($('walkinGuests').value),duration:E.getDefaultDuration(),tables:[table],status:'seated',walkIn:true}}
function choices(all){const n=Number($('walkinGuests').value);if(!Number.isInteger(n)||n<1)return [];return TableStore.get().tables.filter(t=>n>=Number(t.capacityMin||1)&&n<=Number(t.capacity)).filter(t=>!all.some(r=>r.status==='seated'&&r.tables.includes(t.number))).filter(t=>E.validate(draft(t.number),all).valid).sort((a,b)=>a.capacity-b.capacity||a.number-b.number)}
function noAvailabilityReason(all){const tables=TableStore.get().tables;const n=Number($('walkinGuests').value);const suitable=tables.filter(t=>n>=Number(t.capacityMin||1)&&n<=Number(t.capacity));if(!suitable.length)return 'Aucune table adaptée à '+n+' personne(s) dans le plan de salle.';const result=E.validate(draft(suitable[0].number),all);const hours=result.errors.find(e=>e.includes('Horaire hors des services'));if(hours)return 'Service fermé à cette heure. Vérifiez les horaires du midi et du soir dans Gestion du restaurant.';return 'Aucune table libre pour '+n+' personne(s) à cette heure. Vérifiez les réservations et les tables occupées.'}
function refresh(){try{const available=choices(load()),sel=$('walkinTable'),best=available.find(t=>String(t.number)===sel.value)||available[0];sel.replaceChildren();for(const t of available){const o=document.createElement('option');o.value=t.number;o.textContent='Table '+t.number+' · '+t.capacity+' places';sel.append(o)}if(best)sel.value=String(best.number);window.RestoTableChoices?.refresh('walkinTable');$('walkinRecommendation').textContent=best?'✓ Table '+best.number+' disponible · '+best.capacity+' places':noAvailabilityReason(load());$('walkinForm').querySelector('button[type=submit]').disabled=installing||!best;document.querySelectorAll('[data-walkin-pax]').forEach(b=>b.classList.toggle('selected',b.dataset.walkinPax===$('walkinGuests').value))}catch(e){$('walkinRecommendation').textContent='Disponibilités indisponibles : '+e.message;$('walkinForm').querySelector('button[type=submit]').disabled=true}}
document.querySelectorAll('[data-walkin-pax]').forEach(b=>b.addEventListener('click',()=>{$('walkinGuests').value=b.dataset.walkinPax;refresh()}));
$('walkinGuests').addEventListener('input',refresh);$('walkinRoom').addEventListener('input',refresh);document.querySelectorAll('input[name="walkinType"]').forEach(input=>input.addEventListener('change',refresh));
$('walkinForm').addEventListener('submit',async e=>{e.preventDefault();if(installing)return;installing=true;const submit=$('walkinForm').querySelector('button[type=submit]');submit.disabled=true;try{const all=load(),best=choices(all).find(t=>t.number===Number($('walkinTable').value));if(!best)throw Error('Aucune table disponible.');const r={...draft(best.number),id:'walkin-'+Date.now()+'-'+Math.random().toString(36).slice(2),seatedAt:now().toISOString(),createdAt:now().toISOString()};const validation=E.validate(r,all);if(!validation.valid)throw Error(validation.errors.join(' '));if(window.RestoSharedReservations){
 await window.RestoInstallWalkin(r);
}else{
 localStorage.setItem(KEY,JSON.stringify(all.concat(r)));if(!load().some(item=>item.id===r.id))throw Error('Enregistrement non confirmé. Vérifiez le service avant de réessayer.');}window.dispatchEvent(new Event('restomanager:v3-change'));const msg='Installation réussie · Table '+best.number+' · '+r.guests+' personne(s) · '+(r.type==='hotel'?'Hôtel':'Extérieur');$('walkinFeedback').textContent='✓ '+msg;showInstallNotice(msg);$('walkinRoom').value='';refresh()}catch(err){const msg='Installation impossible : '+err.message;$('walkinFeedback').textContent=msg;showInstallNotice(msg,true)}finally{installing=false;refresh()}});
window.addEventListener('restomanager:v3-change',refresh);window.addEventListener('storage',e=>{if(e.key===KEY)refresh()});window.addEventListener('focus',refresh);setInterval(refresh,30000);refresh();
})();