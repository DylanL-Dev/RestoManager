'use strict';
(function(){
const KEY='restomanager_reservations',host=document.getElementById('passages');if(!host||!window.ReservationEngine)return;
const section=document.createElement('section');section.className='quickReleasePanel';
section.innerHTML='<div class="quickReleaseHeader"><div><h2><i data-lucide="users"></i> Clients installés <span id="quickReleaseCount"></span></h2><p>Après facturation, libérez la table ici en un geste.</p></div></div><div class="quickReleaseTools"><label>Rechercher <input id="quickReleaseSearch" type="search" placeholder="Chambre, nom, table…" autocomplete="off"></label><label>Trier par <select id="quickReleaseSort"><option value="table">Table croissante</option><option value="room">Chambre croissante</option><option value="name">Nom A → Z</option><option value="time">Installation ancienne</option></select></label></div><div id="quickReleaseUndo" role="status" aria-live="polite"></div><div id="quickReleaseList" class="quickReleaseList"></div><p id="quickReleaseFeedback" role="status" aria-live="polite"></p>';
host.parentNode.insertBefore(section,host);
const $=id=>document.getElementById(id),collator=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
function read(){try{return ReservationEngine.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch{return []}}
function serviceDay(){const d=new Date();if(d.getHours()<1)d.setDate(d.getDate()-1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
let lastUndo=null;
function room(r){return String(r.room||r.roomNumber||r.chambre||r.chambreNumber||'').trim()}
function el(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!=null)e.textContent=content;return e}
function render(){
 const q=$('quickReleaseSearch').value.trim().toLocaleLowerCase('fr'),sort=$('quickReleaseSort').value;
 const list=read().filter(r=>r.status==='seated'&&r.date===serviceDay());
 list.sort((a,b)=>sort==='room'?collator.compare(room(a)||'999999',room(b)||'999999')||collator.compare(a.client,b.client):sort==='name'?collator.compare(a.client,b.client):sort==='time'?collator.compare(a.seatedAt||a.time,b.seatedAt||b.time):collator.compare(String((a.tables||[])[0]||''),String((b.tables||[])[0]||'')));
 $('quickReleaseCount').textContent=list.length;
 const container=$('quickReleaseList');container.replaceChildren();
 const shown=list.filter(r=>[r.client,room(r),(r.tables||[]).join(' '),r.time].join(' ').toLocaleLowerCase('fr').includes(q));
 if(!shown.length){container.append(el('p','quickReleaseEmpty',list.length?'Aucun client ne correspond à la recherche.':'Aucun client installé actuellement.'));return}
 for(const r of shown){
  const row=el('article','quickReleaseRow'),info=el('div','quickReleaseInfo'),top=el('strong','', 'Table '+(r.tables||[]).join(' + ')),sub=el('span','',r.client+(room(r)?' · Chambre '+room(r):'')+' · '+r.guests+' pers. · '+r.time);
  info.append(top,sub);const btn=el('button','quickReleaseButton','Libérer');btn.type='button';btn.setAttribute('aria-label','Libérer la table '+(r.tables||[]).join(' et ')+' de '+r.client);
  btn.addEventListener('click',()=>release(r.id));row.append(info,btn);container.append(row);
 }
}
function release(id){
 const all=read(),index=all.findIndex(r=>r.id===id&&r.status==='seated'&&r.date===serviceDay());if(index<0){render();return}
 const previous=all[index],transition=ReservationEngine.transition(previous,'released',new Date().toISOString(),all);
 if(!transition.valid){$('quickReleaseFeedback').textContent=transition.error;return}
 all[index]=transition.reservation;
 try{localStorage.setItem(KEY,JSON.stringify(all))}catch(e){$('quickReleaseFeedback').textContent='Enregistrement impossible : '+e.message;return}
 lastUndo={id,previous,releasedAt:transition.reservation.updatedAt};
 const undo=$('quickReleaseUndo');undo.replaceChildren();
 const msg=el('span','','Table '+(previous.tables||[]).join(' + ')+' libérée. ');
 const button=el('button','quickReleaseUndoButton','Annuler');button.type='button';button.addEventListener('click',()=>{
  if(!lastUndo||lastUndo.id!==id)return;
  const current=read(),i=current.findIndex(r=>r.id===id&&r.status==='released'&&r.updatedAt===lastUndo.releasedAt);
  if(i<0){undo.textContent='Annulation impossible : le passage a été modifié.';return}
  const conflict=current.some(r=>r.id!==id&&r.date===lastUndo.previous.date&&r.status==='seated'&&r.tables.some(t=>lastUndo.previous.tables.includes(t)));
  if(conflict){undo.textContent='Impossible : cette table a été réoccupée.';return}
  current[i]=lastUndo.previous;localStorage.setItem(KEY,JSON.stringify(current));lastUndo=null;undo.textContent='Libération annulée.';window.dispatchEvent(new Event('restomanager:v3-change'));render();
 });undo.append(msg,button);
 $('quickReleaseFeedback').textContent='';
 window.dispatchEvent(new Event('restomanager:v3-change'));render();
}
$('quickReleaseSearch').addEventListener('input',render);$('quickReleaseSort').addEventListener('change',render);
window.addEventListener('restomanager:v3-change',render);window.addEventListener('storage',event=>{if(event.key===KEY)render()});render();
})();