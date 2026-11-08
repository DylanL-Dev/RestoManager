// Read a complete, tenant-authorized revision. Never publish pages separately.
const collections=[
 ['reservations','*',['starts_at','id']],
 ['reservation_tables','*',['reservation_id','table_id']],
 ['restaurant_rooms','*',['sort_order','id']],
 ['restaurant_tables','*',['id']],
 ['table_holds','id,table_id,draft_role,held_by,starts_at,ends_at,expires_at,created_at',['id']],
 ['table_fusion_links','table_a,table_b',['table_a','table_b']],
 ['restaurant_hours','*',['id']]
];
export async function readServiceState(client){
 const {data,error}=await client.rpc('service_sync_state_v1');
 if(error)throw error;
 if(!data||typeof data.revision!=='string'||!data.server_time)throw Object.assign(Error('État de synchronisation indisponible.'),{code:'SYNC_CONTRACT'});
 return data;
}
export function canWrite(capabilities){return capabilities?.reservation_edits===4&&capabilities?.booking_recovery===1&&capabilities?.snapshot===1}
export async function readCollection(client,name,columns,orders,pageSize=500){
 const rows=[];
 for(let offset=0;;){
  let query=client.from(name).select(columns,{count:'exact'});
  for(const column of orders)query=query.order(column,{ascending:true});
  const {data,error,count}=await query.range(offset,offset+pageSize-1);
  if(error)throw error;
  if(!Array.isArray(data))throw Object.assign(Error('Données incomplètes.'),{code:'SYNC_CONTRACT'});
  rows.push(...data);
  // PostgREST can cap each response below the requested range. A short page
  // therefore does not prove the authorized collection is complete.
  if(data.length===0||(Number.isInteger(count)&&rows.length>=count))return rows;
  offset+=data.length;
 }
}
export async function readRevisionSnapshot(client,{attempts=3,pageSize=500}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  const before=await readServiceState(client);
  const rows=await Promise.all(collections.map(([name,columns,orders])=>readCollection(client,name,columns,orders,pageSize)));
  const after=await readServiceState(client);
  if(before.revision!==after.revision)continue;
  const [reservations,assignments,rooms,tables,holds,fusionLinks,hours]=rows;
  if(hours.length!==1)throw Object.assign(Error('Configuration du service indisponible.'),{code:'SYNC_CONTRACT'});
  return {revision:after.revision,serverTime:after.server_time,capabilities:after.capabilities,
   reservations,assignments,rooms,tables,holds,fusionLinks,hours:hours[0]};
 }
 throw Object.assign(Error('Des modifications sont en cours. Nouvelle synchronisation nécessaire.'),{code:'SYNC_BUSY'});
}
