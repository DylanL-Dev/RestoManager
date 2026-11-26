// RM-SEC-03 — single, locally hosted Supabase SDK for every RestoManager space.
// supabase-js-2.119.0.umd.js is the unmodified browser build of @supabase/supabase-js@2.119.0
// (package-lock.json, SHA-256 in vendor/README.md). It declares a top-level `var supabase`, which
// only becomes global in a classic script, so it is injected as one, then re-exported. No CDN.
if(!globalThis.supabase?.createClient){
 await new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=new URL('./supabase-js-2.119.0.umd.js',import.meta.url).href;
  script.onload=resolve;script.onerror=()=>reject(new Error('Le SDK Supabase local est indisponible.'));
  document.head.append(script);
 });
}
if(typeof globalThis.supabase?.createClient!=='function')throw new Error('Le SDK Supabase local est invalide.');
export const createClient=globalThis.supabase.createClient;
