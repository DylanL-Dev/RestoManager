'use strict';
(function(){
const form=document.getElementById('fusionForm');if(!form)return;
const KEY='restomanager_v3_fusion_pairs';
const list=document.getElementById('fusionList'),msg=document.getElementById('fusionMessage'),picker=document.getElementById('fusionPicker'),selected=document.getElementById('fusionSelected'),submit=document.getElementById('fusionSubmit'),cancel=document.getElementById('fusionCancel');
let chosen=[],editing=null,busy=false;
const key=p=>p.slice().sort((a,b)=>a-b).join(':');
const table=n=>TableStore.get().tables.find(t=>t.number===Number(n));
const room=n=>table(n)?.roomId;
const capacity=p=>p.reduce((sum,n)=>sum+(Number(table(n)?.capacity)||0),0);
const icon=(name)=>{const el=document.createElement('i');el.dataset.lucide=name;el.setAttribute('aria-hidden','true');return el;};
function read(){if(window.RestoSharedReservations)return window.RestoFusionLinks||[];try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function valid(){return read().filter(p=>Array.isArray(p)&&p.length===2&&new Set(p).size===2&&p.every(n=>table(n))&&room(p[0])===room(p[1]))}
function groups(){
 const links=valid();if(!window.RestoSharedReservations)return links;
 const all=new Map(),adj=new Map();let frontier=[];
 for(const pair of links){const id=key(pair);all.set(id,pair.slice().sort((a,b)=>a-b));frontier.push(pair.slice().sort((a,b)=>a-b));for(const [a,b] of [[pair[0],pair[1]],[pair[1],pair[0]]]){if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(b)}}
 for(let size=2;size<4;size++){const next=[];for(const group of frontier){for(const n of new Set(group.flatMap(x=>[...(adj.get(x)||[])]))){if(group.includes(n))continue;const expanded=[...group,n].sort((a,b)=>a-b),id=key(expanded);if(!all.has(id)){all.set(id,expanded);next.push(expanded)}}}frontier=next}
 return [...all.values()];
}
function store(pairs){localStorage.setItem(KEY,JSON.stringify(pairs));window.dispatchEvent(new Event('restomanager:v3-fusions'))}
async function change(oldPair,newPair){
 if(window.RestoSharedReservations){await window.RestoChangeFusion(oldPair,newPair);return}
 const result=read().filter(p=>!oldPair||key(p)!==key(oldPair));if(newPair)result.push(newPair);store(result);
}
async function createChain(numbers){
 if(window.RestoSharedReservations){return window.RestoCreateFusionChain(numbers)}
 const links=read().slice();
 for(let i=1;i<numbers.length;i++){const pair=[numbers[i-1],numbers[i]];if(!links.some(p=>key(p)===key(pair)))links.push(pair)}
 store(links);return numbers.length-1;
}
const intro=document.querySelector('.fusionAdmin>p');
if(intro)intro.textContent='Choisissez 2, 3 ou 4 tables physiquement voisines : RestoManager créera automatiquement les associations nécessaires.';
form.classList.add('rmFusionBuilder');
const headline=document.createElement('div');headline.className='rmFusionBuilderHeader';
headline.innerHTML='<strong>1. Sélectionnez les tables</strong><span>2 à 4 tables de la même salle, dans leur ordre physique</span>';
form.insertBefore(headline,selected);
const preview=document.createElement('section');preview.className='rmFusionPreview';preview.setAttribute('aria-live','polite');
form.insertBefore(preview,submit);
const associated=document.createElement('section');associated.className='rmFusionDerived';associated.innerHTML='<h4>Groupes disponibles dans Passage</h4><div class="rmFusionDerivedList"></div><p>Ces groupes sont calculés à partir des associations enregistrées. Pour les modifier, gérez les associations ci-dessous.</p>';
list.before(associated);
const note=document.createElement('p');note.className='rmFusionSafety';note.textContent='Important : l’application ne connaît pas la position physique des tables. Sélectionnez-les dans l’ordre où elles peuvent réellement être rapprochées.';
form.insertBefore(note,preview);
const roomNames=()=>TableStore.get().rooms||[];
function options(){
 const tables=TableStore.get().tables.slice().sort((a,b)=>a.number-b.number);
 const chosenRoom=chosen.length?room(chosen[0]):null;
 picker.replaceChildren();
 for(const t of tables){
  if(t.active===false)continue;
  const picked=chosen.includes(t.number),otherRoom=chosenRoom&&t.roomId!==chosenRoom;
  const btn=document.createElement('button');btn.type='button';btn.className='rmFusionTableCard'+(picked?' isSelected':'');
  btn.setAttribute('aria-pressed',String(picked));btn.disabled=busy||Boolean(otherRoom)||(!picked&&chosen.length>=4);
  btn.append(icon('table-2'));
  const title=document.createElement('strong');title.textContent='Table '+t.number;
  const count=document.createElement('span');count.textContent=t.capacity+' place'+(t.capacity>1?'s':'');
  const order=document.createElement('span');order.className='rmFusionCardCheck';order.textContent=picked?String(chosen.indexOf(t.number)+1):'○';
  btn.append(title,count,order);
  btn.addEventListener('click',()=>{if(picked)chosen=chosen.filter(n=>n!==t.number);else chosen.push(t.number);msg.textContent='';options()});
  picker.append(btn);
 }
 selected.textContent=chosen.length?chosen.length+' table'+(chosen.length>1?'s':'')+' sélectionnée'+(chosen.length>1?'s':'')+' · '+capacity(chosen)+' places':'Choisissez les tables à réunir';
 const size=chosen.length,validSelection=size>=2&&size<=4&&chosen.every(n=>room(n)===room(chosen[0]));
 preview.replaceChildren();
 const heading=document.createElement('strong');heading.textContent=size>=2?'Fusion de '+size+' tables — '+capacity(chosen)+' places':'Aperçu de votre fusion';preview.append(heading);
 const numbers=document.createElement('div');numbers.className='rmFusionPreviewNumbers';numbers.textContent=size?chosen.join('  +  '):'Sélectionnez 2 à 4 tables';preview.append(numbers);
 const checks=document.createElement('p');checks.textContent=validSelection?'✓ Même salle · ✓ Capacité : '+capacity(chosen)+' places · ✓ Associations : '+(size-1):'Sélectionnez au moins deux tables de la même salle.';preview.append(checks);
 if(validSelection){const links=document.createElement('p');links.className='rmFusionPreviewLinks';links.textContent='Liens créés ou conservés : '+chosen.slice(1).map((n,i)=>chosen[i]+' + '+n).join('  ·  ');preview.append(links)}
 const hall=roomNames().find(r=>r.id===chosenRoom)?.name;
 if(hall){const label=document.createElement('small');label.textContent='Salle : '+hall;preview.append(label)}
 submit.disabled=busy||!validSelection;submit.textContent=busy?'Enregistrement…':editing?'Enregistrer la modification':'Créer cette fusion';
 cancel.hidden=editing===null&&!chosen.length;
 window.lucide?.createIcons?.();
}
function reset(){editing=null;chosen=[];busy=false;options()}
function render(){
 list.replaceChildren();
 const pairs=valid();
 const groupList=associated.querySelector('.rmFusionDerivedList');groupList.replaceChildren();
 const derived=groups().filter(g=>g.length>=3).sort((a,b)=>a.length-b.length||a[0]-b[0]);
 if(!derived.length){const p=document.createElement('p');p.textContent='Aucun groupe de 3 ou 4 tables disponible.';groupList.append(p)}
 for(const group of derived){const chip=document.createElement('span');chip.className='rmFusionGroupChip';chip.textContent=group.join(' + ')+' · '+capacity(group)+' places';groupList.append(chip)}
 if(!pairs.length){const p=document.createElement('p');p.textContent='Aucune association autorisée.';list.append(p)}
 for(const pair of pairs){
  const row=document.createElement('div');row.className='fusionRow rmFusionLinkRow';
  const info=document.createElement('span');info.className='rmFusionLinkInfo';info.append(icon('link-2'));
  const caption=document.createElement('strong');caption.textContent=pair.join(' + ')+' · '+capacity(pair)+' places';info.append(caption);
  const actions=document.createElement('div');actions.className='fusionRowActions';
  const edit=document.createElement('button');edit.type='button';edit.append(icon('pencil'),document.createTextNode(' Modifier'));
  edit.onclick=()=>{editing=pair.slice();chosen=pair.slice();options();form.scrollIntoView({behavior:'smooth',block:'center'})};
  const remove=document.createElement('button');remove.type='button';remove.append(icon('trash-2'),document.createTextNode(' Retirer'));
  remove.onclick=async()=>{
   if(busy)return;
   if(!await window.RestoDialog.confirm('Retirer l’association '+pair.join(' + ')+' ? Les groupes qui l’utilisent pourront devenir indisponibles.',{title:'Retirer une association',danger:true,acceptLabel:'Retirer'}))return;
   busy=true;options();
   try{await change(pair,null);msg.textContent='Association retirée.';reset();render()}
   catch(e){msg.textContent=window.RestoErrors?.message(e,'Retrait impossible. Actualisez puis réessayez.')||e.message}
   finally{busy=false;options()}
  };
  actions.append(edit,remove);row.append(info,actions);list.append(row);
 }
 window.lucide?.createIcons?.();
}
form.addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 const sequence=chosen.slice(),sameRoom=sequence.every(n=>room(n)===room(sequence[0]));
 if(sequence.length<2||sequence.length>4||!sameRoom){msg.textContent='Sélectionnez de 2 à 4 tables de la même salle.';return}
 if(!await window.RestoDialog.confirm('Confirmez que les tables '+sequence.join(' + ')+' sont physiquement voisines et peuvent être rapprochées dans cet ordre.\n\nRestoManager enregistrera les '+(sequence.length-1)+' associations nécessaires en une seule opération.',{title:'Créer cette fusion',acceptLabel:'Confirmer la fusion'}))return;
 busy=true;options();
 try{
  if(editing){
   if(sequence.length!==2)throw Error('La modification d’une association existante concerne exactement 2 tables.');
   if(key(editing)!==key(sequence))await change(editing,sequence);
  }else await createChain(sequence);
  msg.textContent='Fusion enregistrée : '+sequence.join(' + ')+' · '+capacity(sequence)+' places.';
  reset();render();
 }catch(e){window.RestoErrors?.diagnostic('save-fusion-chain',e);msg.textContent=window.RestoErrors?.message(e,'Enregistrement impossible : aucune fusion partielle ne doit être conservée.')||e.message}
 finally{busy=false;options()}
});
cancel.addEventListener('click',reset);
for(const event of ['restomanager:v3-tables','restomanager:supabase-snapshot'])window.addEventListener(event,()=>{options();render()});
window.RestoFusion={pairs:groups};
reset();render();
})();