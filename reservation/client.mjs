const recordKeys=['reference','state','version','draft','booking','contact','deadline','tokenExpiresAt','canModify','canCancel','lastResult','emailStatus','managementToken'];
export class BookingError extends Error{constructor(message,{code='NETWORK',status=0,uncertain=false}={}){super(message);this.code=code;this.status=status;this.uncertain=uncertain;}}
export function createBookingClient({endpoint,base,restaurant,allowedOrigin,fetcher=fetch,storage,timeout=15000}){
 const url=new URL(endpoint,base);if(url.origin!==new URL(base).origin&&url.origin!==allowedOrigin)throw Error('Unapproved API origin');
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Secure API required');
 const key='rm0152:pending:'+restaurant;
 let pending=null;try{const p=JSON.parse(storage?.getItem(key)||'null');if(p&&/^[a-f0-9-]{36}$/i.test(p.key)&&/^[a-f0-9]{64}$/.test(p.proof))pending=p;}catch{}
 function persist(value){try{if(!storage)throw Error();if(value)storage.setItem(key,JSON.stringify(value));else storage.removeItem(key);}catch{throw new BookingError('Le stockage de cet onglet est indisponible. Autorisez-le ou contactez le restaurant.',{code:'STORAGE'});}pending=value;}
 async function call(action,args={}){
  const mutating=['hold','submit','modify','cancel','release'].includes(action);
  let response;
  try{response=await fetcher(url.href,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(timeout),body:JSON.stringify({action,restaurant,...args})});}
  catch{throw new BookingError('La connexion a été interrompue. Vérifiez la demande avant de réessayer.',{uncertain:mutating});}
  let result;try{result=await response.json();}catch{throw new BookingError('La réponse du service ne peut pas être vérifiée.',{uncertain:mutating});}
  if(!response.ok)throw new BookingError(result.error?.message||'Le service est indisponible.',{code:result.error?.code||'UNAVAILABLE',status:response.status,uncertain:mutating&&response.status>=500});
  if(!result.data||typeof result.data!=='object')throw new BookingError('La réponse du service est incomplète.',{uncertain:mutating});
  return result.data;
 }
 function assertWriteStorage(){const prior=pending;persist(prior||{key:crypto.randomUUID(),proof:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')});}
 return Object.freeze({
  profile:token=>call('profile',token?{token}:{}),availability:(draft,token)=>call('availability',token?{draft,token}:{draft}),
  hasPending:()=>!!pending&&pending.kind==='hold',
  async hold(draft){
   if(pending?.kind==='mutation')persist(null);
   if(pending){let old;try{old=await call('recover',{key:pending.key,proof:pending.proof});}catch(e){if(e.code!=='TOKEN')throw e;/* Retry the SAME identity: an earlier request may still be in flight. */return call('hold',{draft,key:pending.key,proof:pending.proof});}if(old.state!=='expired'&&old.state!=='draft')return old;if(old.state==='draft'){
    if(['party','date','service','time'].every(k=>old.draft[k]===draft[k]))return old;
    const released=await call('release',{key:pending.key,proof:pending.proof});if(released.state!=='expired')return released;
   }persist(null);}
   assertWriteStorage();persist({...pending,kind:'hold'});return call('hold',{draft,key:pending.key,proof:pending.proof});
  },
  async recover(){if(!pending||pending.kind!=='hold')return null;return call('recover',{key:pending.key,proof:pending.proof});},
  async release(){if(!pending)return null;const r=await call('release',{key:pending.key,proof:pending.proof});if(r.state==='expired')persist(null);return r;},
  async submit(draft,contact,version){
   if(!pending)throw new BookingError('Cette saisie doit être reprise depuis son onglet d’origine.',{code:'STORAGE'});
   if(!pending.operation)persist({...pending,operation:crypto.randomUUID(),version});
   return call('submit',{draft,contact,version:pending.version,operation:pending.operation,key:pending.key,proof:pending.proof});
  },
  read:token=>call('read',{token}),
  async modify(token,draft,contact,version){assertWriteStorage();const operation=crypto.randomUUID();persist({...pending,kind:'mutation',mutation:{operation,version,type:'modify'}});return call('modify',{token,draft,contact,version,operation});},
  async cancel(token,version){assertWriteStorage();const operation=crypto.randomUUID();persist({...pending,kind:'mutation',mutation:{operation,version,type:'cancel'}});return call('cancel',{token,version,operation});},
  clearRecovery(){persist(null);},
  // Plain public record contract, never table identifiers or internal notes.
  record(value){if(!value||!/^WEB-[A-F0-9]{12}$/.test(value.reference)||!['draft','pending','confirmed','pending_change','cancelled','rejected','expired'].includes(value.state)||!Number.isInteger(value.version)||!value.draft||!Number.isInteger(value.draft.party)||typeof value.canModify!=='boolean'||typeof value.canCancel!=='boolean')throw new BookingError('Le résultat de la réservation ne peut pas être vérifié.',{uncertain:true});return Object.fromEntries(recordKeys.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));}
 });
}
