'use strict';
(function(){
const KEY='restomanager_reservations',host=document.getElementById('passages');if(!host||!window.ReservationEngine)return;
const section=document.createElement('section');section.className='quickReleasePanel';
section.innerHTML='<div class="quickReleaseHeader"><div><h2><i data-lucide="utensils"></i> Tables occupées <span id="quickReleaseCount"></span></h2><p>Consultez les heures prévues et libérez la table après le départ des clients.</p></div></div><div class="quickReleaseTools"><label>Rechercher <input id="quickReleaseSearch" type="search" placeholder="Chambre, nom, table…" autocomplete="off"></label><label>Trier par <select id="quickReleaseSort"><option value="table">Table croissante</option><option value="room">Chambre croissante</option><option value="name">Nom A → Z</option><option value="time">Installation ancienne</option></select></label></div><div id="quickReleaseUndo" role="status" aria-live="polite"></div><div id="quickReleaseList" class="quickReleaseList"></div><p id="quickReleaseFeedback" role="status" aria-live="polite"></p>';
host.parentNode.insertBefore(section,host);
const $=id=>document.getElementById(id),collator=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
function read(){if(window.RestoSharedReservations)return ReservationEngine.normalizeReservations(window.RestoSharedReservations);try{return ReservationEngine.normalizeReservations(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch{return []}}
function serviceDay(){const d=new Date();if(d.getHours()<1)d.setDate(d.getDate()-1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
let lastUndo=null;
const pendingReleases=new Set();
const connectedService=()=>Boolean(document.getElementById('integrationGate'));
const canRelease=()=>!connectedService()||window.RestoSupabaseReady===true;
function room(r){return String(r.hotelRoom||r.room||r.roomNumber||r.chambre||r.chambreNumber||'').trim()}
function el(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!=null)e.textContent=content;return e}
function render(){
 const q=$('quickReleaseSearch').value.trim().toLocaleLowerCase('fr'),sort=$('quickReleaseSort').value;
 const list=read().filter(r=>r.status==='seated'&&r.date===serviceDay());
 list.sort((a,b)=>sort==='room'?collator.compare(room(a)||'999999',room(b)||'999999')||collator.compare(a.client,b.client):sort==='name'?collator.compare(a.client,b.client):sort==='time'?collator.compare(a.seatedAt||a.time,b.seatedAt||b.time):collator.compare(String((a.tables||[])[0]||''),String((b.tables||[])[0]||'')));
 $('quickReleaseCount').textContent=list.length;
 const container=$('quickReleaseList');container.replaceChildren();
 const shown=list.filter(r=>[r.client,room(r),(r.tables||[]).join(' '),r.time].join(' ').toLocaleLowerCase('fr').includes(q));
 if(!shown.length){container.append(el('p','quickReleaseEmpty',list.length?'Aucun client ne correspond à la recherche.':'Aucune table occupée actuellement.'));return}
 for(const r of shown){
  const row=el('article','quickReleaseRow'),info=el('div','quickReleaseInfo'),top=el('strong','', 'Table '+(r.tables||[]).join(' + ')),sub=el('span','',r.client+(room(r)?' · Chambre '+room(r):'')+' · '+r.guests+' pers. · '+r.time);
  const start=r.seatedAt?new Date(r.seatedAt):new Date(r.date+'T'+r.time+':00');
  const validStart=!Number.isNaN(start.getTime());
  const mins=Number(r.duration)||ReservationEngine.getDefaultDuration();
  const end=validStart?new Date(start.getTime()+mins*60000):null;
  const format=d=>d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const timing=el('span','quickReleaseTiming',validStart?'Installés à '+format(start)+' · Fin prévue '+format(end):'Horaire à vérifier');
  const overdue=end&&Date.now()>end.getTime();
  const state=el('span','quickReleaseStatus '+(overdue?'quickReleaseStatusOverdue':'quickReleaseStatusOccupied'),overdue?'Fin prévue dépassée':'Occupée');
  info.append(top,sub,timing,state);const btn=el('button','quickReleaseButton','Libérer');btn.type='button';btn.setAttribute('aria-label','Libérer la table '+(r.tables||[]).join(' et ')+' de '+r.client);
  btn.disabled=pendingReleases.has(r.id)||!canRelease();
  if(!canRelease())btn.title='Synchronisation indisponible : libération momentanément bloquée';
  btn.addEventListener('click',()=>release(r.id));
  const edit=el('button','quickReleaseEdit','Modifier');edit.type='button';edit.setAttribute('aria-label','Modifier la table et la durée de '+r.client);
  edit.addEventListener('click',()=>openQuickEdit(r.id));
  const actions=el('div','quickReleaseActions');if(!window.RestoSharedReservations)actions.append(edit);actions.append(btn);row.append(info,actions);container.append(row);
 }
}

function openQuickEdit(id){
 const current=read().find(r=>r.id===id&&r.status==='seated');if(!current)return;
 document.getElementById('quickEditOverlay')?.remove();
 const overlay=el('div','quickEditOverlay'),panel=el('section','quickEditPanel');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Modifier la table et la durée');
 const heading=el('h2','','Modifier l’installation');
 const subtitle=el('p','',current.client+' · '+current.guests+' personne(s)');
 const tableLabel=el('label','','Table');const tableSelect=el('select');
 const plan=TableStore.get();for(const t of plan.tables){const option=el('option','', 'Table '+t.number+' · '+t.capacity+' places');option.value=String(t.number);tableSelect.append(option)}
 if(current.tables.length===1)tableSelect.value=String(current.tables[0]);
 else{const option=el('option','','Fusion actuelle : '+current.tables.join(' + '));option.value=current.tables.join(',');tableSelect.prepend(option);tableSelect.value=option.value}
 tableLabel.append(tableSelect);
 const durationLabel=el('label','','Durée prévue');const durationSelect=el('select');
 for(const mins of [30,45,60,75,90,105,120,150,180]){const option=el('option','',mins%60?Math.floor(mins/60)+' h '+String(mins%60).padStart(2,'0'):mins/60+' h');option.value=String(mins);durationSelect.append(option)}
 if(![30,45,60,75,90,105,120,150,180].includes(Number(current.duration))){const option=el('option','',current.duration+' min (actuelle)');option.value=String(current.duration);durationSelect.append(option)}
 durationSelect.value=String(current.duration);
 durationLabel.append(durationSelect);
 const hint=el('p','quickEditHint');const start=current.seatedAt?new Date(current.seatedAt):null;
 function preview(){if(start&&!Number.isNaN(start.getTime())){const end=new Date(start.getTime()+Number(durationSelect.value)*60000);hint.textContent='Fin prévue : '+end.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+' · La table reste occupée jusqu’à sa libération.'}else hint.textContent='La table reste occupée jusqu’à sa libération.'}
 durationSelect.addEventListener('change',preview);preview();
 const error=el('p','quickEditError');error.setAttribute('role','alert');
 const controls=el('div','quickEditControls'),cancel=el('button','','Annuler'),save=el('button','','Enregistrer');
 cancel.type='button';save.type='button';save.className='quickEditSave';
 function close(){overlay.remove()}
 cancel.addEventListener('click',close);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 save.addEventListener('click',()=>{
  const all=read(),index=all.findIndex(r=>r.id===id&&r.status==='seated');if(index<0){error.textContent='Installation introuvable.';return}
  const previous=all[index],tables=tableSelect.value.split(',').map(Number),duration=Number(durationSelect.value);
  const candidate={...previous,tables,duration};
  const capacity=tables.reduce((n,number)=>n+(plan.tables.find(t=>t.number===number)?.capacity||0),0);
  if(capacity<previous.guests){error.textContent='Capacité insuffisante pour '+previous.guests+' personne(s).';return}
  const validation=ReservationEngine.validate(candidate,all,id);
  if(!validation.valid){error.textContent=validation.errors.join(' ');return}
  const occupied=all.find(r=>r.id!==id&&r.status==='seated'&&r.date===candidate.date&&r.tables.some(t=>tables.includes(t)));
  if(occupied){error.textContent='Cette table est encore occupée par '+occupied.client+'.';return}
  all[index]=candidate;
  try{localStorage.setItem(KEY,JSON.stringify(all))}catch(e){error.textContent='Enregistrement impossible : '+e.message;return}
  close();$('quickReleaseFeedback').textContent='✓ Table et durée mises à jour pour '+previous.client+'.';window.dispatchEvent(new Event('restomanager:v3-change'));render();
 });
 controls.append(cancel,save);panel.append(heading,subtitle,tableLabel,durationLabel,hint,error,controls);overlay.append(panel);document.body.append(overlay);tableSelect.focus();
}
async function release(id){
 if(pendingReleases.has(id))return;
 if(!canRelease()){$('quickReleaseFeedback').textContent='Synchronisation indisponible. Attendez la reconnexion avant de libérer cette table.';render();return}
 pendingReleases.add(id);render();
 try{
 const all=read(),index=all.findIndex(r=>r.id===id&&r.status==='seated'&&r.date===serviceDay());if(index<0){render();return}
 const previous=all[index],transition=ReservationEngine.transition(previous,'released',new Date().toISOString(),all);
 if(!transition.valid){$('quickReleaseFeedback').textContent=transition.error;return}
 if(window.RestoSharedReservations){
  try{
   await window.RestoChangeSharedStatus(previous,'released');
   $('quickReleaseFeedback').textContent='Table '+previous.tables.join(' + ')+' libérée.';
  }catch(error){$('quickReleaseFeedback').textContent=error.message}
  return;
 }
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
 }finally{pendingReleases.delete(id);render();}
}
$('quickReleaseSearch').addEventListener('input',render);$('quickReleaseSort').addEventListener('change',render);
window.addEventListener('restomanager:v3-change',render);window.addEventListener('restomanager:connection-state',render);window.addEventListener('storage',event=>{if(event.key===KEY)render()});render();
})();