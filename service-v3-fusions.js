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
headline.innerHTML='<strong><span class="rmFusionStepNumber">1</span> Sélectionnez les tables à fusionner</strong><span>Choisissez 2, 3 ou 4 tables voisines de la même salle.</span>';
form.insertBefore(headline,selected);
const preview=document.createElement('section');preview.className='rmFusionPreview';preview.setAttribute('aria-live','polite');
form.insertBefore(preview,submit);
const associated=document.createElement('section');associated.className='rmFusionDerived rmFusionAuthorized';
associated.innerHTML='<h4>Liste des regroupements possibles pour le service</h4><div class="rmFusionGroupFilters" role="group" aria-label="Filtrer les groupes selon leur taille"></div><div class="rmFusionTable"><div class="rmFusionTableHead"><span>Fusion</span><span>Nombre de tables</span><span>Capacité</span><span>Salle</span><span>Statut</span><span>Actions</span></div><div class="rmFusionDerivedList"></div></div><p>Les groupes résultent des associations autorisées ; modifier un lien peut changer plusieurs groupes. Gérez les liens dans la rubrique « Associations configurées ».</p>';
list.before(associated);
const linkDetails=document.createElement('details');linkDetails.className='rmFusionTechnical';
const linkSummary=document.createElement('summary');linkSummary.append(document.createTextNode('Associations configurées entre tables'),icon('chevron-down'));
const linkDescription=document.createElement('p');linkDescription.textContent='Chaque lien relie deux tables voisines. Retirer un lien peut rendre indisponibles plusieurs groupes de 3 ou 4 tables.';
linkDetails.append(linkSummary,linkDescription);list.before(linkDetails);linkDetails.append(list);
let selectedGroupSize=0;
const note=document.createElement('p');note.className='rmFusionSafety';note.textContent='Important : l’application ne connaît pas la position physique des tables. Sélectionnez-les dans l’ordre où elles peuvent réellement être rapprochées.';
form.insertBefore(note,preview);
const roomNames=()=>TableStore.get().rooms||[];
const decorate=(element,graphic,label)=>{element.append(icon(graphic),document.createTextNode(label));return element};
const element=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el};
const primaryTitle=document.querySelector('.fusionAdmin>h3');
if(primaryTitle){primaryTitle.classList.add('rmFusionPageTitle');primaryTitle.prepend(icon('link-2'))}
const stage=element('nav','rmFusionSteps');stage.setAttribute('aria-label','Étapes pour créer une fusion');
for(const [number,text] of [['1','Choisir les tables'],['2','Vérifier la fusion'],['3','Créer']]){
 const item=element('div','rmFusionStep');
 item.append(element('span','rmFusionStepNumber',number),element('span','rmFusionStepLabel',text));stage.append(item);
}
intro?.after(stage);
const roomFilter=element('label','rmFusionRoomFilter');
roomFilter.append(icon('map-pin'),element('span','', 'Salle : '));
const roomSelect=document.createElement('select');roomSelect.id='rmFusionRoomSelect';roomSelect.setAttribute('aria-label','Filtrer les tables par salle');
roomFilter.append(roomSelect);headline.append(roomFilter);
roomSelect.addEventListener('change',()=>{chosen=[];editing=null;options()});
const configureHint=element('p','rmFusionLegend');
configureHint.append(icon('info'),document.createTextNode('Appuyez sur les cartes dans l’ordre où les tables se touchent. Les numéros indiquent l’ordre choisi.'));
headline.after(configureHint);
const displayGroups=element('div','rmFusionGroupsHeading');displayGroups.append(icon('layers'),element('strong','', 'Fusions autorisées'));
const groupBadge=element('span','rmFusionGroupCount','0 regroupement');displayGroups.append(groupBadge);
associated.prepend(displayGroups);
function updateRooms(){
 const selectedRoom=roomSelect.value;
 const rooms=roomNames().filter(r=>r.active!==false);
 roomSelect.replaceChildren();
 const all=document.createElement('option');all.value='';all.textContent='Toutes les salles';roomSelect.append(all);
 for(const r of rooms){const option=document.createElement('option');option.value=r.id;option.textContent=r.name;roomSelect.append(option)}
 roomSelect.value=rooms.some(r=>String(r.id)===selectedRoom)?selectedRoom:'';
}
const repaintIcons=()=>document.dispatchEvent(new Event('restomanager:icons-refresh'));
function options(){
 const tables=TableStore.get().tables.slice().sort((a,b)=>a.number-b.number);
 updateRooms();
 const chosenRoom=chosen.length?room(chosen[0]):null;
 picker.replaceChildren();
 for(const t of tables){
  if(t.active===false||(roomSelect.value&&String(t.roomId)!==roomSelect.value))continue;
  const picked=chosen.includes(t.number),otherRoom=chosenRoom&&t.roomId!==chosenRoom;
  const btn=document.createElement('button');btn.type='button';btn.className='rmFusionTableCard'+(picked?' isSelected':'');
  btn.setAttribute('aria-pressed',String(picked));btn.disabled=busy||Boolean(otherRoom)||(!picked&&chosen.length>=4);
  btn.append(icon('armchair'));
  const title=document.createElement('strong');title.textContent='Table '+t.number;
  const count=document.createElement('span');count.className='rmFusionSeatCount';count.append(icon('users'),document.createTextNode(' '+t.capacity+' place'+(t.capacity>1?'s':'')));
  const order=document.createElement('span');order.className='rmFusionCardCheck';if(picked)order.append(icon('check'),document.createTextNode(String(chosen.indexOf(t.number)+1)));else order.append(icon('circle-dot'));
  btn.append(title,count,order);
  btn.addEventListener('click',()=>{if(picked)chosen=chosen.filter(n=>n!==t.number);else chosen.push(t.number);msg.textContent='';options()});
  picker.append(btn);
 }
 selected.textContent=chosen.length?chosen.length+' table'+(chosen.length>1?'s':'')+' sélectionnée'+(chosen.length>1?'s':'')+' · '+capacity(chosen)+' places':'Choisissez les tables à réunir';
 const size=chosen.length,validSelection=size>=2&&size<=4&&chosen.every(n=>room(n)===room(chosen[0]));
 preview.replaceChildren();
 const caption=element('div','rmFusionPreviewCaption');caption.append(element('span','rmFusionStepNumber','2'),element('strong','', 'Aperçu de la fusion'));preview.append(caption);
 const heading=element('strong','rmFusionPreviewTitle',size>=2?'Fusion de '+size+' tables — '+capacity(chosen)+' places':'Choisissez 2 à 4 tables');preview.append(heading);
 const numbers=element('div','rmFusionPreviewNumbers',size?chosen.join('  +  '):'Aucune table sélectionnée');preview.append(numbers);
 const illustration=element('div','rmFusionPreviewIllustration');illustration.setAttribute('aria-label',size?'Disposition prévue : '+chosen.join(' puis '):'Aperçu des tables');
 for(const [i,n] of chosen.entries()){
  if(i)illustration.append(element('span','rmFusionJoin','+'));
  const pictured=element('div','rmFusionIllustratedTable');
  pictured.append(icon('armchair'),element('strong','',String(n)));illustration.append(pictured);
 }
 preview.append(illustration);
 const checks=element('div','rmFusionChecklist');
 const hall=roomNames().find(r=>r.id===chosenRoom)?.name;
 const rows=[
  [chosen.length>0&&chosen.every(n=>room(n)===chosenRoom),'Même salle',hall||'À définir'],
  [size>=2,'Capacité totale',capacity(chosen)+' places'],
  [validSelection,'Associations à créer',validSelection?(size-1)+' lien'+(size>2?'s':''):'2 tables minimum']
 ];
 for(const [ok,label,value] of rows){
  const row=element('div','rmFusionCheckRow');
  row.append(icon(ok?'check-circle-2':'circle-help'),element('span','',label),element('strong','',value));checks.append(row);
 }
 preview.append(checks);
 const links=element('p','rmFusionPreviewLinks',validSelection?'Liens créés ou conservés : '+chosen.slice(1).map((n,i)=>chosen[i]+' + '+n).join('  ·  '):'Sélectionnez les tables physiquement voisines, dans leur ordre réel.');preview.append(links);
 submit.disabled=busy||!validSelection;
 submit.replaceChildren(icon(busy?'refresh-cw':editing?'save':'plus'),document.createTextNode(busy?' Enregistrement…':editing?' Enregistrer la modification':' Créer cette fusion'));
 cancel.hidden=editing===null&&!chosen.length;
 repaintIcons();
}
function reset(){editing=null;chosen=[];busy=false;options()}
function render(){
 list.replaceChildren();
 const pairs=valid();
 const groupList=associated.querySelector('.rmFusionDerivedList');groupList.replaceChildren();
 const allGroups=groups().slice().sort((a,b)=>a.length-b.length||a[0]-b[0]);
 const filters=associated.querySelector('.rmFusionGroupFilters');filters.replaceChildren();
 const categories=[[0,'Toutes'],[2,'2 tables'],[3,'3 tables'],[4,'4 tables']];
 for(const [size,label] of categories){
  const count=allGroups.filter(group=>size===0||group.length===size).length;
  const button=element('button','rmFusionGroupFilter'+(selectedGroupSize===size?' active':''),label+' ('+count+')');
  button.type='button';button.setAttribute('aria-pressed',String(selectedGroupSize===size));
  button.addEventListener('click',()=>{selectedGroupSize=size;render()});
  filters.append(button);
 }
 const visible=allGroups.filter(group=>selectedGroupSize===0||group.length===selectedGroupSize);
 groupBadge.textContent=allGroups.length+' groupe'+(allGroups.length>1?'s':'');
 if(!visible.length){const p=element('p','rmFusionNoGroups',allGroups.length?'Aucune fusion dans cette catégorie.':'Aucune fusion autorisée pour le moment.');groupList.append(p)}
 for(const group of visible){
  const row=element('div','rmFusionGroupRow');
  const name=element('div','rmFusionGroupCell rmFusionGroupName');name.append(icon('link-2'),element('strong','',group.join(' + ')));
  const n=element('div','rmFusionGroupCell rmFusionGroupTables',group.length+' tables');
  const seats=element('div','rmFusionGroupCell rmFusionGroupCapacity');seats.append(icon('users'),document.createTextNode(capacity(group)+' places'));
  const hall=element('div','rmFusionGroupCell rmFusionGroupRoom');hall.append(icon('map-pin'),document.createTextNode(roomNames().find(r=>r.id===room(group[0]))?.name||'Salle à configurer'));
  const status=element('div','rmFusionGroupCell rmFusionGroupStatus');status.append(icon('check-circle-2'),document.createTextNode('Autorisée'));
  const actions=element('div','rmFusionGroupCell rmFusionGroupActions');
  const edit=element('button','rmFusionManageLinks','Gérer');edit.type='button';edit.title='Voir les associations qui permettent ce groupe';
  edit.prepend(icon('pencil'));edit.addEventListener('click',()=>{linkDetails.open=true;linkDetails.scrollIntoView({behavior:'smooth',block:'center'});});
  actions.append(edit);row.append(name,n,seats,hall,status,actions);groupList.append(row);
 }
 if(!pairs.length){const p=document.createElement('p');p.textContent='Aucune association autorisée.';list.append(p)}
 for(const pair of pairs){
  const row=document.createElement('div');row.className='fusionRow rmFusionLinkRow';
  const info=document.createElement('span');info.className='rmFusionLinkInfo';info.append(icon('link-2'));
  const caption=element('strong','',pair.join(' + '));
  const details=element('span','rmFusionLinkDetails',capacity(pair)+' places · '+(roomNames().find(r=>r.id===room(pair[0]))?.name||'Même salle'));
  const description=element('div','rmFusionLinkText');description.append(caption,details);info.append(description);
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
 repaintIcons();
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