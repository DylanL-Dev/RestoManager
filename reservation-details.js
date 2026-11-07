// Compatible with existing reservations.notes: legacy allergy lines stay readable.
const allergyLabel='ALLERGIES À VÉRIFIER : ';
const hotelTag='[RESTOMANAGER:HOTEL]';
const exteriorTag='[RESTOMANAGER:EXTERIEUR]';
export function encodeBookingDetails({notes='',allergies='',type}={}){
 const cleanNotes=String(notes||'').trim().slice(0,1000);
 const cleanAllergies=String(allergies||'').trim().replace(/\s*\n\s*/g,', ').slice(0,500);
 return [cleanNotes,cleanAllergies?allergyLabel+cleanAllergies:'',type==='hotel'?hotelTag:type==='exterieur'?exteriorTag:''].filter(Boolean).join('\n');
}
export function decodeBookingDetails(raw='',hotelRoom=''){
 const lines=String(raw||'').split(/\r?\n/),notes=[];
 let allergies='',isHotel=Boolean(String(hotelRoom||'').trim());
 for(const line of lines){
  if(line.trim()===hotelTag){isHotel=true;continue;}
  if(line.trim()===exteriorTag){continue;}
  if(line.startsWith(allergyLabel)){allergies=line.slice(allergyLabel.length).trim();continue;}
  notes.push(line);
 }
 return {notes:notes.join('\n').trim(),allergies,type:isHotel?'hotel':'exterieur'};
}
