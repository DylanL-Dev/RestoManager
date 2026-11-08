'use strict';
(function(root){
 const messages={syncing:'Synchronisation des disponibilités en cours…',offline:'Connexion interrompue. Disponibilités à revérifier.',error:'Les disponibilités n’ont pas pu être actualisées. Vérifiez la connexion.',checking:'Vérification du maintien en cours…',invalid:'Renseignez la date, l’heure et le nombre de couverts.',out_of_service:'Horaire hors service.',incompatible_capacity:'Aucune table ou fusion autorisée compatible avec ce nombre de couverts.',temporary_hold:'Les tables compatibles sont temporairement maintenues par un autre collaborateur.',room_conflict:'Cette chambre possède déjà une réservation qui chevauche ce créneau.',fully_booked:'Toutes les tables compatibles sont réservées sur ce créneau.',available:'Tables disponibles.'};
 function evaluate({connected=false,online=true,ready=true,syncState,checking=false,validInput=true,inHours=true,choices=[],assess}){
  let state;
  if(connected&&!online)state='offline';
  else if(connected&&!ready)state=syncState==='error'?'error':'syncing';
  else if(!validInput)state='invalid';
  else if(!inHours)state='out_of_service';
  else if(checking)state='checking';
  else if(!choices.length)state='incompatible_capacity';
  if(state)return {state,message:messages[state],available:[]};
  const results=choices.map(choice=>({choice,...assess(choice)}));
  const available=results.filter(r=>r.valid&&!r.held).map(r=>r.choice);
  state=available.length?'available':results.some(r=>r.roomConflict)?'room_conflict':results.some(r=>r.valid&&r.held)?'temporary_hold':'fully_booked';
  return {state,message:messages[state],available};
 }
 function allowedAlternative(date,time,today,now){return date!==today||time>now}
 const api={evaluate,allowedAlternative};root.RestoAvailability=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
