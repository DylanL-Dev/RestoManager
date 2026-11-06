'use strict';
(function(){
const KEY='restomanager_v3_fusion_pairs',form=document.getElementById('fusionForm');
if(!form)return;
const list=document.getElementById('fusionList'),msg=document.getElementById('fusionMessage'),picker=document.getElementById('fusionPicker'),selected=document.getElementById('fusionSelected'),submit=document.getElementById('fusionSubmit'),cancel=document.getElementById('fusionCancel');
let editing=null,chosen=[];
const key=p=>p.slice().sort((a,b)=>a-b).join(':');
function read(){if(window.RestoSharedReservations)return window.RestoFusionLinks||[];try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function valid(){const tables=TableStore.get().tables;return read().filter(p=>Array.isArray(p)&&p.length>=2&&new Set(p).size===p.length&&p.every(n=>tables.some(t=>t.number===n))&&p.every(n=>tables.find(t=>t.number===n).roomId===tables.find(t=>t.number===p[0]).roomId))}
function groups(){
 const links=valid();
 if(!window.RestoSharedReservations)return links;
 const all=new Map(links.map(pair=>[key(pair),pair.slice().sort((a,b)=>a-b)]));
 for(const left of links)for(const right of links){
  if(!left.some(n=>right.includes(n)))continue;
  const group=[...new Set([...left,...right])].sort((a,b)=>a-b);
  if(group.length===3)all.set(key(group),group);
 }
 return [...all.values()];
}
async function save(oldPair,newPair){
 if(window.RestoSharedReservations){
  try{await window.RestoChangeFusion(oldPair,newPair);return true}
  catch(error){msg.textContent=error.message;return false}
 }
 const pairs=read().filter(p=>!oldPair||key(p)!==key(oldPair));
 if(newPair)pairs.push(newPair);
 store(pairs);return true;
}
function store(pairs){localStorage.setItem(KEY,JSON.stringify(pairs));window.dispatchEvent(new Event('restomanager:v3-fusions'))}
function options(){picker.replaceChildren();for(const t of TableStore.get().tables.slice().sort((a,b)=>a.number-b.number)){const button=document.createElement('button');button.type='button';button.className='fusionPick'+(chosen.includes(t.number)?' active':'');button.textContent='Table '+t.number+' · '+t.capacity+' places'+(chosen.includes(t.number)?' ✓':'');button.setAttribute('aria-pressed',String(chosen.includes(t.number)));button.onclick=()=>{chosen=chosen.includes(t.number)?chosen.filter(n=>n!==t.number):[...chosen,t.number];options()};picker.append(button)}const tables=TableStore.get().tables;const capacity=chosen.reduce((sum,n)=>sum+(tables.find(t=>t.number===n)?.capacity||0),0);selected.textContent=chosen.length?chosen.length+' tables sélectionnées · '+capacity+' places au total':'Sélectionnez au moins deux tables';submit.textContent=editing?'Enregistrer la modification':'Autoriser cette fusion'}
function reset(){editing=null;chosen=[];cancel.hidden=true;options()}
function render(){list.replaceChildren();const pairs=valid();if(!pairs.length){const p=document.createElement('p');p.textContent='Aucune fusion configurée.';list.append(p)}for(const pair of pairs){const row=document.createElement('div');row.className='fusionRow';const info=document.createElement('strong');const capacity=pair.reduce((sum,n)=>sum+(TableStore.get().tables.find(t=>t.number===n)?.capacity||0),0);info.textContent='Tables '+pair.join(' + ')+' · '+capacity+' places';const actions=document.createElement('div');actions.className='fusionRowActions';const edit=document.createElement('button');edit.type='button';edit.textContent='Modifier';edit.onclick=()=>{editing=key(pair);chosen=pair.slice();cancel.hidden=false;options();form.scrollIntoView({behavior:'smooth',block:'center'})};const remove=document.createElement('button');remove.type='button';remove.textContent='Retirer';remove.onclick=async()=>{if(!await window.RestoDialog.confirm('Retirer cette fusion autorisée ?',{title:'Retirer la fusion',danger:true,acceptLabel:'Retirer'}))return;if(!await save(pair,null))return;if(editing===key(pair))reset();render()};actions.append(edit,remove);row.append(info,actions);list.append(row)}}
form.addEventListener('submit',async e=>{e.preventDefault();const tables=TableStore.get().tables,pair=chosen.slice().sort((a,b)=>a-b);if(window.RestoSharedReservations&&pair.length!==2){msg.textContent='Sélectionnez deux tables voisines par association.';return}if(pair.length<2){msg.textContent='Sélectionnez au moins deux tables.';return}const rooms=pair.map(n=>tables.find(t=>t.number===n)?.roomId);if(rooms.some(r=>r!==rooms[0])){msg.textContent='Toutes les tables doivent être dans la même salle.';return}const existing=valid().filter(p=>key(p)!==editing);if(existing.some(p=>key(p)===key(pair))){msg.textContent='Cette fusion existe déjà.';return}if(!await save(editing?editing.split(':').map(Number):null,pair))return;msg.textContent='Fusion enregistrée : tables '+pair.join(' + ')+'.';reset();render()});
cancel.onclick=reset;window.addEventListener('restomanager:v3-tables',()=>{if(!window.RestoSharedReservations)reset();options();render()});window.RestoFusion={pairs:groups};reset();render();
})();