'use strict';
let serviceTableNumber = null;
let serviceTableTrigger = null;
function tableServiceReservations(number) {
    return reservations.filter(r => r.date === getServiceDate() && r.tables.includes(number) && ReservationEngine.isBlocking(r))
        .sort((a,b) => (b.status === STATUS.SEATED)-(a.status === STATUS.SEATED) || (b.status === STATUS.ARRIVED)-(a.status === STATUS.ARRIVED) || a.time.localeCompare(b.time));
}
function serviceEndTime(r) {
    const [h,m]=r.time.split(':').map(Number), total=h*60+m+Number(r.duration||90);
    return String(Math.floor(total/60)%24).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
function closeTableService() {
    el('tableServiceModal').classList.add('hidden');
    serviceTableNumber=null; afficherTables();
    const buttons=Array.from(el('tablesGrid').children);
    const target=buttons.find(b=>b.getAttribute('data-table-number')===String(serviceTableTrigger));
    if(target)target.focus();
}
function serviceButton(label,action,primary=false,disabled=false) {
    const b=document.createElement('button');b.type='button';b.className='btn '+(primary?'btn-primary':'btn-secondary');b.textContent=label;b.disabled=disabled;
    b.addEventListener('click',action);return b;
}
function renderTableService() {
    const table=FloorPlan.get().tables.find(t=>t.number===serviceTableNumber);
    if(!table){closeTableService();return;}
    const room=FloorPlan.get().rooms.find(r=>r.id===table.roomId), list=tableServiceReservations(table.number), current=list[0];
    el('tableServiceTitle').textContent='Table '+table.number+(table.letter||'');
    el('tableServiceRoom').textContent=room.name+' · '+table.capacity+' places';
    const body=el('tableServiceContent');body.replaceChildren();
    const state=document.createElement('p');state.className='service-status';state.textContent=current?texteStatut(current.status):'Libre';body.append(state);
    if(current){
        const card=document.createElement('section');card.className='service-booking';
        card.innerHTML='<h3>Réservation du service</h3><strong>'+escapeHTML(current.type==='hotel'?'Chambre '+current.client:current.client)+'</strong><p>'+escapeHTML(current.time)+' – '+serviceEndTime(current)+' · '+current.guests+' personnes</p><p>'+escapeHTML(current.tables.map(n=>FloorPlan.label(n)).join(', '))+'</p>';
        body.append(card);
        const actions=document.createElement('div');actions.className='service-actions';
        const update=fn=>{fn(current.id);renderTableService();};
        const arrived=current.status===STATUS.ARRIVED,seated=current.status===STATUS.SEATED;
        actions.append(serviceButton('✓ Client arrivé',()=>update(clientArrive),!arrived&&!seated,arrived||seated));
        actions.append(serviceButton('Installer à table',()=>update(installerClient),arrived,!arrived));
        actions.append(serviceButton('Libérer la table',()=>update(libererTables),seated,!seated));
        body.append(actions);
        const edit=document.createElement('div');edit.className='service-edit-actions';
        const modify=()=>{closeTableService();modifierReservationDepuisListe(current.id);};
        edit.append(serviceButton('Modifier',modify));
        edit.append(serviceButton('Changer de table',()=>{modify();el('tableSelection').scrollIntoView({block:'nearest'});}));
        body.append(edit);
        if(list.length>1){
            const heading=document.createElement('h3');heading.textContent='Ensuite sur cette table';body.append(heading);
            list.slice(1).forEach(r=>body.append(serviceButton(r.time+' · '+(r.type==='hotel'?'Chambre ':'')+r.client+' · '+r.guests+' personnes',()=>{closeTableService();voirReservation(r.id);})));
        }
    }else{
        const empty=document.createElement('p');empty.className='service-empty';empty.textContent='Aucune réservation prévue pour cette table sur ce service.';body.append(empty);
    }
    body.append(serviceButton('+ Nouvelle réservation',()=>{const number=serviceTableNumber;closeTableService();nouvelleReservation([number]);},!current));
}
cliquerTable = function(number) {
    serviceTableNumber=number;serviceTableTrigger=number;
    renderTableService();el('tableServiceModal').classList.remove('hidden');afficherTables();el('closeTableServiceBtn').focus();
};
const refreshBeforeTableService=refreshUI;
refreshUI=function(){refreshBeforeTableService();if(serviceTableNumber!==null)renderTableService();};
document.addEventListener('DOMContentLoaded',()=>{
    el('closeTableServiceBtn').addEventListener('click',closeTableService);
    el('tableServiceModal').addEventListener('click',event=>{if(event.target===el('tableServiceModal'))closeTableService();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&serviceTableNumber!==null)closeTableService();});
});
