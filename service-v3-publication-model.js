'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RestoPublicationModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const limits={maxParty:[1,50],pendingMinutes:[15,180],horizonDays:[1,180],leadMinutes:[0,1440],cancellationMinutes:[0,2880]};
 const slugPattern=/^[a-z0-9]+(-[a-z0-9]+)*$/;
 const validSlug=value=>typeof value==='string'&&value.length>=3&&value.length<=80&&slugPattern.test(value);
 const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
 function validate(value,{opening=value.enabled===true}={}){
  const errors={};
  if(value.slug!==null&&value.slug!==''&&!validSlug(value.slug)||opening&&!validSlug(value.slug))errors.slug='Utilisez 3 à 80 caractères : lettres minuscules, chiffres et tirets entre les mots.';
  for(const [key,[min,max]]of Object.entries(limits))if(!(key==='maxParty'&&!opening&&value[key]===null)&&!integer(value[key],min,max))errors[key]={maxParty:'Choisissez un nombre entier de personnes entre 1 et 50.',pendingMinutes:'Choisissez un délai entre 15 et 180 minutes.',horizonDays:'Choisissez un horizon entre 1 et 180 jours.',leadMinutes:'Choisissez un délai entre 0 et 1 440 minutes.',cancellationMinutes:'Choisissez un délai entre 0 et 2 880 minutes.'}[key];
  for(const [key,min,max,label]of [['privacyContact',5,500,'le contact pour les données personnelles'],['privacyNotice',30,3000,'les informations de confidentialité'],['cancellationNotice',20,1500,'les conditions d’annulation']]){
   const text=value[key];if(typeof text!=='string'||text.length>max||opening&&text.trim().length<min)errors[key]='Renseignez '+label+' ('+(opening?min+' à ':'')+max+' caractères maximum).';
  }
  return errors;
 }
 function fromForm(entries,enabled,version){
  const value={slug:entries.slug?.trim()||null,enabled:enabled===true,version};
  for(const name of Object.keys(limits)){const raw=String(entries[name]??'').trim();value[name]=raw?Number(raw):name==='maxParty'?null:NaN;}
  for(const name of ['privacyContact','privacyNotice','cancellationNotice'])value[name]=String(entries[name]??'');
  return value;
 }
 function readiness(settings){
  const errors=validate(settings,{opening:true});
  return [{key:'slug',label:'Adresse publique',ready:!errors.slug},{key:'maxParty',label:'Nombre de personnes',ready:!errors.maxParty},{key:'pendingMinutes',label:'Délais de réservation',ready:!['pendingMinutes','horizonDays','leadMinutes','cancellationMinutes'].some(k=>errors[k])},{key:'privacyNotice',label:'Confidentialité et contact',ready:!errors.privacyNotice&&!errors.privacyContact},{key:'cancellationNotice',label:'Conditions d’annulation',ready:!errors.cancellationNotice}];
 }
 function publicURL(base,slug){
  if(!validSlug(slug))throw Error('Invalid restaurant address');
  const parsed=new URL(base);if(parsed.username||parsed.password||parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname)))throw Error('Secure public origin required');
  const url=new URL('reservation/live.html',parsed);url.search='';url.hash='';url.searchParams.set('restaurant',slug);if(url.href.length>2048)throw Error('Public URL too long');return url.href;
 }
 function qrMatrix(url,generator){
  const parsed=new URL(url);if(parsed.href!==url||url.length>2048||parsed.username||parsed.password||parsed.hash||!parsed.pathname.endsWith('/reservation/live.html')||parsed.searchParams.size!==1||!validSlug(parsed.searchParams.get('restaurant'))||parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname)))throw Error('Only a canonical public restaurant URL can be shared');
  if(typeof generator!=='function')throw Error('QR generator unavailable');
  const qr=generator(0,'M');qr.addData(url,'Byte');qr.make();const count=qr.getModuleCount();return Array.from({length:count},(_,y)=>Array.from({length:count},(_,x)=>qr.isDark(y,x)));
 }
 return Object.freeze({limits:Object.freeze(limits),validSlug,validate,fromForm,readiness,publicURL,qrMatrix});
});
