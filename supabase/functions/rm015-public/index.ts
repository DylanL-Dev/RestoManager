import {createRuntimeHandler} from '../_shared/rm015-runtime.mjs';
const env=(name:string)=>Deno.env.get(name)||'';
Deno.serve(createRuntimeHandler({env,expectedProjectRef:'lykoybacslvmhtzftqsf',
 verifyChallenge:async(token:string,ip:string)=>{
  if(!env('RM015_TURNSTILE_SECRET')||!token)return false;
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env('RM015_TURNSTILE_SECRET'),response:token,remoteip:ip}),signal:AbortSignal.timeout(5000)});
  const value=await response.json();
  const allowed=env('RM015_ALLOWED_ORIGINS').split(',').map(s=>s.trim()).filter(Boolean);
  return value.success===true&&allowed.some(origin=>new URL(origin).hostname===value.hostname)&&value.action==='reservation';
 }
}));
