'use strict';
/* RM-017.3.1: in-memory and fictional lifecycle. No Auth, database or network. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RM0173Pilot=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 const empty=()=>Object.freeze({account:'none',restaurant:'none',profile:null,events:Object.freeze([])});
 const clean=(value,max)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
 function validSiret(value){
  if(!/^\d{14}$/.test(value))return false;
  let sum=0;
  for(let i=0;i<14;i++){
   const n=Number(value[i]),digit=(i%2===0?n*2:n);
   sum+=digit>9?digit-9:digit;
  }
  return sum%10===0;
 }
 function validate(form){
  const errors={};
  if(!form||typeof form!=='object')return {form:'Le formulaire de simulation est incomplet.'};
  if(!['independent','hotel'].includes(form.type))errors.type='Choisissez le type de restaurant.';
  const name=clean(form.name,91),siret=clean(form.siret,30),email=clean(form.email,161);
  if(name.length<2||name.length>90)errors.name='Le nom doit comporter de 2 à 90 caractères.';
  if(!validSiret(siret))errors.siret='SIRET fictif de 14 chiffres avec une clé de contrôle valide requis.';
  if(email.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))errors.email='Indiquez un email fictif au format valide.';
  return errors;
 }
 const maskSiret=value=>'••••••••••'+String(value||'').slice(-4);
 const maskEmail=value=>{
  const [local,domain]=String(value||'').split('@');
  return local&&domain?local.slice(0,2)+'•••@'+domain:'';
 };
 function next(state,action,input){
  if(!state||typeof state!=='object')throw Error('État de démonstration inconnu.');
  if(action==='reset')return empty();
  let account=state.account,restaurant=state.restaurant,profile=state.profile;
  if(action==='create'){
   if(account!=='none'||restaurant!=='none'||profile)throw Error('Recommencez la simulation pour créer un autre exemple.');
   const errors=validate(input);
   if(Object.keys(errors).length)throw Error(Object.values(errors)[0]);
   const siret=clean(input.siret,14);
   profile=Object.freeze({type:input.type,name:clean(input.name,90),siret,siren:siret.slice(0,9),email:clean(input.email,160),fictional:true});
   account='pending_email';
  }else if(action==='confirm-email'){
   if(account!=='pending_email'||!profile)throw Error('Aucun email fictif à confirmer.');
   account='active';restaurant='active';
  }else{
   if(!profile||restaurant==='erased'||account==='none'||account==='pending_email')throw Error('Terminez d’abord la simulation d’inscription.');
   switch(action){
    case 'request-account-delete':
     if(account!=='active')throw Error('La demande de suppression du compte est déjà enregistrée.');
     account='deletion_requested';break;
    case 'request-closure':
     if(restaurant!=='active')throw Error('La fermeture est déjà demandée ou indisponible.');
     restaurant='closure_requested';break;
    case 'root-suspend':
     if(!['active','closure_requested'].includes(restaurant))throw Error('Suspension impossible à cette étape.');
     restaurant='suspended';break;
    case 'root-restore':
     if(restaurant!=='suspended')throw Error('Seul un établissement suspendu peut être réactivé.');
     restaurant='active';break;
    case 'root-archive':
     if(restaurant!=='suspended')throw Error('Suspendez l’établissement avant son archivage.');
     restaurant='archived';break;
    case 'root-erase':
     if(restaurant!=='archived')throw Error('L’archivage préalable est obligatoire.');
     restaurant='erased';account='deleted';profile=null;break;
    default:throw Error('Action de simulation inconnue.');
   }
  }
  return Object.freeze({account,restaurant,profile,events:Object.freeze([...state.events,action])});
 }
 return Object.freeze({empty,validate,validSiret,maskSiret,maskEmail,next});
});
