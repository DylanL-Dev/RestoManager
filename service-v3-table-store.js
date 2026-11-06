'use strict';
// V3 service-only table registry. The archived graphical floor plan is never loaded.
const TableStore=(()=>{
 const KEY='restomanager_v3_tables_rooms_v1',LEGACY='restomanager_floor_plan_v1',BACKUP='restomanager_v3_tables_rooms_migration_backup';
 const clone=x=>structuredClone(x);
 const fallback=()=>({version:1,rooms:[{id:'main',name:'Salle principale'}],tables:ReservationEngine.TABLES.map(n=>({id:'table-'+n,number:n,capacityMin:1,capacity:ReservationEngine.CAPACITY[n],roomId:'main'}))});
 const valid=p=>!!p&&p.version===1&&Array.isArray(p.rooms)&&Array.isArray(p.tables)&&p.rooms.some(r=>r.id==='main')&&p.rooms.every(r=>r&&typeof r.id==='string'&&r.id.trim()&&typeof r.name==='string'&&r.name.trim())&&new Set(p.rooms.map(r=>r.id)).size===p.rooms.length&&p.tables.every(t=>t&&typeof t.id==='string'&&t.id.trim()&&Number.isInteger(t.number)&&t.number>0&&Number.isInteger(t.capacityMin)&&t.capacityMin>=1&&Number.isInteger(t.capacity)&&t.capacity>=t.capacityMin&&p.rooms.some(r=>r.id===t.roomId))&&new Set(p.tables.map(t=>t.id)).size===p.tables.length&&new Set(p.tables.map(t=>t.number)).size===p.tables.length;
 const fromLegacy=raw=>({version:1,rooms:raw.rooms.map(r=>({id:r.id,name:r.name})),tables:raw.tables.map(t=>({id:t.id,number:t.number,capacityMin:t.capacityMin??1,capacity:t.capacity,roomId:t.roomId}))});
 let state,error=null;
 try{
  const saved=localStorage.getItem(KEY);
  if(saved!==null){state=JSON.parse(saved);if(!valid(state))throw Error('Les données de tables V3 sont invalides. Aucune donnée ne sera écrasée.')}
  else{
   const legacy=localStorage.getItem(LEGACY);
   if(legacy!==null){
    const parsed=JSON.parse(legacy);
    if(!parsed||!Array.isArray(parsed.rooms)||!Array.isArray(parsed.tables))throw Error('Anciennes données de tables illisibles.');
    state=fromLegacy(parsed);
    if(!valid(state))throw Error('Les anciennes tables ou salles ne peuvent pas être migrées automatiquement.');
    // Keep the complete old plan untouched and make an additional backup before saving the registry.
    if(localStorage.getItem(BACKUP)===null)localStorage.setItem(BACKUP,legacy);
   }else state=fallback();
   localStorage.setItem(KEY,JSON.stringify(state));
  }
 }catch(e){error=e.message;state=fallback();}
 const sync=()=>{ReservationEngine.TABLES.splice(0,ReservationEngine.TABLES.length,...state.tables.map(t=>t.number));for(const k of Object.keys(ReservationEngine.CAPACITY))delete ReservationEngine.CAPACITY[k];for(const t of state.tables)ReservationEngine.CAPACITY[t.number]=t.capacity;};
 if(!error)sync();
 return {get:()=>clone(state),getLoadError:()=>error,valid,setShared(next){if(!valid(next))throw Error('Configuration Supabase invalide : synchronisation des tables refusée.');state=clone(next);sync();},save(next){if(error)throw Error(error);if(!valid(next))throw Error('Tables ou salles invalides : enregistrement refusé.');const serialized=JSON.stringify(next);localStorage.setItem(KEY,serialized);state=clone(next);sync();}};
})();
