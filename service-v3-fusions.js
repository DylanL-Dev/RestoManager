'use strict';
(function(){
const KEY='restomanager_v3_fusion_pairs';
const form=document.getElementById('fusionForm');
if(!form)return;
const first=document.getElementById('fusionFirst'),second=document.getElementById('fusionSecond'),list=document.getElementById('fusionList'),message=document.getElementById('fusionMessage');
const key=p=>p.slice().sort((a,b)=>a-b).join(':');
function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function valid(){const tables=FloorPlan.get().tables;return read().filter(p=>Array.isArray(p)&&p.length===2&&p[0]!==p[1]&&tables.some(t=>t.number===p[0])&&tables.some(t=>t.number===p[1])&&tables.find(t=>t.number===p[0]).roomId===tables.find(t=>t.number===p[1]).roomId)}
function store(pairs){localStorage.setItem(KEY,JSON.stringify(pairs));window.dispatchEvent(new Event('restomanager:v3-fusions'))}
function render(){
const plan=FloorPlan.get();const a=first.value,b=second.value;
for(const select of [first,second]){select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Choisir une table';select.append(empty);for(const t of plan.tables.slice().sort((x,y)=>x.number-y.number)){const option=document.createElement('option');option.value=t.number;option.textContent='Table '+t.number+' ('+t.capacity+' places)';select.append(option)}}
first.value=a;second.value=b;list.replaceChildren();
const pairs=valid();if(!pairs.length){const empty=document.createElement('p');empty.textContent='Aucune fusion configurée.';list.append(empty)}
for(const pair of pairs){const row=document.createElement('div');row.className='fusionRow';const label=document.createElement('strong');label.textContent='Tables '+pair[0]+' + '+pair[1];const button=document.createElement('button');button.type='button';button.textContent='Retirer';button.addEventListener('click',()=>{if(!confirm('Retirer cette fusion autorisée ?'))return;store(read().filter(p=>key(p)!==key(pair)));render()});row.append(label,button);list.append(row)}
}
form.addEventListener('submit',event=>{event.preventDefault();const plan=FloorPlan.get(),a=plan.tables.find(t=>t.number===Number(first.value)),b=plan.tables.find(t=>t.number===Number(second.value));if(!a||!b||a.number===b.number){message.textContent='Choisissez deux tables différentes.';return}if(a.roomId!==b.roomId){message.textContent='Les tables doivent être dans la même salle.';return}const pairs=valid(),pair=[a.number,b.number].sort((x,y)=>x-y);if(pairs.some(p=>key(p)===key(pair))){message.textContent='Fusion déjà configurée.';return}store([...pairs,pair]);message.textContent='Fusion des tables '+pair.join(' et ')+' autorisée.';render()});
window.addEventListener('restomanager:v3-tables',render);
window.RestoFusion={pairs:valid};
render();
})();