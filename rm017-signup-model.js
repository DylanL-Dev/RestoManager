'use strict';
/* RM-017.1: display-only, isolated first-setup draft. No account, storage, SDK or network. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object' && module.exports)module.exports=api;
 else root.RestoSignupDraft=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 const types=Object.freeze({
  independent:Object.freeze({label:'Restaurant indépendant',icon:'utensils',description:'Un accueil et des réservations adaptés à votre restaurant.',features:Object.freeze(['Salles et tables','Horaires et disponibilités','Portail de réservation dédié'])}),
  hotel:Object.freeze({label:"Restaurant d’hôtel",icon:'hotel',description:"Une organisation pensée pour les clients de l’hôtel et les visiteurs extérieurs.",features:Object.freeze(['Accueil Hôtel / Extérieur','Numéros de chambre','Salles et réservations en temps réel'])})
 });
 const limits=Object.freeze({name:90,city:80,email:160});
 const normalize=value=>String(value??'').trim().replace(/\s+/g,' ');
 // Format-only check to help the professional before the final step. The
 // actual establishment proof is ALWAYS verified by the DEV server registry.
 function validSiret(value){
  if(typeof value!=='string'||!/^[0-9]{14}$/.test(value))return false;
  const digits=[...value].map(Number);
  const checksum=digits.reduce((sum,d,i)=>{
   const n=i%2===0?d*2:d;
   return sum+(n>9?n-9:n);
  },0);
  // Historic La Poste exception, identical to the official Edge gateway.
  return checksum%10===0||(value.startsWith('356000000')&&digits.reduce((a,b)=>a+b,0)%5===0);
 }
 function validateType(value){return Object.hasOwn(types,value)?null:"Choisissez le type d’établissement pour continuer.";}
 function validateDetails(value){
  const v=value||{},errors={};
  const name=normalize(v.name),city=normalize(v.city),email=String(v.email||'').trim();
  if(!name||name.length<2||name.length>limits.name)errors.name='Indiquez un nom de 2 à 90 caractères.';
  if(!city||city.length<2||city.length>limits.city)errors.city='Indiquez une ville de 2 à 80 caractères.';
  if(!email||email.length>limits.email||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))errors.email='Indiquez une adresse email au format valide.';
  return errors;
 }
 function preview(type,value){
  if(validateType(type)||Object.keys(validateDetails(value)).length)throw Error('Le brouillon est incomplet.');
  return Object.freeze({type,label:types[type].label,icon:types[type].icon,name:normalize(value.name),city:normalize(value.city),email:String(value.email).trim(),features:types[type].features,fictional:true,registered:false});
 }
 return Object.freeze({types,limits,validateType,validateDetails,validSiret,preview,normalize});
});
