// In-memory adapter for browser regression tests. No remote Supabase client.
export async function requireStaff(){return {user:{id:'fictional-user'},profile:{active:true,role:window.__mission2Role,display_name:'Équipe fictive'}}}
export async function loadSharedService(){return window.__mission2Snapshot()}
export async function subscribeSharedService(onSnapshot,onError,onConnection){
 const apply=async()=>{try{onConnection(true);onSnapshot(await loadSharedService())}catch(error){onError(error)}};
 window.addEventListener('online',apply);window.addEventListener('offline',()=>onConnection(false));
 setTimeout(apply,0);return ()=>{};
}
function chain(){
 const query={then:(yes,no)=>Promise.resolve({data:[],error:null}).then(yes,no)};
 for(const k of ['select','eq','order','limit','in','is','single','maybeSingle','update','insert','delete','gte','lte','neq'])query[k]=()=>query;
 return query;
}
export const supabase={
 from:chain,rpc:(name,args)=>window.__mission2Rpc(name,args),
 auth:{getUser:async()=>({data:{user:{id:'fictional-user'}},error:null}),signOut:async()=>({error:null})},
 removeChannel:async()=>{},channel:()=>({on(){return this},subscribe(){return this}})
};
