'use strict';
(function(){
const root=document.getElementById('serviceClosure');if(!root)return;
// Connected mode: browser-local closure is not a Supabase-wide archive.
if(location.pathname.endsWith('/v3-connected.html')){
 const status=document.getElementById('closureStatus');
 if(status)status.textContent='Clôture partagée en préparation : aucune clôture locale ne sera enregistrée dans cette version connectée.';
 const action=document.getElementById('closureManual');
 if(action){action.disabled=true;action.title='Clôture Supabase indisponible pour le moment';}
 const archive=document.getElementById('closureArchive');
 if(archive)archive.textContent='Les anciennes archives du navigateur ne constituent pas des clôtures Supabase.';
 return;
}
const KEY='restomanager_reservations',CLOSE='restomanager_closures_v1',pad=n=>String(n).padStart(2,'0');
const dateOf=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
const read=()=>ReservationEngine.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'));
const saved=()=>JSON.parse(localStorage.getItem(CLOSE)||'{}');
const closedStatuses=new Set(['completed','released','cancelled','no_show']);
function currentDay(){const d=new Date();if(d.getHours()===0)d.setDate(d.getDate()-1);return dateOf(d)}
function calculate(date){const all=read().filter(r=>r.date===date),served=all.filter(r=>['completed','released'].includes(r.status));return {date,createdAt:new Date().toISOString(),total:served.reduce((n,r)=>n+r.guests,0),passages:served.length,walkin:served.filter(r=>r.walkIn).reduce((n,r)=>n+r.guests,0),hotel:served.filter(r=>r.type==='hotel').reduce((n,r)=>n+r.guests,0),absent:all.filter(r=>r.status==='no_show').length,cancelled:all.filter(r=>r.status==='cancelled').length,pending:all.filter(r=>!closedStatuses.has(r.status)).length}}
function close(date,automatic){const data=saved();if(data[date])return false;const report=calculate(date);if(report.pending)return false;data[date]={...report,mode:automatic?'automatic':'manual'};localStorage.setItem(CLOSE,JSON.stringify(data));return true}
function check(){const now=new Date(),today=dateOf(now),entries=read().map(r=>r.date).filter(d=>d<=today),dates=[...new Set(entries)];if(now.getHours()>23||(now.getHours()===23&&now.getMinutes()>=30))dates.push(today);for(const date of dates){if(date<today||now.getHours()>23||(now.getHours()===23&&now.getMinutes()>=30))close(date,true)}render()}
function render(){const today=currentDay(),data=saved(),live=calculate(today),status=document.getElementById('closureStatus'),history=document.getElementById('closureArchive');status.textContent=data[today]?'Service du '+today+' clôturé ('+(data[today].mode==='manual'?'manuellement':'automatiquement')+').':live.pending?live.pending+' réservation(s) non finalisée(s) : clôture en attente.':'Clôture automatique à 23 h 30, si toutes les réservations sont finalisées.';history.replaceChildren();const dates=Object.keys(data).sort().reverse();for(const d of dates.slice(0,35)){const p=document.createElement('p'),r=data[d];p.textContent=d+' · '+r.total+' couverts · '+r.passages+' passages · '+r.mode;history.append(p)}if(!dates.length)history.textContent='Aucun service clôturé pour le moment.'}
document.getElementById('closureManual').addEventListener('click',async()=>{try{const d=currentDay(),r=calculate(d);if(r.pending){document.getElementById('closureStatus').textContent='Clôture impossible : '+r.pending+' réservation(s) restent à finaliser.';return}if(saved()[d]){render();return}if(!await window.RestoDialog.confirm('Clôturer le service du '+d+' ? Le bilan sera archivé.',{title:'Clôturer le service',acceptLabel:'Clôturer'}))return;close(d,false);render()}catch(e){document.getElementById('closureStatus').textContent=e.message}});
window.addEventListener('restomanager:v3-change',render);window.addEventListener('storage',e=>{if(e.key===KEY||e.key===CLOSE)render()});setInterval(check,60000);check();
})();