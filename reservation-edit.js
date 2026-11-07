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
   throw Object.assign(Error('Actualisez la page puis rouvrez la réservation avant de la modifier.'),{code:'RM002'});
  }
  return value;
 }
 function candidate(base,values){
  const hotelRoom=base.type==='hotel'?String(values.hotelRoom||'').trim():'';
  let client=String(values.client||'').trim();
  // Old hotel bookings use the room as guest_name. Follow that alias when the
  // room alone changes, but never replace an actual guest name.
  if(base.type==='hotel'&&hotelRoom&&base.client===base.hotelRoom&&client===base.client)client=hotelRoom;
  return {...base,client,hotelRoom,date:values.date,time:values.time,guests:Number(values.guests),
   tables:(values.tables||[]).slice(),notes:String(values.notes||'').trim().slice(0,1000),
   allergies:String(values.allergies||'').trim().slice(0,500)};
 }
 return {capture,requireVersion,candidate,isConflict:error=>error?.code==='RM001'};
});
