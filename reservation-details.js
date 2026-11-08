// Compatible with existing reservations.notes: legacy allergy lines stay readable.
const allergyLabel='ALLERGIES À VÉRIFIER : ';
const hotelTag='[RESTOMANAGER:HOTEL]';
const exteriorTag='[RESTOMANAGER:EXTERIEUR]';
export function encodeBookingDetails({notes='',allergies='',type}={}){
 // Entry limits are validated by the forms/model. Encoding must never truncate
 // unchanged historical notes when another reservation field is edited.
 const cleanNotes=String(notes||'').trim();
 const cleanAllergies=String(allergies||'').trim().replace(/\s*\n\s*/g,', ');
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
