'use strict';
(function(root){
 const messages={
  STALE_VERSION:'Cette réservation a été modifiée par un collègue. Votre saisie est conservée ; consultez les informations actualisées avant de reprendre.',
  ROOM_REQUIRED:'Indiquez le numéro de chambre du client hôtel.',
  ROOM_CONFLICT:'Cette chambre possède déjà une réservation sur ce créneau. Vérifiez le numéro ou l’horaire.',
  TABLE_CONFLICT:'La table vient d’être attribuée. Vérifiez les disponibilités puis choisissez une autre table.',
  HOLD_CONFLICT:'Cette table est temporairement maintenue par un autre collaborateur.',
  HOLD_EXPIRED:'Le maintien a expiré. Revérifiez la disponibilité avant de confirmer.',
  FORBIDDEN:'Votre compte ne permet pas cette action.',
  OUTSIDE_SERVICE:'Cet horaire est en dehors des services ouverts.',
  NO_COMPATIBLE_TABLE:'Aucune table compatible avec ce nombre de couverts n’est disponible sur ce créneau.',
  INVALID_INPUT:'Vérifiez les informations saisies avant de réessayer.',
  SYNC_BUSY:'Des modifications sont en cours. Patientez pendant l’actualisation des disponibilités.',
  SYNC_CONTRACT:'La mise à jour du service doit être finalisée par le responsable. Votre saisie est conservée.',
  CAPABILITY_REQUIRED:'Le service de réservation doit être mis à jour par le responsable. Votre saisie est conservée.',
  RESULT_UNKNOWN:'La confirmation n’a pas pu être vérifiée. Votre saisie est conservée ; une vérification est nécessaire avant toute nouvelle réservation.',
  PGRST202:'Le service doit être mis à jour par le responsable. Votre saisie est conservée.',
  PGRST301:'Votre session a expiré. Reconnectez-vous pour continuer.',
  '42501':'Votre compte ne permet pas cette action.',
  RM001:'Cette réservation a été modifiée par un collègue. Votre saisie est conservée.',
  '23P01':'La table ou la chambre n’est plus disponible sur ce créneau. Actualisez les disponibilités.'
 };
 function category(error){const detail=String(error?.details||'').trim();return Object.hasOwn(messages,detail)?detail:String(error?.code||'')}
 function message(error,fallback='Cette opération n’a pas pu être confirmée. Vérifiez la connexion et réessayez.'){
  if(/Le restaurant est fermé le (samedi|dimanche) midi/i.test(String(error?.message||'')))return 'Restaurant fermé le samedi ou dimanche midi. Choisissez un créneau ouvert.';
  return error?.business===true?String(error.message):messages[category(error)]||fallback;
 }
 function business(text,code='INVALID_INPUT'){return Object.assign(new Error(text),{code,business:true})}
 function diagnostic(context,error){
  // No message, query, request, key, client name, room or notes in diagnostics.
  const code=category(error).replace(/[^A-Z0-9_]/gi,'').slice(0,40)||'UNKNOWN';
  console.warn('[RestoManager]',String(context).replace(/[^a-z0-9_-]/gi,'').slice(0,40),code);
 }
 const api={message,business,diagnostic};root.RestoErrors=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
