import {createPublicHandler,createDatabaseRpc} from './rm015-gateway.mjs';

export function backendSecret(env){
 let automatic={};try{automatic=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}')}catch{}
 return env('SUPABASE_SECRET_KEY')||automatic?.default||env('SUPABASE_SERVICE_ROLE_KEY')||'';
}
export function validateRuntime(value,projectRef){
 if(!value||value.schema!==1||value.environment!=='dev'||value.projectRef!==projectRef||value.emailEnabled!==false||typeof value.enabled!=='boolean')throw Error('Invalid runtime');
 if(!Array.isArray(value.allowedOrigins)||!value.allowedOrigins.length||value.allowedOrigins.length>10||value.allowedOrigins.some(origin=>{try{const url=new URL(origin);return url.protocol!=='https:'||url.origin!==origin}catch{return true}}))throw Error('Invalid origins');
 if(!value.keys||!Object.keys(value.keys).length||Object.keys(value.keys).length>10||Object.entries(value.keys).some(([id,key])=>!(/^[a-z0-9_-]{1,20}$/).test(id)||typeof key!=='string'||!/^[a-f0-9]{64}$/i.test(key))||typeof value.activeKey!=='string'||!Object.hasOwn(value.keys,value.activeKey)||!/^[a-f0-9]{64}$/i.test(value.rateSecret||''))throw Error('Invalid keys');
 if(!['cf-connecting-ip','x-forwarded-for'].includes(value.trustedIpHeader)||!Number.isInteger(value.trustedProxyHops)||value.trustedProxyHops<1||value.trustedProxyHops>5||value.trustedIpHeader==='cf-connecting-ip'&&value.trustedProxyHops!==1)throw Error('Invalid ingress');
 return value;
}
export function requestIp(request,config){
 const raw=request.headers.get(config.trustedIpHeader)||'';
 const value=config.trustedIpHeader==='cf-connecting-ip'?raw.trim():raw.split(',').at(-config.trustedProxyHops)?.trim();
 return value&&/^[0-9a-f:.]+$/i.test(value)&&value.length<=64?value:null;
}
// Encrypted Vault configuration is only retrieved by a narrow backend RPC.
export function createRuntimeHandler({env,expectedProjectRef,fetcher=fetch,now=Date.now,rpc:providedRpc=undefined,verifyChallenge=async(_token,_ip)=>false}){
 let cached,expires=0,pending;
 const unavailable=()=>Response.json({error:{code:'STAGED',message:'Les réservations en ligne ne sont pas encore disponibles.'}},{status:503,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
 async function load(){
  const url=new URL(env('SUPABASE_URL'));
  // Deployment guard: this phase is authorized on DEV exclusively.
  if(url.origin!=='https://'+expectedProjectRef+'.supabase.co')throw Error('Wrong project');
  const secret=backendSecret(env);if(typeof secret!=='string'||!secret)throw Error('Missing backend identity');
  const rpc=providedRpc||createDatabaseRpc({url:url.origin,secret,fetcher});
  let config;
  if(env('RM015_ENABLED')){
   config={schema:1,environment:'dev',projectRef:expectedProjectRef,emailEnabled:false,enabled:env('RM015_ENABLED')==='true',allowedOrigins:env('RM015_ALLOWED_ORIGINS').split(',').map(x=>x.trim()).filter(Boolean),keys:JSON.parse(env('RM015_TOKEN_KEYS_JSON')||'{}'),activeKey:env('RM015_ACTIVE_TOKEN_KEY'),rateSecret:env('RM015_RATE_SECRET'),trustedIpHeader:env('RM015_TRUSTED_IP_HEADER'),trustedProxyHops:Number(env('RM015_TRUSTED_PROXY_HOPS')||'1')};
  }else{
   const result=await rpc('rm015_runtime_config_v1',{});if(result.error)throw Error('Configuration unavailable');config=result.data;
  }
  validateRuntime(config,expectedProjectRef);
  return createPublicHandler({rpc,keys:config.keys,activeKey:config.activeKey,rateSecret:config.rateSecret,allowedOrigins:config.allowedOrigins,enabled:config.enabled,environment:'dev',ipForRequest:request=>requestIp(request,config),verifyChallenge});
 }
 return async request=>{
  if(env('RM015_ENABLED')==='false')return unavailable();
  try{
   if(!cached||now()>=expires){
    if(!pending)pending=load().then(handler=>{cached=handler;expires=now()+30000;return handler}).finally(()=>{pending=null});
    await pending;
   }
   return await cached(request);
  }catch{return unavailable()}
 };
}
