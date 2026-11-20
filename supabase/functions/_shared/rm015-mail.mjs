import {decryptToken,equalSecret} from './rm015-crypto.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mailContent(job,token,publicBase){
 const invalid=()=>{throw Object.assign(Error('Invalid transactional email data'),{permanent:true});};
 let base;try{base=new URL(publicBase);}catch{invalid();}if(base.username||base.password||base.search||base.hash||base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))invalid();
 if(!/^[a-f0-9]{64}$/.test(token)||(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(job.restaurant||'')||job.restaurant.length<3||job.restaurant.length>80))invalid();
 const url=new URL('reservation/live.html',base.href.endsWith('/')?base:base.href+'/');url.searchParams.set('restaurant',job.restaurant);url.hash='manage='+token;
 const r=job.record;if(!r)invalid();const b=r.booking,d=job.event==='pending'?r.draft:b||r.draft;
 if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time||'')||!Number.isInteger(d.party)||d.party<1||d.party>50)invalid();
 if(['confirmed','modified'].includes(job.event)&&r.state!=='confirmed'||job.event==='pending'&&!['pending','pending_change'].includes(r.state)||job.event==='cancelled'&&r.state!=='cancelled')invalid();
 const titles={pending:b?'Votre modification attend une confirmation':'Votre demande attend une confirmation',confirmed:'Votre réservation est confirmée',modified:'Votre réservation a été modifiée',cancelled:'Votre réservation est annulée',rejected:b?'Votre modification n’a pas été confirmée':'Votre demande n’a pas été confirmée',expired:b?'Votre demande de modification a expiré':'Votre demande a expiré',change_superseded:'Votre réservation a été mise à jour par le restaurant'};
 const subject=titles[job.event];if(!subject)invalid();
 const restaurant=String(job.restaurantName||'Votre restaurant').replace(/[\r\n]+/g,' ').slice(0,180),date=new Date(d.date+'T12:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==d.date)invalid();
 const dateText=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'full'}).format(date),partyText=d.party+' personne'+(d.party>1?'s':'');
 const lines=[restaurant,subject,'Référence : '+r.reference,dateText+' à '+d.time+' · '+partyText];
 if(job.event==='pending'){const at=new Date(r.deadline);if(!Number.isFinite(at.getTime()))invalid();lines.push('Aucune confirmation n’est acquise pour cette demande. Réponse attendue avant '+new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}).format(at)+'.');}
 if(b&&['pending','rejected','expired'].includes(job.event))lines.push('Votre réservation initiale reste conservée. Retrouvez son récapitulatif à jour avec votre lien personnel.');
 if(job.event==='confirmed')lines.push('Votre table est réservée. Retrouvez les informations à jour avec votre lien personnel.');
 if(job.event==='cancelled')lines.push('L’annulation est enregistrée. Vous pouvez consulter son récapitulatif avec votre lien personnel.');
 const information=lines.slice(4),publicInfo=job.restaurantProfile||{},address=typeof publicInfo.address==='string'?publicInfo.address.trim().slice(0,300):'',phone=typeof publicInfo.phone==='string'?publicInfo.phone.trim().slice(0,40):'';
 const digits=(phone.startsWith('+')?phone.replace(/\(0\)/g,''):phone).replace(/[^0-9]/g,''),tel=/^\+?[0-9 ().-]+$/.test(phone)&&digits.length>=6&&digits.length<=15?'tel:'+(phone.startsWith('+')?'+':'')+digits:null;
 if(address)lines.push('Adresse : '+address);if(tel)lines.push('Téléphone : '+phone);
 lines.push('Consulter ou gérer votre réservation : '+url.href,'Ce lien est personnel. Ne le partagez pas. Aucun compte n’est nécessaire.');
 const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(subject)+'</title></head><body style="margin:0;background:#f4f7f2;color:#183f33;font:16px/1.65 Arial,sans-serif;overflow-wrap:anywhere;word-break:break-word"><table role="presentation" style="width:100%;border:0;border-collapse:collapse"><tr><td style="padding:24px 12px"><table role="presentation" style="width:100%;max-width:560px;margin:auto;border:1px solid #dce7df;border-radius:20px;border-collapse:separate;background:#fff"><tr><td style="padding:26px"><p style="margin:0 0 12px;font-size:14px;font-weight:bold;color:#146c55">'+esc(restaurant)+'</p><h1 style="margin:0 0 12px;font-size:25px;line-height:1.3">'+esc(subject)+'</h1><p style="margin:0 0 20px;color:#536b5d;font-size:13px">Référence : '+esc(r.reference)+'</p><table role="presentation" style="width:100%;border:1px solid #dce7df;border-radius:14px;background:#f1f6f1"><tr><td style="padding:16px"><p style="margin:0;font-weight:bold">'+esc(dateText)+'</p><p style="margin:5px 0 0">'+esc(d.time)+' · '+esc(partyText)+'</p></td></tr></table>'+information.map(line=>'<p style="margin:18px 0;white-space:pre-line">'+esc(line)+'</p>').join('')+'<p style="margin:24px 0"><a href="'+esc(url.href)+'" style="display:inline-block;box-sizing:border-box;padding:14px 20px;border-radius:12px;background:#146c55;color:white;font-weight:bold;text-decoration:none;max-width:100%;text-align:center">Consulter ma réservation</a></p>'+((address||tel)?'<div style="border-top:1px solid #dce7df;padding-top:16px;margin-top:20px"><p style="margin:0 0 8px;font-weight:bold">Votre restaurant</p>'+(address?'<p style="margin:6px 0;white-space:pre-line">'+esc(address)+'</p>':'')+(tel?'<p style="margin:6px 0"><a href="'+tel+'" style="color:#146c55">'+esc(phone)+'</a></p>':'')+'</div>':'')+'<p style="margin:22px 0 0;font-size:13px;color:#536b5d">Ce lien est personnel. Ne le partagez pas. Aucun compte n’est nécessaire.</p><p style="margin:14px 0 0;font-size:12px;color:#536b5d">Réservation gérée avec RestoManager · Aucune inscription publicitaire.</p></td></tr></table></td></tr></table></body></html>';
 return {to:job.email,subject:subject+' — '+restaurant,text:lines.filter(Boolean).join('\n\n'),html};
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
  if(typeof apiKey!=='string'||!apiKey.trim()||typeof from!=='string'||!from.trim()||/[\r\n]/.test(from))throw Object.assign(Error('Email provider configuration missing'),{permanent:true});
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from,to:[message.to],subject:message.subject,text:message.text,html:message.html}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Object.assign(Error('Email provider rejected request'),{permanent:response.status>=400&&response.status<500&&![408,429].includes(response.status)});
  const body=await response.json();if(typeof body.id!=='string')throw Error('Email acknowledgment unavailable');return {id:body.id};
 };
}
