export function paris(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
export function addDays(date,count){const d=new Date(date+'T12:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);}
export function dateLabel(date){return new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'full'}).format(new Date(date+'T12:00Z'));}
export function deadline(value){return new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}).format(new Date(value));}

export function relativeDateLabel(date,today){return (date===today?'Aujourd’hui · ':date===addDays(today,1)?'Demain · ':'')+dateLabel(date);}
