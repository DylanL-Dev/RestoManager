'use strict';
/* RM-017.3.1 DEV — completely local, fictional lifecycle model.
 * No backend, user creation, storage, invitations, email or real deletion. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RM0173Pilot=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 const empty=()=>Object.freeze({account:'none',restaurant:'none',profile:null,events:Object.freeze([])});
 const clean=(value,max)=>String(value||'').trim().replace(/\s+/g,' ').slice(0,max);
 function validSiret(value){
  if(!/^\d{14}$/.test(value))return false;
  const digits=Array.from(value,Number);
  let sum=0;
  for(let i=0;i<digits.length;i++){
   const double=(digits.length-i)%2===0;
   const d=double?digits[i]*2:digits[i];
   sum+=d>9?d-9:d;
  }
  return sum%10===0;
 }
 function validate(form){
  const errors={};
  if(!['independent','hotel'].includes(form.type))errors.type='Choisissez une activité.';
  if(clean(form.name,91).length<2||String(form.name||'').trim().length>90)errors.name='Indiquez un nom de 2 à 90 caractères.';
  if(!validSiret(clean(form.siret,30)))errors.siret='Utilisez 14 chiffres et une clé SIRET valide (la démonstration ne consulte pas le registre).';
  const email=clean(form.email,161);
  if(email.length>160||!/^\S+@\S+\.\S+$/.test(email))errors.email='Indiquez une adresse email de format valide.';
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
  const p=state.profile;
  let account=state.account,restaurant=state.restaurant,profile=p;
  if(action==='create'){
   if(restaurant!=='none')throw Error('Recommencez la démonstration pour créer un nouvel exemple.');
   const errors=validate(input||{});
   if(Object.keys(errors).length)throw Error(Object.values(errors)[0]);
   profile=Object.freeze({
    type:input.type,name:clean(input.name,90),siret:clean(input.siret,14),
    email:clean(input.email,160),fictional:true
   });
   account='active';restaurant='active';
  }else{
   if(!profile||restaurant==='erased')throw Error('Aucun établissement fictif actif.');
   switch(action){
    case 'request-account-delete':
     if(account!=='active')throw Error('Demande déjà enregistrée.');
     account='deletion_requested';break;
    case 'request-closure':
     if(restaurant!=='active')throw Error('Fermeture déjà demandée ou non disponible.');
     restaurant='closure_requested';break;
    case 'root-suspend':
     if(!['active','closure_requested'].includes(restaurant))throw Error('Suspension impossible dans cet état.');
     restaurant='suspended';break;
    case 'root-restore':
     if(restaurant!=='suspended')throw Error('Réactivation impossible dans cet état.');
     restaurant='active';break;
    case 'root-archive':
     if(restaurant!=='suspended')throw Error('Suspendez d’abord cet établissement avant son archivage.');
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
