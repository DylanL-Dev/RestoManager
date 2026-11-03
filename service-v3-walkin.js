'use strict';
(function(){
const $=id=>document.getElementById(id),E=ReservationEngine,KEY='restomanager_reservations';
const time=()=>{const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const date=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
$('walkinTime').value=time();
function load(){return E.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}
function draft(table){return {id:'walkin-preview',type:'exterieur',client:$('walkinName').value.trim()||'Client de passage',date:date(),time:$('walkinTime').value,guests:Number($('walkinGuests').value),duration:Number($('walkinDuration').value),tables:[table],status:'seated',walkIn:true}}
function choices(all){
 const n=Number($('walkinGuests').value),duration=Number($('walkinDuration').value);
 if(!Number.isInteger(n)||n<1||!Number.isInteger(duration)||duration<15)return [];
 return FloorPlan.get().tables.filter(t=>n>=Number(t.capacityMin||1)&&n<=Number(t.capacity)).filter(t=>E.validate(draft(t.number),all).valid).sort((a,b)=>a.capacity-b.capacity||a.number-b.number);
}
function refresh(){
 const sel=$('walkinTable'),old=sel.value;sel.replaceChildren();
 try{
 const matches=choices(load());matches.forEach((t,i)=>{const o=document.createElement('option');o.value=t.number;o.textContent='Table '+t.number+' · '+t.capacity+' places'+(i===0?' · Recommandée':'');sel.append(o)});
 if(matches.some(t=>String(t.number)===old))sel.value=old;
 if(!matches.length){const o=document.createElement('option');o.value='';o.textContent='Aucune table disponible';sel.append(o)}
 const m=$('walkinFeedback');m.textContent=matches.length?matches.length+' table(s) disponible(s) · Meilleure capacité proposée en premier.':'Aucune table compatible à cette heure. Essayez un autre horaire ou une autre durée.';
 }catch(e){$('walkinFeedback').textContent='Erreur de disponibilité : '+e.message}
 if(window.RestoTableChoices)window.RestoTableChoices.refresh('walkinTable');
}
['walkinName','walkinGuests','walkinTime','walkinDuration'].forEach(id=>$(id).addEventListener('input',refresh));
$('walkinForm').addEventListener('submit',e=>{
 e.preventDefault();
 try{
 const all=load(),table=Number($('walkinTable').value);
 if(!table||!choices(all).some(t=>t.number===table))throw Error('Cette table n’est pas disponible.');
 const r={...draft(table),id:'walkin-'+Date.now()+'-'+Math.random().toString(36).slice(2),createdAt:new Date().toISOString()};
 const validation=E.validate(r,load());if(!validation.valid)throw Error(validation.errors.join(' '));
 localStorage.setItem(KEY,JSON.stringify(load().concat(r)));
 $('walkinFeedback').textContent='Client de passage installé à la table '+table+'.';
 $('walkinName').value='';window.dispatchEvent(new Event('restomanager:v3-change'));refresh();
 }catch(err){$('walkinFeedback').textContent='Installation impossible : '+err.message}
});
window.addEventListener('restomanager:v3-change',refresh);
window.addEventListener('storage',e=>{if(e.key===KEY)refresh()});
refresh();
})();