import {decryptToken,equalSecret} from './rm015-crypto.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mailContent(job,token,publicBase){
 const base=new URL(publicBase);if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Secure public origin required');
 const url=new URL('reservation/live.html',base.href.endsWith('/')?base:base.href+'/');url.searchParams.set('restaurant',job.restaurant);url.hash='manage='+token;
 const r=job.record,b=r.booking,d=job.event==='pending'?r.draft:b||r.draft;
 const titles={pending:b?'Votre modification attend une confirmation':'Votre demande attend une confirmation',confirmed:'Votre réservation est confirmée',modified:'Votre réservation a été modifiée',cancelled:'Votre réservation est annulée',rejected:'Votre demande n’a pas été confirmée',expired:'Votre demande a expiré',change_superseded:'Votre réservation a été mise à jour par le restaurant'};
 const subject=titles[job.event];if(!subject)throw Error('Unknown email event');
 const lines=[job.restaurantName,subject,'Référence : '+r.reference,d?.date?new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'full'}).format(new Date(d.date+'T12:00Z'))+' à '+d.time+' · '+d.party+' personne(s)':''];
 if(job.event==='pending')lines.push('Aucune confirmation n’est acquise pour cette demande. Réponse attendue avant '+new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}).format(new Date(r.deadline))+'.');
 if(b&&['pending','rejected','expired'].includes(job.event))lines.push('Votre réservation initiale reste conservée. Retrouvez son récapitulatif à jour avec votre lien personnel.');
 lines.push('Consulter ou gérer votre réservation : '+url.href,'Ce lien est personnel. Ne le partagez pas. Aucun compte n’est nécessaire.');
 return {to:job.email,subject:subject+' — '+job.restaurantName,text:lines.filter(Boolean).join('\n\n'),html:'<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;background:#f4f7f2;color:#183f33;padding:24px"><main style="max-width:560px;margin:auto;background:white;border-radius:20px;padding:28px"><p style="color:#146c55">'+esc(job.restaurantName)+'</p><h1 style="font-size:24px">'+esc(subject)+'</h1>'+lines.slice(2,-2).map(line=>'<p>'+esc(line)+'</p>').join('')+'<p><a style="display:inline-block;padding:14px 18px;background:#146c55;color:white;border-radius:12px" href="'+esc(url.href)+'">Consulter ma réservation</a></p><p>Ce lien est personnel. Aucun compte n’est nécessaire.</p></main></body></html>'};
}
export function createMailWorker({rpc,keys,workerSecret,publicBase,sendMessage,enabled=false}){
 return async request=>{
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply({error:'METHOD'},405);
  if(!equalSecret(request.headers.get('authorization')?.replace(/^Bearer /,''),workerSecret))return reply({error:'FORBIDDEN'},403);
  if(!enabled)return reply({error:'EMAIL_NOT_ACTIVATED'},503);
  try{
   const claim=await rpc('rm015_mail_v1',{p_action:'claim',p_payload:{}});if(claim.error)throw Error('Queue unavailable');
   let delivered=0,failed=0;
   for(const job of claim.data){
    try{
     const token=await decryptToken(keys,job.restaurant,job.tokenCipher),content=mailContent(job,token,publicBase);
     const response=await sendMessage(content,{idempotencyKey:'rm015-'+job.id});
     const ack=await rpc('rm015_mail_v1',{p_action:'ack',p_payload:{id:job.id,lease:job.lease,providerId:response.id}});
     if(ack.error||!ack.data?.accepted)throw Error('Lease not acknowledged');delivered++;
    }catch(error){
     failed++;await rpc('rm015_mail_v1',{p_action:'fail',p_payload:{id:job.id,lease:job.lease,terminal:error.permanent===true}});
    }
   }
   return reply({delivered,failed});
  }catch{return reply({error:'EMAIL_UNAVAILABLE'},503)}
 };
}
export function resendTransport({apiKey,from,fetcher=fetch}){
 return async(message,{idempotencyKey})=>{
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from,to:[message.to],subject:message.subject,text:message.text,html:message.html}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Object.assign(Error('Email provider rejected request'),{permanent:response.status>=400&&response.status<500&&![408,429].includes(response.status)});
  const body=await response.json();if(typeof body.id!=='string')throw Error('Email acknowledgment unavailable');return {id:body.id};
 };
}
