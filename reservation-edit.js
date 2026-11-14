'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.ReservationEdit=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function capture(record){
  return Object.freeze({...record,tables:Object.freeze((record.tables||[]).slice())});
 }
 function requireVersion(value){
  if(typeof value!=='string'||!(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i).test(value)){
   const message='Actualisez la page puis rouvrez la réservation avant de la modifier.';
   throw typeof globalThis.RestoErrors?.business==='function'?globalThis.RestoErrors.business(message,'RM002'):Object.assign(Error(message),{code:'RM002'});
  }
  return value;
 }
 const limits=Object.freeze({notes:1000,allergies:500});
 function detail(base,field,value){
  const previous=String(base?.[field]||''),entered=String(value||'');
  // Older records can exceed today's entry limits. An unrelated edit must
  // preserve them verbatim, rather than silently removing service information.
  if(entered===previous)return previous;
  const cleaned=entered.trim();
  if(cleaned.length>limits[field]){
   const message=(field==='notes'?'Les notes':'Les allergies')+' dépassent '+limits[field]+' caractères. Raccourcissez ce champ pour enregistrer ; votre saisie est conservée.';
   const error=typeof globalThis.RestoErrors?.business==='function'?globalThis.RestoErrors.business(message,'RM003'):Object.assign(Error(message),{code:'RM003'});
   throw error;
  }
  return cleaned;
 }
 function candidate(base,values){
  const hotelRoom=base.type==='hotel'?String(values.hotelRoom||'').trim():'';
  let client=String(values.client||'').trim();
  // Old hotel bookings use the room as guest_name. Follow that alias when the
  // room alone changes, but never replace an actual guest name.
  if(base.type==='hotel'&&hotelRoom&&base.client===base.hotelRoom&&client===base.client)client=hotelRoom;
  if(!client&&base.type==='exterieur')throw (globalThis.RestoErrors?.business?.('Le nom du client extérieur est obligatoire.')||Error('Nom du client extérieur obligatoire'));
  if(!client)client='Chambre '+(hotelRoom||'non renseignée');
  return {...base,client,hotelRoom,date:values.date,time:values.time,guests:Number(values.guests),
   tables:(values.tables||[]).slice(),notes:detail(base,'notes',values.notes),
   allergies:detail(base,'allergies',values.allergies)};
 }
 return {capture,requireVersion,candidate,detail,limits,isConflict:error=>error?.code==='RM001'};
});
