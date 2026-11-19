'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RestoPublicationModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const limits={maxParty:[1,50],pendingMinutes:[15,180],horizonDays:[1,180],leadMinutes:[0,1440],cancellationMinutes:[0,2880]};
 const slugPattern=/^[a-z0-9]+(-[a-z0-9]+)*$/;
 const validSlug=value=>typeof value==='string'&&value.length>=3&&value.length<=80&&slugPattern.test(value);
 const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
 const retentionMarker='[À COMPLÉTER : durée de conservation]',retentionLine=/^Durée de conservation : (.*)$/m;
 const hasDraftMarker=text=>/\[(?:À|A)\s+COMPL(?:É|E)TER\b[^\]]*\]/i.test(String(text||''));
 function privacyDefault(name=''){
  const restaurant=String(name||'').replace(/[\r\n]+/g,' ').trim().slice(0,180)||'L’établissement indiqué sur la page de réservation';
  return restaurant+' utilise les informations saisies pour préparer et gérer votre réservation et répondre à vos demandes. Ce traitement est nécessaire à la prestation que vous demandez. Les champs obligatoires permettent de traiter la réservation ; le téléphone et les demandes particulières sont facultatifs.\n\nLes données sont accessibles aux membres habilités de l’établissement et aux prestataires techniques nécessaires au fonctionnement de RestoManager. Des informations techniques limitées sont aussi utilisées pour protéger le formulaire contre les abus.\n\nDurée de conservation : '+retentionMarker+'\n\nVous pouvez demander l’accès, la rectification, l’effacement ou la limitation de vos données et, selon les conditions applicables, leur portabilité ou vous opposer au traitement. Pour exercer vos droits, utilisez le contact du restaurant indiqué ci-dessous. Vous pouvez également adresser une réclamation à la CNIL (www.cnil.fr).\n\nCette réservation ne crée aucune inscription publicitaire.';
 }
 function cancellationDefault(minutes=0){
  const duration=integer(minutes,0,2880)?minutes===0?'jusqu’à l’heure prévue de votre venue':minutes%60===0?'jusqu’à '+minutes/60+' heure'+(minutes===60?'':'s')+' avant votre venue':'jusqu’à '+minutes+' minutes avant votre venue':'[À COMPLÉTER : délai d’annulation]';
  return 'Vous pouvez consulter votre réservation avec votre lien personnel et l’annuler en ligne '+duration+'. Passé ce délai, contactez le restaurant. Merci de prévenir l’établissement en cas de retard ou si vous ne pouvez plus venir.\n\nÀ partir de 4 personnes, la demande attend l’accord du Restaurant jusqu’à l’échéance affichée dans le suivi. Elle n’est confirmée qu’après cet accord. Sans accord avant cette échéance, la demande expire.\n\nToute modification reste soumise aux disponibilités et aux possibilités indiquées dans votre suivi. Les demandes particulières ne sont pas garanties.';
 }
 const hasRetentionLine=text=>retentionLine.test(String(text||''));
 function retentionFrom(text){const value=String(text||'').match(retentionLine)?.[1]?.trim()||'';return hasDraftMarker(value)?'':value;}
 function withRetention(text,value){const duration=String(value||'').replace(/[\r\n]+/g,' ').trim().slice(0,160)||retentionMarker;return String(text||'').replace(retentionLine,()=> 'Durée de conservation : '+duration);}
 function validate(value,{opening=value.enabled===true}={}){
  const errors={};
  if(value.slug!==null&&value.slug!==''&&!validSlug(value.slug)||opening&&!validSlug(value.slug))errors.slug='Utilisez 3 à 80 caractères : lettres minuscules, chiffres et tirets entre les mots.';
  for(const [key,[min,max]]of Object.entries(limits))if(!(key==='maxParty'&&!opening&&value[key]===null)&&!integer(value[key],min,max))errors[key]={maxParty:'Choisissez un nombre entier de personnes entre 1 et 50.',pendingMinutes:'Choisissez un délai entre 15 et 180 minutes.',horizonDays:'Choisissez un horizon entre 1 et 180 jours.',leadMinutes:'Choisissez un délai entre 0 et 1 440 minutes.',cancellationMinutes:'Choisissez un délai entre 0 et 2 880 minutes.'}[key];
  for(const [key,min,max,label]of [['privacyContact',5,500,'le contact pour les données personnelles'],['privacyNotice',30,3000,'les informations de confidentialité'],['cancellationNotice',20,1500,'les conditions d’annulation']]){
   const text=value[key];if(typeof text!=='string'||text.length>max||opening&&text.trim().length<min)errors[key]='Renseignez '+label+' ('+(opening?min+' à ':'')+max+' caractères maximum).';
   if(opening&&hasDraftMarker(text))errors[key]=key==='privacyNotice'?'Complétez la durée de conservation du modèle ou adaptez les informations de confidentialité.':'Complétez les éléments du modèle avant d’ouvrir les réservations.';
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
 return Object.freeze({limits:Object.freeze(limits),validSlug,validate,fromForm,readiness,publicURL,qrMatrix,privacyDefault,cancellationDefault,hasDraftMarker,hasRetentionLine,retentionFrom,withRetention});
});
