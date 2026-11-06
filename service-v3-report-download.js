'use strict';
(function(){
const button=document.getElementById('historyPdf');if(!button)return;
const pad=n=>String(n).padStart(2,'0'),fmt=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
button.addEventListener('click',async()=>{
const feedback=document.getElementById('historyFeedback');
try{
button.disabled=true;button.textContent='Préparation du PDF…';feedback.textContent='Génération du rapport en cours…';
if(!window.jspdf?.jsPDF){
 const sources=['https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js','https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js'];
 for(const src of sources){try{await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Chargement impossible'));document.head.append(script)});if(window.jspdf?.jsPDF)break}catch(error){console.warn('Module PDF :',error)}}
}
if(!window.jspdf?.jsPDF)throw Error('Le générateur PDF ne se charge pas. Vérifiez la connexion Internet.');
const dateInput=document.getElementById('historyDate').value,period=document.getElementById('historyPeriod').value,d=new Date(dateInput+'T12:00:00');if(Number.isNaN(d.getTime()))throw Error('Date invalide');
let start=new Date(d),end=new Date(d);
if(period==='week'){start.setDate(start.getDate()-(start.getDay()+6)%7);end=new Date(start);end.setDate(end.getDate()+6)}
if(period==='month'){start=new Date(d.getFullYear(),d.getMonth(),1,12);end=new Date(d.getFullYear(),d.getMonth()+1,0,12)}
const from=fmt(start),to=fmt(end),records=ReservationEngine.normalizeReservations(window.RestoSharedReservations||JSON.parse(localStorage.getItem('restomanager_reservations')||'[]')).filter(r=>r.date>=from&&r.date<=to).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
const shifts=ReservationEngine.getShifts();
const metrics=window.RestoReportMetrics.calculate(records,shifts);
const {served,covers,inRoomCovers,welcomedCovers,walkinPassages,hotelCovers,walkinCovers,lunch,dinner,other,pendingCount,serviceDays,noShowCount,cancelledCount}=metrics;
const hotel=hotelCovers,walkins=walkinCovers,noShow=noShowCount,cancelled=cancelledCount,pending=pendingCount,days=serviceDays;
const frenchDate=value=>new Date(value+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const sum=arr=>arr.reduce((n,r)=>n+r.guests,0);
const title=period==='month'?'Rapport mensuel':period==='week'?'Rapport hebdomadaire':'Rapport journalier';
const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4'});let y=18;
function text(t,x,yy,size=11,bold=false){pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.text(String(t),x,yy)}
function page(){if(y>265){pdf.addPage();y=20}}
pdf.setFillColor(8,127,91);pdf.rect(0,0,210,32,'F');pdf.setTextColor(255,255,255);text('RestoManager',16,16,20,true);text('Simplifiez votre service',16,24,10);pdf.setTextColor(28,58,47);
y=45;text(title,16,y,20,true);y+=9;text(from===to?frenchDate(from):'Du '+frenchDate(from)+' au '+frenchDate(to),16,y,11);y+=7;text('Édité le '+new Date().toLocaleString('fr-FR'),16,y,9);y+=14;
text('Synthèse du service',16,y,14,true);y+=9;
const metrics=[['TOTAL PERSONNES ACCUEILLIES',welcomedCovers],['Dont repas terminés',covers],['Dont encore en salle',inRoomCovers],['Installations terminées',served.length],['Couverts hôtel (terminés)',hotel],['Couverts extérieurs (terminés)',covers-hotel],['Sans réservation (déjà inclus)',walkins+' pers. / '+walkinPassages+' install.'],['Absences',noShow],['Annulations',cancelled]];
for(let i=0;i<metrics.length;i++){const col=i%2,row=Math.floor(i/2),x=16+col*92,yy=y+row*24;pdf.setDrawColor(215,232,221);pdf.roundedRect(x,yy,86,20,2,2);text(metrics[i][0],x+4,yy+7,9);pdf.setTextColor(8,127,91);text(metrics[i][1],x+4,yy+16,15,true);pdf.setTextColor(28,58,47)}y+=127;
if(y>190){pdf.addPage();y=22}
// Répartition graphique des couverts
y+=3;text('Répartition de la clientèle',16,y,13,true);y+=8;
const hotelPct=covers?hotel/covers:0,externalPct=covers?100*(covers-hotel)/covers:0;
pdf.setFillColor(227,235,229);pdf.roundedRect(16,y,178,9,2,2,'F');
if(covers){pdf.setFillColor(8,127,91);pdf.rect(16,y,178*hotelPct,9,'F');pdf.setFillColor(209,159,71);pdf.rect(16+178*hotelPct,y,178*(1-hotelPct),9,'F')}
y+=16;pdf.setFillColor(8,127,91);pdf.circle(19,y-1,2,'F');text('Hôtel : '+hotel+' ('+(hotelPct*100).toFixed(1)+' %)',24,y,10);
pdf.setFillColor(209,159,71);pdf.circle(110,y-1,2,'F');text('Extérieurs : '+(covers-hotel)+' ('+externalPct.toFixed(1)+' %)',115,y,10);y+=15;
text('Bilan du service',16,y,13,true);y+=8;
const summary='Au total, '+welcomedCovers+' couverts accueillis : '+covers+' servis et terminés et '+inRoomCovers+' encore en salle. '+served.length+' tables ou groupes terminés. Les '+walkins+' personnes sans réservation ('+walkinPassages+' installations) sont déjà incluses dans les couverts terminés. '+noShow+' absence(s) et '+cancelled+' annulation(s).';
const lines=pdf.splitTextToSize(summary,178);for(const line of lines){page();text(line,16,y,10);y+=5}y+=9;
if(period==='month'){text('Moyenne par jour avec service : '+(days?(covers/days).toFixed(1):'0')+' couverts ('+days+' jours)',16,y,10);y+=10}
if(pending){pdf.setTextColor(155,93,22);text('Rapport provisoire : '+pending+' réservation(s) non finalisée(s).',16,y,10);pdf.setTextColor(28,58,47);y+=10}
y+=4;text('Répartition par service',16,y,13,true);y+=9;
text('Midi ('+shifts.lunch.start+' – '+shifts.lunch.end+') : '+sum(lunch)+' couverts, '+lunch.length+' installations',16,y,10);y+=7;
text('Soir ('+shifts.dinner.start+' – '+shifts.dinner.end+') : '+sum(dinner)+' couverts, '+dinner.length+' installations',16,y,10);y+=8;
if(other.length){text('Autres horaires : '+sum(other)+' couverts, '+other.length+' installations',16,y,10);y+=8}
y+=5;text('Détail par journée',16,y,14,true);y+=10;
pdf.setFillColor(236,247,240);pdf.rect(16,y-6,178,9,'F');text('Date',19,y,10,true);text('Couverts',80,y,10,true);text('Installations',120,y,10,true);text('Absences',158,y,10,true);y+=10;
const dates=[...new Set(records.map(r=>r.date))].sort();
for(const date of dates){page();const all=records.filter(r=>r.date===date),done=all.filter(r=>['completed','released'].includes(r.status));text(new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}),19,y,10);text(done.reduce((n,r)=>n+r.guests,0),80,y,10);text(done.length,120,y,10);text(all.filter(r=>r.status==='no_show').length,158,y,10);pdf.setDrawColor(227,235,229);pdf.line(16,y+3,194,y+3);y+=11}
if(!dates.length){text('Aucune donnée pour cette période.',19,y,10);y+=12}
page();y+=8;pdf.setTextColor(100,119,108);for(const line of pdf.splitTextToSize((window.RestoSharedReservations?'Données synchronisées avec Supabase. ':'Données de ce navigateur uniquement. ')+'Couverts accueillis = terminés + installés en salle. Les clients attendus et les absents ne sont pas comptés comme accueillis. Les couverts sans réservation sont inclus dans les couverts terminés.',175)){text(line,16,y,9);y+=5}
pdf.save('RestoManager-'+period+'-'+from+'-'+to+'.pdf');
feedback.textContent='Rapport PDF généré et téléchargé.';
}catch(e){feedback.textContent='Export PDF impossible : '+e.message;window.RestoDialog.alert(feedback.textContent,{title:'Export PDF impossible'})}finally{button.disabled=false;button.textContent='Télécharger le PDF'}
});
})();