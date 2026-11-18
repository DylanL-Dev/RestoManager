import {createPublicHandler,createDatabaseRpc} from '../_shared/rm015-gateway.mjs';
// No deployment is performed by this repository. All features start disabled.
const env=(name:string)=>Deno.env.get(name)||'';
const allowed=env('RM015_ALLOWED_ORIGINS').split(',').map(s=>s.trim()).filter(Boolean);
const keys=JSON.parse(env('RM015_TOKEN_KEYS_JSON')||'{}');
const handler=createPublicHandler({
 enabled:env('RM015_ENABLED')==='true',environment:'dev',allowedOrigins:allowed,
 keys,activeKey:env('RM015_ACTIVE_TOKEN_KEY'),rateSecret:env('RM015_RATE_SECRET'),
 rpc:createDatabaseRpc({url:env('SUPABASE_URL'),secret:env('SUPABASE_SECRET_KEY')||env('SUPABASE_SERVICE_ROLE_KEY')}),
 // Must be configured only after confirming which header the ingress rewrites.
 // Unknown deployment topology fails closed instead of trusting a spoofable header.
 ipForRequest:(request:Request)=>{
  const header=env('RM015_TRUSTED_IP_HEADER');if(!['x-forwarded-for','cf-connecting-ip'].includes(header))return null;
  const hops=Number(env('RM015_TRUSTED_PROXY_HOPS')||'1');if(!Number.isInteger(hops)||hops<1||hops>5)return null;
  const value=request.headers.get(header)?.split(',').at(-hops)?.trim();return value&&/^[0-9a-f:.]+$/i.test(value)?value:null;
 },
 verifyChallenge:async(token:string,ip:string)=>{
  if(!env('RM015_TURNSTILE_SECRET')||!token)return false;
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env('RM015_TURNSTILE_SECRET'),response:token,remoteip:ip}),signal:AbortSignal.timeout(5000)});
  const value=await response.json();return value.success===true&&allowed.some(origin=>new URL(origin).hostname===value.hostname)&&value.action==='reservation';
 }
});
Deno.serve(handler);
