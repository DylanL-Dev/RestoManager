// Native V3 -> Supabase reservation creation. No direct table inserts or local writes.
import {loadSharedService} from './supabase-service-bridge.js';
import {confirmReservation} from './supabase-reservation-actions.js';
function parisDateTime(date,time){
 const value=date+'T'+time+':00';
 const guess=Date.parse(value+'Z');
 if(!Number.isFinite(guess))throw Error('Date ou heure incorrecte');
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',timeZoneName:'shortOffset',hour:'2-digit'}).formatToParts(new Date(guess));
 const zone=parts.find(p=>p.type==='timeZoneName')?.value||'';
 const m=/GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(zone);
 if(!m)throw Error('Fuseau horaire de Paris indisponible');
 const offset=(m[1]==='+'?1:-1)*(Number(m[2])*60+Number(m[3]||0));
 const utc=new Date(guess-offset*60000);
 const actual=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(utc).replace(' ','T');
 if(actual!==date+'T'+time)throw Error('Horaire inexistant lors du changement d’heure');
 return utc.toISOString();
}
export async function createSharedBooking(candidate){
 const snapshot=await loadSharedService();
 const byNumber=new Map(snapshot.tables.filter(t=>t.active).map(t=>[Number(String(t.label).trim().replace(/^table\s*/i,'')),t]));
 const tableIds=candidate.tables.map(n=>{
  const table=byNumber.get(Number(n));
  if(!table)throw Error('Table '+n+' absente de Supabase : vérifier la configuration des salles');
  return table.id;
 });
 if(new Set(tableIds).size!==tableIds.length)throw Error('Sélection de tables invalide');
 const startsAt=parisDateTime(candidate.date,candidate.time);
 const endsAt=new Date(Date.parse(startsAt)+Number(candidate.duration||90)*60000).toISOString();
 const name=candidate.client.trim();
 if(!name)throw Error('Nom ou chambre requis');
 const hotelRoom=candidate.type==='hotel'&&/^\d{1,6}[A-Za-z]?$/.test(name)?name:null;
 const notes=[candidate.notes,candidate.allergies?'ALLERGIES À VÉRIFIER : '+candidate.allergies:''].filter(Boolean).join('\n');
 return confirmReservation({guestName:name,hotelRoom,partySize:Number(candidate.guests),startsAt,endsAt,tableIds,notes});
}
window.RestoCreateSharedBooking=createSharedBooking;
