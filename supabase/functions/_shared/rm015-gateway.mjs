import {randomToken,digest,fingerprint,encryptToken,decryptToken} from './rm015-crypto.mjs';
const actions=new Set(['profile','availability','hold','recover','release','read','submit','modify','cancel']);
const hashes=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(value||{},k)).map(k=>[k,value[k]]));
function invalid(){throw Object.assign(Error('Vérifiez les informations saisies.'),{status:400,code:'INVALID'});}
function draft(value,hasTime){
 if(!value||!Number.isInteger(value.party)||value.party<1||value.party>50||!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||!['lunch','dinner'].includes(value.service)||hasTime&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time))invalid();
 const date=new Date(value.date+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value.date)invalid();
 return pick(value,hasTime?['party','date','service','time']:['party','date','service']);
}
function contact(value){
 if(!value||value.accepted!==true||typeof value.firstName!=='string'||!value.firstName.trim()||value.firstName.length>80||typeof value.lastName!=='string'||!value.lastName.trim()||value.lastName.length>80||typeof value.email!=='string'||value.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))invalid();
 if(value.phone!==undefined&&(typeof value.phone!=='string'||value.phone.length>30)||value.notes!==undefined&&(typeof value.notes!=='string'||value.notes.length>500))invalid();
 return {...pick(value,['firstName','lastName','email','phone','notes']),accepted:true};
}
async function jsonBody(request){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Object.assign(Error('Format de requête non accepté.'),{status:415,code:'FORMAT'});
 if(Number(request.headers.get('content-length'))>16000)throw Object.assign(Error('La demande est trop longue.'),{status:413,code:'SIZE'});
 const reader=request.body?.getReader();if(!reader)invalid();const chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>16000){await reader.cancel();throw Object.assign(Error('La demande est trop longue.'),{status:413,code:'SIZE'});}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{invalid();}
 if(!value||Array.isArray(value)||typeof value!=='object')invalid();return value;
}
function safeRecord(value){
 const result=pick(value,['reference','state','version','deadline','tokenExpiresAt','canModify','canCancel','lastResult','emailStatus']);
 if(value.draft)result.draft=pick(value.draft,['party','date','time','service']);
 if(value.booking)result.booking=pick(value.booking,['party','date','time','service','name']);
 if(value.contact)result.contact=pick(value.contact,['firstName','lastName','email','phone','notes','accepted']);
 return result;
}
export function createPublicHandler({rpc,keys,activeKey,rateSecret,allowedOrigins=/** @type {string[]} */([]),ipForRequest,enabled=false,environment='dev',verifyChallenge=async(_token,_ip)=>false}){
 const allowed=new Set(allowedOrigins);
 return async request=>{
  const origin=request.headers.get('origin'),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!allowed.has(origin))return response({error:{code:'ORIGIN',message:'Cette origine n’est pas autorisée.'}},403);
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  if(request.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='content-type';return new Response(null,{status:204,headers});}
  if(request.method!=='POST')return response({error:{code:'METHOD',message:'Méthode non acceptée.'}},405);
  if(!enabled)return response({error:{code:'STAGED',message:'Les réservations en ligne ne sont pas encore activées.'}},503);
  try{
   const body=await jsonBody(request);if(!actions.has(body.action)||typeof body.restaurant!=='string'||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body.restaurant)||body.restaurant.length>80)invalid();
   const ip=ipForRequest?.(request);if(!ip||ip.length>160)throw Object.assign(Error('Connexion non vérifiable. Réessayez.'),{status:503,code:'NETWORK'});
   const ipHash=await fingerprint(rateSecret,ip),bucket=body.action==='hold'?'hold':body.action==='profile'||body.action==='availability'?'read':'manage';
   // Separate transaction: unsuccessful business requests also consume their rate budget.
   const limit=await rpc('rm015_rate_v1',{p_key:ipHash,p_bucket:bucket,p_limit:bucket==='hold'?12:bucket==='read'?120:60,p_seconds:900});
   if(limit.error)throw Error('Rate store unavailable');
   if(!limit.data?.allowed)return response({error:{code:'RATE',message:'Trop de demandes. Réessayez dans quelques minutes.'}},429);
   if(bucket==='hold'&&limit.data.count>3&&!await verifyChallenge(body.challenge,ip))return response({error:{code:'CHALLENGE',message:'Plusieurs demandes ont été effectuées. Patientez avant de réessayer.'}},429);
   const payload={restaurant:body.restaurant};
   if(['availability','hold','submit','modify'].includes(body.action))payload.draft=draft(body.draft,body.action!=='availability');
   if(['submit','modify'].includes(body.action))payload.contact=contact(body.contact);
   if(['hold','recover','release','submit'].includes(body.action)){
    if(!uuid.test(body.key)||!hashes.test(body.proof))invalid();payload.key=body.key;payload.proof_hash=await digest(body.proof);
   }
   if(['read','modify','cancel'].includes(body.action)||(['profile','availability'].includes(body.action)&&body.token!==undefined)){if(!hashes.test(body.token))invalid();payload.token_hash=await digest(body.token);}
   if(['submit','modify','cancel'].includes(body.action)){if(!uuid.test(body.operation)||!Number.isInteger(body.version)||body.version<1)invalid();payload.operation=body.operation;payload.version=body.version;}
   if(body.action==='hold'){
    const token=randomToken();payload.token_hash=await digest(token);payload.token_cipher=await encryptToken(keys,activeKey,body.restaurant,token);payload.ip_hash=ipHash;
   }
   const result=await rpc('rm015_gateway_v1',{p_action:body.action,p_payload:payload});
   if(result.error){
    const code=result.error.details,known={TOKEN:[404,'Ce lien est indisponible ou a expiré.'],UNAVAILABLE:[503,'Les réservations en ligne sont momentanément indisponibles.'],FULL:[409,'Ce créneau vient de changer. Choisissez un autre horaire.'],STALE:[409,'La réservation a changé. Vérifiez son récapitulatif.'],IDEMPOTENCY:[409,'Cette opération a déjà été utilisée. Vérifiez votre réservation.'],EXPIRED:[409,'Le maintien a expiré. Revérifiez votre horaire.'],LOCKED:[409,'Cette action n’est plus disponible. Contactez le restaurant.'],EMAIL_LOCKED:[409,'Contactez le restaurant pour modifier votre email.'],RATE:[429,'Plusieurs demandes existent déjà. Patientez ou contactez le restaurant.'],INVALID:[400,'Vérifiez les informations saisies.']};
    const value=known[code];if(value)return response({error:{code,message:value[1]}},value[0]);
    return response({error:{code:'UNAVAILABLE',message:'La demande n’a pas pu être vérifiée. Réessayez sans créer une nouvelle réservation.'}},503);
   }
   let data=result.data;
   if(data?.secret_cipher){const token=await decryptToken(keys,body.restaurant,data.secret_cipher);data={...safeRecord(data.data),managementToken:token};}
   else if(body.action==='profile')data=pick(data,['name','slug','timezone','maxParty','horizonDays','leadMinutes','pendingMinutes','manualFrom','privacyNotice','privacyContact','cancellationNotice','coverPath','coverAlt','publicProfile','openingHours','today','serverTime']);
   else if(body.action==='availability')data={slots:(data?.slots||[]).map(s=>pick(s,['time','available','level','manual'])),serverTime:data?.serverTime};
   return response({data,environment,emailDelivery:'not-activated'});
  }catch(error){
   return response({error:{code:error.code||'UNAVAILABLE',message:error.status?error.message:'Le service est momentanément indisponible. Vérifiez votre réservation avant de réessayer.'}},error.status||503);
  }
 };
}

export function createDatabaseRpc({url,secret,fetcher=fetch}){
 const parsed=new URL(url);if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw Error('Secure backend URL required');
 return async(name,args)=>{
  if(!['rm015_rate_v1','rm015_gateway_v1','rm015_mail_v1','rm015_runtime_config_v1'].includes(name))throw Error('Backend RPC not allowed');
  const headers={'apikey':secret,'Content-Type':'application/json'};
  // Legacy service-role keys are JWTs; new secret keys are never bearer JWTs.
  if(secret?.startsWith('eyJ'))headers.Authorization='Bearer '+secret;
  const response=await fetcher(parsed.origin+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
  const value=await response.json();return response.ok?{data:value,error:null}:{data:null,error:pick(value,['code','details'])};
 };
}
