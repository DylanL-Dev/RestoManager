export async function verifyTurnstile({token,ip,secret,allowedOrigins,fetcher=fetch}){
 if(typeof token!=='string'||!token||token.length>2048||!secret)return false;
 try{
  const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret,response:token,remoteip:ip}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)return false;
  const value=await response.json();
  return value.success===true&&value.action==='reservation'&&allowedOrigins.some(origin=>new URL(origin).hostname===value.hostname);
 }catch{return false;}
}
