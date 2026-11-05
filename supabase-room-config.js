import {supabase,requireStaff} from './supabase-service-bridge.js';
const $=id=>document.getElementById(id);
let rooms=[],tables=[],links=[];
function status(message){$('status').textContent=message;}
async function write(query,success){const {error}=await query;if(error)throw error;status(success);await load();}
function opt(value,label){return new Option(label,value);}
async function load(){
 const [r,t,l]=await Promise.all([
  supabase.from('restaurant_rooms').select('*').order('sort_order'),
  supabase.from('restaurant_tables').select('*').order('label'),
  supabase.from('table_fusion_links').select('*')
 ]);
 for(const result of [r,t,l])if(result.error)throw result.error;
 rooms=r.data;tables=t.data;links=l.data;
 const roomNames=new Map(rooms.map(x=>[x.id,x.name]));
 $('rooms').replaceChildren();
 for(const room of rooms){
  const line=document.createElement('div');line.className='item';
  const name=document.createElement('span');name.textContent=room.name+' ('+tables.filter(t=>t.room_id===room.id).length+' tables)';
  line.append(name);$('rooms').append(line);
 }
 $('tables').replaceChildren();
 for(const table of tables){
  const line=document.createElement('div');line.className='item';
  const name=document.createElement('span');name.textContent=table.label+' · '+table.seats+' places';
  const select=document.createElement('select');select.setAttribute('aria-label','Salle de '+table.label);
  for(const room of rooms)select.add(opt(room.id,room.name));
  select.value=table.room_id;
  select.addEventListener('change',async()=>{
   const previous=table.room_id;
   try{
    // Remove links before moving a table: cross-room fusion must never persist.
    const related=links.filter(l=>l.table_a===table.id||l.table_b===table.id);
    if(related.length&&!confirm('Déplacer cette table supprimera ses '+related.length+' associations de fusion. Continuer ?')){select.value=previous;return;}
    for(const link of related){
     const {error}=await supabase.from('table_fusion_links').delete().eq('table_a',link.table_a).eq('table_b',link.table_b);
     if(error)throw error;
    }
    await write(supabase.from('restaurant_tables').update({room_id:select.value}).eq('id',table.id),'Salle modifiée pour '+table.label);
   }catch(error){select.value=previous;status(error.message);}
  });
  line.append(name,select);$('tables').append(line);
 }
 for(const id of ['tableA','tableB']){$(id).replaceChildren(opt('','Choisir une table'));for(const table of tables)$(id).add(opt(table.id,table.label+' · '+(roomNames.get(table.room_id)||'?')));}
 $('links').replaceChildren();
 for(const link of links){
  const a=tables.find(t=>t.id===link.table_a),b=tables.find(t=>t.id===link.table_b);
  const line=document.createElement('div');line.className='item';
  const label=document.createElement('span');label.textContent=(a?.label||'?')+' + '+(b?.label||'?');
  const button=document.createElement('button');button.textContent='Supprimer';
  button.addEventListener('click',async()=>{try{await write(supabase.from('table_fusion_links').delete().eq('table_a',link.table_a).eq('table_b',link.table_b),'Association supprimée');}catch(error){status(error.message);}});
  line.append(label,button);$('links').append(line);
 }
}
$('roomForm').addEventListener('submit',async event=>{
 event.preventDefault();
 try{await write(supabase.from('restaurant_rooms').insert({name:$('roomName').value.trim(),sort_order:rooms.length+1}),'Salle ajoutée');$('roomForm').reset();}catch(error){status(error.message);}
});
$('addLink').addEventListener('click',async()=>{
 const a=tables.find(t=>t.id===$('tableA').value),b=tables.find(t=>t.id===$('tableB').value);
 if(!a||!b||a.id===b.id){status('Choisissez deux tables différentes.');return;}
 if(a.room_id!==b.room_id){status('Les tables doivent appartenir à la même salle.');return;}
 const [table_a,table_b]=[a.id,b.id].sort();
 try{await write(supabase.from('table_fusion_links').insert({table_a,table_b}),'Association autorisée');}catch(error){status(error.message);}
});
(async()=>{
 try{const {profile}=await requireStaff();if(profile.role!=='fb_admin')throw Error('Réservé à l’administrateur F&B');$('content').hidden=false;await load();status('Configuration chargée.');}
 catch(error){status('Accès indisponible : '+error.message);}
})();
