export function guestLabel(value={}){return value.guestType==='hotel'?'Client de l’hôtel · '+(value.hotelRoom?'Chambre '+value.hotelRoom:'Chambre à compléter'):'Client extérieur';}
export function guestErrors(value={}){
 const errors={},kind=value.guestType,room=String(value.hotelRoom||'').trim();
 if(!['hotel','external'].includes(kind))errors.guestType='Indiquez si vous séjournez à l’hôtel.';
 if(kind==='hotel'&&(value.roomPending||!room||room.length>20||! /^[\p{L}\p{N} ._-]+$/u.test(room)))errors.hotelRoom='Indiquez votre numéro de chambre pour réserver comme client de l’hôtel.';
 if(kind==='external'&&(room||value.roomPending))errors.hotelRoom='Vérifiez les informations de votre séjour.';
 return errors;
}
