// RM-017.2.2 DEV only. Pure, testable verifier + narrow API gateway.
// Only an invited email can trigger a capped lookup of a fixed official URL.
const DEV_ORIGIN='https://restomanager-v3-supabase-integration.onrender.com';
const DEV_PROJECT='lykoybacslvmhtzftqsf';
const REGISTRY_URL='https://recherche-entreprises.api.gouv.fr/search';
const SECONDARY_URL='https://api.recherche-entreprises.fabrique.social.gouv.fr/api/v1/etablissement/';

export function validSiret(input){
 if(typeof input!=='string'||!/^[0-9]{14}$/.test(input))return false;
 const digits=[...input].map(Number);
 const sum=digits.reduce((acc,d,i)=>{
  let v=i%2===0?d*2:d;
  if(v>=10)v-=9;
  return acc+v;
 },0);
 // Insee publishes a narrow special rule for La Poste's exceptional SIREN.
 return sum%10===0||(input.startsWith('356000000')&&digits.reduce((x,y)=>x+y,0)%5===0);
}
const clean=(v,max=180)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';
const active=(e)=>e?.etat_administratif==='A'||e?.etatAdministratifEtablissement==='A'||e?.etat_administratif_etablissement==='A'||e?.est_ouvert===true;
export function inspectRegistryRecord(json,requestedSiret){
 if(!validSiret(requestedSiret)||!json||typeof json!=='object')return null;
 const siren=requestedSiret.slice(0,9);
 const results=Array.isArray(json.resultats)?json.resultats:[];
 for(const enterprise of results){
  if(enterprise?.siren!==siren||enterprise?.etat_administratif!=='A')continue;
  // Important: an SIRET search might return an enterprise without every branch.
  // Never accept a SIREN-only match as proof the exact establishment is active.
  const entries=[enterprise.siege,...(Array.isArray(enterprise.matching_etablissements)?enterprise.matching_etablissements:[])];
  const establishment=entries.find(e=>e?.siret===requestedSiret&&active(e));
  if(!establishment)continue;
  const legalName=clean(enterprise.nom_complet||enterprise.nom_raison_sociale||enterprise.denomination,180);
  const city=clean(establishment.libelle_commune||establishment.commune||establishment.ville,80);
  if(legalName.length>=2&&city.length>=2)return {siret:requestedSiret,siren,legalName,city};
 }
 // SocialGouv secondary endpoint responds with an exact SIRET (not just SIREN).
 const value=json?.etablissement&&typeof json.etablissement==='object'?json.etablissement:json;
 const match=value?.siret===requestedSiret&&active(value);
 if(match){
  const legalName=clean(value.nom_complet||value.nom_raison_sociale||value.raison_sociale||
   value.denomination||value.entreprise?.nom_complet||value.unite_legale?.denomination,180);
  const city=clean(value.libelle_commune||value.commune||value.ville||value.adresse?.commune,80);
  if(legalName.length>=2&&city.length>=2)return {siret:requestedSiret,siren,legalName,city};
 }
 return null;
}
export function readBackendSecret(env){
 let automatic={};try{automatic=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}')}catch{}
 return env('SUPABASE_SECRET_KEY')||automatic?.default||env('SUPABASE_SERVICE_ROLE_KEY')||'';
}
function headers(origin){
 const h={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
 if(origin===DEV_ORIGIN)h['Access-Control-Allow-Origin']=DEV_ORIGIN;
 return h;
}
const respond=(status,body,origin)=>new Response(JSON.stringify(body),{status,headers:headers(origin)});
function validEmail(email){return typeof email==='string'&&email.length<=160&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)}
export function createSiretHandler({env,fetcher=fetch,timeoutMs=8500,projectRef=DEV_PROJECT}){
 async function rpc(name,payload){
  const secret=readBackendSecret(env);
  if(!secret)throw Error('missing backend secret');
  const supabaseURL=env('SUPABASE_URL');
  if(supabaseURL!=='https://'+projectRef+'.supabase.co')throw Error('project mismatch');
  if(!['rm017_siret_allow_lookup_v1','rm017_record_siret_v1'].includes(name))throw Error('unauthorized RPC');
  const h={'apikey':secret,'Content-Type':'application/json'};
  if(secret.startsWith('eyJ'))h.Authorization='Bearer '+secret;
  const response=await fetcher(supabaseURL+'/rest/v1/rpc/'+name,{
   method:'POST',headers:h,body:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs)
  });
  if(!response.ok)throw Error('database unavailable');
  return await response.json();
 }
 async function official(url,siret){
  const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
  if(!response.ok)return null;
  const raw=await response.text();
  if(raw.length>320000)throw Error('registry payload too large');
  return inspectRegistryRecord(JSON.parse(raw),siret);
 }
 return async request=>{
  const origin=request.headers.get('Origin')||'';
  if(origin!==DEV_ORIGIN)return respond(403,{error:{code:'ORIGIN_DENIED',message:'Opération non autorisée.'}},origin);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers(origin),'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, apikey','Access-Control-Max-Age':'600'}});
  if(request.method!=='POST')return respond(405,{error:{code:'METHOD',message:'Méthode non autorisée.'}},origin);
  try{
   const raw=await request.text();
   if(raw.length>650) return respond(413,{error:{code:'INPUT',message:'Données invalides.'}},origin);
   const body=JSON.parse(raw);
   const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
   const kind=body.type,siret=body.siret;
   if(!validEmail(email)||!['hotel','independent'].includes(kind)||!validSiret(siret))
     return respond(400,{error:{code:'INVALID_SIRET',message:'Vérifiez les 14 chiffres de votre SIRET.'}},origin);
   const allowed=await rpc('rm017_siret_allow_lookup_v1',{p_email:email,p_type:kind,p_siret:siret});
   if(allowed!==true)return respond(403,{error:{code:'NOT_ELIGIBLE',message:'Vérification indisponible. Contactez l’assistance du pilote.'}},origin);
   // Only the government registry hosts below are queried; never a user-provided URL.
   let registry=await official(REGISTRY_URL+'?q='+siret,siret);
   if(!registry)registry=await official(SECONDARY_URL+siret,siret);
   if(!registry)return respond(422,{error:{code:'NOT_VERIFIED',message:'SIRET non vérifiable automatiquement. Contactez l’assistance pour un contrôle manuel.'}},origin);
   const recorded=await rpc('rm017_record_siret_v1',{
     p_email:email,p_type:kind,p_siret:siret,p_legal_name:registry.legalName,p_city:registry.city
   });
   if(recorded!==true)throw Error('record not confirmed');
   return respond(200,{verified:true,siret,siren:registry.siren,legalName:registry.legalName,city:registry.city},origin);
  }catch{
   return respond(503,{error:{code:'UNAVAILABLE',message:'La vérification professionnelle est momentanément indisponible.'}},origin);
  }
 };
}
