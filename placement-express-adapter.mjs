// RM-OPS — adaptateur d'intégration Express (#271) ↔ moteur (#270).
// Expose EXACTEMENT l'interface de la simulation Codex (`service-v3-express-simulation.mjs`)
// au-dessus de `window.RestoPlacement`, pour que l'interface remplace la simulation
// par le service réel sans changer ses gestes ni ses écrans.
// Aucune écriture hors RestoPlacement.seat / walkIn (aperçu recalculé, idempotence, STALE).

const EVENTS=['restomanager:supabase-snapshot','restomanager:connection-state','online','offline'];

export function guardConnectedPlacement(placement,enabled=()=>false){
 const blocked=async()=>{
  throw Object.assign(Error('Enregistrement indisponible dans Coup de feu.'),{code:'EXPRESS_WRITE_DISABLED'});
 };
 return Object.freeze({...placement,
  seat:plan=>enabled()?placement.seat(plan):blocked(),
  walkIn:draft=>enabled()?placement.walkIn(draft):blocked(),
  capabilities:()=>enabled()?placement.capabilities():{...placement.capabilities(),seat:false,swapAndSeat:false,walkIn:false}});
}

// Les déplacements affichés par l'interface utilisent `client` comme libellé (« Ch. 215 »).
function forDisplay(plan){
 if(!plan?.ok)return plan;
 return {...plan,changes:plan.changes.map(change=>({...change,client:change.label||change.client}))};
}

export function createLiveAdapter({read,placement=globalThis.RestoPlacement,source=globalThis}={}){
 if(typeof read!=='function')throw Error('Adaptateur Express : fonction de lecture requise.');
 if(!placement||typeof placement.preview!=='function')throw Error('Adaptateur Express : RestoPlacement indisponible.');
 const listeners=new Set();
 const notify=()=>{for(const listener of listeners)listener()};
 for(const name of EVENTS)source.addEventListener?.(name,notify);
 return {
  live:true,
  read,
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener)},
  close(){listeners.clear();for(const name of EVENTS)source.removeEventListener?.(name,notify)},
  capabilities:()=>placement.capabilities(),
  // Même signature que previewPlacement(snapshot, reservationId, number) de la simulation.
  preview(snapshot,reservationId,number,options={}){
   return forDisplay(placement.preview(String(reservationId),[Number(number)],options));
  },
  // Même forme que suggestions(snapshot,row) : {primary:[{table,plan}], entries:[{table,plan}]}.
  suggestions(snapshot,row,roomId=null){
   const tables=snapshot.tables||[];
   const entries=tables.filter(table=>roomId===null||table.roomId===roomId)
    .map(table=>({table,plan:forDisplay(placement.preview(String(row.id),[table.number],{budget:200}))}));
   if(!entries.length)return {primary:[],entries};
   const ranked=placement.suggest(String(row.id),{limit:Math.max(2,tables.length)});
   if(!ranked?.ok)return {primary:[],entries,message:ranked?.message};
   const byNumber=new Map(entries.map(entry=>[entry.table.number,entry]));
   const choices=ranked.choices.filter(choice=>choice.targetTables.length===1)
    .map(choice=>byNumber.get(choice.targetTables[0])).filter(entry=>entry?.plan?.ok);
   const home=tables.find(table=>row.tables?.length===1&&row.tables[0]===table.number)?.roomId;
   if(home&&roomId===null)choices.sort((a,b)=>Number(b.table.roomId===home)-Number(a.table.roomId===home));
   return {primary:choices.slice(0,2),entries};
  },
  seat(plan){return placement.seat(plan)},
  // Même forme que suggestWalkIn(snapshot,guests) : les objets table de l'instantané affiché.
  suggestWalkIn(snapshot,guests){
   const allowed=new Set(placement.walkInTables(Number(guests)).map(table=>table.number));
   return (snapshot.tables||[]).filter(table=>allowed.has(table.number))
    .sort((a,b)=>a.capacity-b.capacity||a.number-b.number);
  },
  // Brouillon de la simulation : {guests, table, type:'external'|'hotel', room}.
  walkIn(draft){
   const hotel=draft?.type==='hotel';
   return placement.walkIn({guests:Number(draft?.guests),tables:[Number(draft?.table)],type:hotel?'hotel':'exterieur',name:hotel?String(draft?.room||'').trim():''});
  }
 };
}
