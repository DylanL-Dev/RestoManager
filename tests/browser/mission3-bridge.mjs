// UI regression adapter only: this is deliberately not an Auth/RLS/Realtime test.
export async function requireStaff(){return {user:{id:'fictional-'+window.__mission3Role},profile:{active:true,role:window.__mission3Role,display_name:'Équipe fictive'}}}
export async function loadSharedService(){return window.__mission3Snapshot()}
export async function subscribeSharedService(onSnapshot,onError,onConnection){
 const apply=async()=>{try{onConnection(true);onSnapshot(await loadSharedService())}catch(error){onError(error)}};
 const offline=()=>onConnection(false);
 window.addEventListener('online',apply);window.addEventListener('offline',offline);window.addEventListener('mission3:push',apply);
 setTimeout(apply,0);
 return ()=>{window.removeEventListener('online',apply);window.removeEventListener('offline',offline);window.removeEventListener('mission3:push',apply)};
}
function query(){
 const result={then:(yes,no)=>Promise.resolve({data:[],error:null}).then(yes,no)};
 for(const name of ['select','eq','order','limit','range','in','is','single','maybeSingle','update','insert','delete','gte','lte','neq'])result[name]=()=>result;
 return result;
}
export const supabase={from:query,rpc:(name,args)=>window.__mission3Rpc(name,args),
 auth:{getUser:async()=>({data:{user:{id:'fictional-'+window.__mission3Role}},error:null}),signOut:async()=>({error:null})},
 removeChannel:async()=>{},channel:()=>({on(){return this},subscribe(){return this}})};
