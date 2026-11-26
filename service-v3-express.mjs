import {elapsedMinutes,findArrivals,isWaiting,liveSnapshot,parisTime,serviceIndicators,tableStatus} from './service-v3-express-data.mjs';

const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
const symbols=()=>window.lucide?.createIcons();
const labelFor=row=>row.hotelRoom?`Ch. ${row.hotelRoom} · ${row.client}`:row.client;
const covers=count=>`${count} couvert${count===1?'':'s'}`;

function element(tag,text='',className=''){
 const node=document.createElement(tag);
 node.textContent=text;
 if(className)node.className=className;
 return node;
}

function button(label,action,value){
 const node=element('button',label);
 node.type='button';node.dataset.action=action;
 if(value!==undefined){node.dataset.value=value;node.dataset.focusKey=`${action}-${value}`;}
 return node;
}

export function mountExpress(main,readPlan){
 const launch=button('','open');launch.className='rmExpressLaunch';launch.hidden=true;
 launch.innerHTML=`${icon('zap')}<span>Mode Coup de feu</span>`;
 launch.setAttribute('aria-controls','rmExpress');launch.setAttribute('aria-expanded','false');
 const root=element('section','','rmExpress');root.id='rmExpress';root.hidden=true;
 root.setAttribute('aria-labelledby','rmExpressTitle');
 root.innerHTML=`
  <header class="rmExpressHead">
   <h1 id="rmExpressTitle" tabindex="-1">${icon('zap')} Coup de feu</h1>
   <div class="rmExpressActions"><span data-sync></span><button type="button" data-action="close">Mode complet</button></div>
  </header>
  <div class="rmExpressAccess">
   <p data-access></p><button type="button" data-action="simulation">Simuler un service</button>
  </div>
  <div class="rmExpressSearch">
   <label>${icon('search')}<span class="rmExpressVisuallyHidden">Chambre ou nom</span><input type="search" placeholder="Chambre ou nom" autocomplete="off"></label>
   <button type="button" class="rmExpressPrimary" data-action="passage">${icon('plus')} Passage</button>
  </div>
  <div class="rmExpressMetrics" aria-label="Affluence">
   <span>${icon('calendar-clock')}<span data-arrival-metric></span></span>
   <span>${icon('activity')}<span data-charge-metric></span></span>
   <span>${icon('circle-help')}<span data-check-metric></span></span>
  </div>
  <p class="rmExpressAlert" data-priority hidden></p>
  <p class="rmExpressFeedback" role="status" data-feedback></p>
  <div class="rmExpressColumns">
   <div class="rmExpressStack">
    <section class="rmExpressPanel" data-handoffs hidden><h2>${icon('users')} À reprendre</h2><div data-handoff-list></div></section>
    <section class="rmExpressPanel"><h2 data-list-title>Arrivées</h2><button type="button" data-action="other-dates" aria-pressed="false" hidden>Inclure les autres services et dates</button><div data-arrivals></div></section>
   </div>
   <div class="rmExpressStack" data-workspace>
    <section class="rmExpressPanel" data-reservation aria-label="Réservation sélectionnée">
     <div data-booking></div>
     <div class="rmExpressOptions" data-suggestions></div>
     <details data-other-tables hidden><summary>Autre table</summary><div class="rmExpressTiles" data-all-tables></div></details>
     <div class="rmExpressConfirm" data-install hidden><p data-placement-summary></p><button type="button" class="rmExpressPrimary" data-action="install"></button></div>
    </section>
    <section class="rmExpressPanel" data-passage hidden aria-label="Passage express">
     <div class="rmExpressHeading"><h2 tabindex="-1">Passage express</h2><button type="button" data-action="cancel-passage">Retour aux arrivées</button></div>
     <div class="rmExpressFields">
      <label>Couverts<input type="number" min="1" max="40" value="2" data-guests></label>
      <label>Type de client<select data-guest-type><option value="external">Extérieur</option><option value="hotel">Hôtel</option></select></label>
      <label data-room-field hidden>Chambre (facultatif)<input type="text" maxlength="12" data-guest-room></label>
     </div>
     <p>Choisissez la table constatée sur place.</p><div class="rmExpressTiles" data-passage-tables></div>
     <button type="button" class="rmExpressPrimary" data-action="install-passage" disabled>Installer le passage</button>
    </section>
    <details class="rmExpressPanel" data-floor open><summary>Tables du service</summary><div class="rmExpressTiles" data-floor-tiles></div></details>
   </div>
  </div>`;
 const $=selector=>root.querySelector(selector);
 const search=$('input[type=search]');
 const groups=$('[data-arrivals]');
 const booking=$('[data-booking]');
 const feedback=$('[data-feedback]');

 let open=false,demo=null,simulation=null,selectedId=null,selectedTable=null,selectedPlan=null,otherDates=false;
 let passage=false,passageTable=null,busy=false,previousFocus=null,previousScroll=0,lastNotice='';
 const handoffs=new Set();
 const canOpen=()=>window.RestoNotificationContext?.role==='fb_admin'&&!window.RestoReception;
 const snapshot=()=>demo?demo.read():liveSnapshot(window,readPlan);
 const canAct=()=>Boolean(demo)&&canOpen()&&navigator.onLine!==false&&!busy;

 const style=element('link');style.rel='stylesheet';style.href=new URL('./service-v3-express.css?v=20261126-rmops1',import.meta.url);
 // The regular screens remain usable while the optional stylesheet is loading.
 let styled=false;style.addEventListener('load',()=>{styled=true;update();});
 document.head.append(style);main.prepend(launch);main.append(root);
 $('[data-floor]').open=window.matchMedia('(min-width: 720px)').matches;
 symbols();

 function message(value){if(value!==lastNotice){lastNotice=value;feedback.textContent=value;}}
 function setOpen(value){
  if(value&&(!canOpen()||!styled))return;
  if(value===open)return;
  open=value;
  if(open){previousFocus=document.activeElement;previousScroll=window.scrollY;}
  root.hidden=!open;document.documentElement.classList.toggle('rmExpressActive',open);
  launch.setAttribute('aria-expanded',String(open));
  if(open){update();$('#rmExpressTitle').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  else{
   if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
   window.scrollTo({top:previousScroll,behavior:'instant'});
  }
 }

 function update(){
  launch.hidden=!canOpen()||!styled;
  if(!canOpen()&&open){setOpen(false);return;}
  if(open)draw(snapshot());
 }

 function showFixtureLabel(){
  $('[data-access]').textContent=demo?'Simulation · données fictives':'Service partagé · consultation Express';
  $('[data-action=simulation]').textContent=demo?'Retour au service partagé':'Simuler un service';
 }

 function draw(snapshot){
  const focusKey=document.activeElement?.dataset.focusKey;
  const freshness=demo?navigator.onLine!==false:snapshot.fresh;
  const time=snapshot.updatedAt?parisTime(snapshot.updatedAt).time:'';
  $('[data-sync]').textContent=freshness?`À jour${time?' · '+time:''}`:snapshot.loaded?`Données à vérifier${time?' · '+time:''}`:'En attente des données';
  const priority=$('[data-priority]');
  priority.hidden=freshness&&(!snapshot.loaded||!snapshot.charge?.blocked);
  priority.textContent=!freshness
   ?snapshot.loaded?'Connexion ou synchronisation interrompue. Dernière vue en consultation.':'Les données du service ne sont pas encore chargées.'
   :'Charge au-dessus du seuil partagé. Consultez l’affluence avant de proposer un horaire.';
  const indicators=serviceIndicators(snapshot);
  $('[data-arrival-metric]').textContent=snapshot.loaded?`${covers(indicators.covers)} prévus · 15 min`:'Arrivées en attente';
  $('[data-charge-metric]').textContent=freshness&&snapshot.charge?`Charge · ${snapshot.charge.current} / ${snapshot.charge.limit} couverts`:'Charge à vérifier';
  $('[data-check-metric]').textContent=snapshot.loaded?`${indicators.toCheck} à vérifier`:'Vérifications en attente';
  const passageButton=$('[data-action=passage]');
  passageButton.disabled=!canAct();passageButton.title=demo?'':'Disponible dans la simulation Express et le mode complet';
  showFixtureLabel();
  drawArrivals(snapshot);
  drawBooking(snapshot);
  drawFloor(snapshot);
  root.classList.toggle('rmExpressSelection',Boolean(selectedId||passage));
  $('[data-reservation]').hidden=passage;$('[data-passage]').hidden=!passage;
  if(passage)drawPassage(snapshot);
  if(focusKey){
   const replacement=[...root.querySelectorAll('[data-focus-key]')].find(node=>node.dataset.focusKey===focusKey);
   if(replacement?.getClientRects().length&&!replacement.disabled)replacement.focus({preventScroll:true});
   else if(document.activeElement===document.body)search.focus({preventScroll:true});
  }
 }

 function arrivalCard(row,today){
  const card=button('', 'select',row.id);card.className='rmExpressArrival';
  card.setAttribute('aria-pressed',String(row.id===selectedId));
  card.append(element('strong',labelFor(row)),element('span',`${row.date!==today?'Le '+row.date+' · ':''}${row.time} · ${covers(row.guests)}`));
  if(row.allergies)card.append(element('small',`Allergie : ${row.allergies}`,'rmExpressAllergy'));
  return card;
 }

 function drawArrivals(snapshot){
  const query=search.value.trim();
  const matches=findArrivals(snapshot,query,otherDates);
  const upcoming=query?matches:matches.filter(row=>elapsedMinutes(snapshot,row)>=-15&&elapsedMinutes(snapshot,row)<20);
  const other=$('[data-action=other-dates]');other.hidden=!query;other.setAttribute('aria-pressed',String(otherDates));
  $('[data-list-title]').textContent=query?'Résultats':'Arrivées proches';
  groups.replaceChildren(...upcoming.map(row=>arrivalCard(row,snapshot.now.date)));
  if(!upcoming.length)groups.append(element('p',query?'Aucune réservation ne correspond à cette recherche.':'Aucune arrivée proche.','rmExpressMuted'));
  const carrying=snapshot.reservations.filter(row=>handoffs.has(row.id)&&isWaiting(row));
  $('[data-handoffs]').hidden=!demo||!carrying.length;
  $('[data-handoff-list]').replaceChildren(...carrying.map(row=>arrivalCard(row,snapshot.now.date)));
 }

 function tableLabel(snapshot,table){return snapshot.rooms.find(room=>room.id===table.roomId)?.name??'';}

 function tableButton(snapshot,table,detail,kind='choose'){
  const tile=button('',kind,table.number);tile.className='rmExpressTile';
  tile.append(element('strong',`T${table.number}`),element('small',detail));
  const room=tableLabel(snapshot,table);if(room)tile.append(element('small',room));
  return tile;
 }

 function drawBooking(snapshot){
  const row=snapshot.reservations.find(item=>item.id===selectedId);
  const notes=$('[data-suggestions]'),allTables=$('[data-other-tables]'),install=$('[data-install]');
  booking.replaceChildren();notes.replaceChildren();allTables.hidden=true;install.hidden=true;
  if(!row){
   booking.append(element('h2','Placement'),element('p',selectedId?'Cette réservation ne figure plus dans la dernière vue.':'Choisissez une réservation ou recherchez une chambre.','rmExpressMuted'));
   return;
  }
  const heading=element('h2',labelFor(row));heading.tabIndex=-1;heading.dataset.focusKey='booking-title';
  booking.append(heading,element('p',`${row.time} · ${covers(row.guests)}`,'rmExpressMuted'));
  if(row.allergies)booking.append(element('p',`Allergie : ${row.allergies}`,'rmExpressAllergy'));
  if(row.notes)booking.append(element('p',row.notes,'rmExpressNote'));
  if(!isWaiting(row)){
   booking.append(element('p',row.status==='seated'?`Installation déclarée · ${row.tables.map(number=>'T'+number).join(' + ')}`:'Réservation terminée.'));
   return;
  }
  if(!demo){
   if(row.tables.length)booking.append(element('p',`Affectation prévue · ${row.tables.map(number=>'T'+number).join(' + ')}`));
   booking.append(element('p','Les actions Express sont disponibles sur données fictives.','rmExpressMuted'));
   return;
  }
  const handoff=button(handoffs.has(row.id)?'Retirer de « À reprendre »':'Je l’accompagne','handoff',row.id);
  handoff.disabled=!canAct();booking.append(handoff);
  const {primary,entries}=simulation.suggestions(snapshot,row);
  function option({table,plan}){
   let detail=plan.message;
   if(plan.ok){
    detail=tableStatus(snapshot,table.number).label;
    if(row.tables.includes(table.number))detail='Prévue pour ce client';
    if(plan.changes.length)detail=`Échange avec ${plan.changes[0].client}`;
   }
   const tile=tableButton(snapshot,table,detail);
   tile.disabled=!plan.ok||!canAct();tile.setAttribute('aria-pressed',String(selectedTable===table.number));
   return tile;
  }
  if(primary.length)notes.append(...primary.map(option));
  else notes.append(element('p','Aucune table compatible dans cette simulation.','rmExpressMuted'));
  allTables.hidden=false;$('[data-all-tables]').replaceChildren(...entries.filter(entry=>!primary.includes(entry)).map(option));
  if(selectedTable===null)return;
  const plan=demo.preview(snapshot,row.id,selectedTable);
  if(!plan.ok||plan.fingerprint!==selectedPlan?.fingerprint){
   selectedTable=null;selectedPlan=null;
   message('Le placement a changé. Vérifiez la situation en salle et choisissez de nouveau.');
   return;
  }
  selectedPlan=plan;install.hidden=false;
  const recap=plan.changes.length
   ?plan.changes.map(move=>`${move.client} passera de T${move.from[0]} à T${move.to[0]}.`)
   :['Confirmez la table réellement choisie en salle.'];
  $('[data-placement-summary]').textContent=[...recap,...plan.warnings.map(warning=>warning.message)].join(' ');
  const confirm=$('[data-action=install]');confirm.textContent=`Installer ${row.hotelRoom||row.client} en T${plan.targetTables[0]}`;confirm.disabled=!canAct();
 }

 function drawFloor(snapshot){
  const floor=$('[data-floor-tiles]');floor.replaceChildren();
  for(const room of snapshot.rooms){
   floor.append(element('h3',room.name));
   for(const table of snapshot.tables.filter(item=>item.roomId===room.id)){
    const state=tableStatus(snapshot,table.number),tile=element('div','','rmExpressTile');
    tile.dataset.state=state.kind;tile.append(element('strong',`T${table.number}`),element('small',state.label));floor.append(tile);
   }
  }
  if(!floor.children.length)floor.append(element('p','Plan du restaurant en attente.','rmExpressMuted'));
 }

 function drawPassage(snapshot){
  const guests=$('[data-guests]').valueAsNumber;
  const choices=demo?simulation.suggestWalkIn(snapshot,guests):[];
  if(!choices.some(table=>table.number===passageTable))passageTable=null;
  const options=$('[data-passage-tables]');
  options.replaceChildren(...choices.map(table=>{
   const tile=tableButton(snapshot,table,'Aucun client enregistré','walk-table');
   tile.disabled=!canAct();tile.setAttribute('aria-pressed',String(passageTable===table.number));return tile;
  }));
  if(!choices.length)options.append(element('p','Aucune table compatible avec ce passage.','rmExpressMuted'));
  $('[data-room-field]').hidden=$('[data-guest-type]').value!=='hotel';
  const confirm=$('[data-action=install-passage]');
  confirm.disabled=passageTable===null||!canAct();
  confirm.textContent=passageTable===null?'Installer le passage':`Installer ${covers(guests)} en T${passageTable}`;
 }

 async function run(action){
  if(!canAct())return;
  busy=true;message('');update();
  try{await action();}catch(error){message(error.message);}
  finally{busy=false;update();}
 }

 async function switchSource(){
  if(busy)return;
  if(demo){demo.close();demo=null;}
  else{
   const toggle=$('[data-action=simulation]');toggle.disabled=true;
   try{
    simulation??=await import('./service-v3-express-simulation.mjs');
    if(!canOpen()||!open)return;
    demo=simulation.createSimulation(window,window.RestoNotificationContext.restaurantId);demo.subscribe(update);
   }catch{message('Impossible de charger la simulation Express. Réessayez.');return;}
   finally{toggle.disabled=false;}
  }
  selectedId=selectedTable=selectedPlan=passageTable=null;passage=otherDates=false;
  handoffs.clear();search.value='';message('');update();search.focus({preventScroll:true});
 }

 launch.addEventListener('click',()=>setOpen(true));
 search.addEventListener('input',()=>{if(!search.value.trim())otherDates=false;update();});
 $('[data-guests]').addEventListener('input',()=>{passageTable=null;update();});
 $('[data-guest-type]').addEventListener('change',()=>update());
 root.addEventListener('click',event=>{
  const target=event.target.closest('button[data-action]');if(!target||target.disabled)return;
  const {action,value}=target.dataset;
  if(action==='close'){setOpen(false);return;}
  if(action==='simulation'){void switchSource();return;}
  if(action==='other-dates')otherDates=!otherDates;
  if(action==='select'){
   selectedId=value;selectedTable=selectedPlan=null;passage=false;$('[data-other-tables]').open=false;message('');
   update();
   if(window.matchMedia('(max-width: 719px)').matches)$('[data-booking] h2')?.focus();
   return;
  }
  if(action==='handoff'&&canAct()){
   if(handoffs.has(selectedId))handoffs.delete(selectedId);else handoffs.add(selectedId);
   message('Dossiers « À reprendre » mis à jour sur cet appareil.');
  }
  if(action==='choose'&&canAct()){
   const plan=demo.preview(snapshot(),selectedId,Number(value));
   if(plan.ok){selectedTable=Number(value);selectedPlan=plan;message('');}
  }
  if(action==='install'&&selectedPlan){
   const plan=selectedPlan;
   void run(async()=>{
    const result=await demo.seat(plan);handoffs.delete(result.reservationId);selectedTable=selectedPlan=null;
    message(`Simulation · installation enregistrée en T${result.targetTables[0]}.`);
   });return;
  }
  if(action==='passage'&&canAct()){
   passage=true;passageTable=null;message('');update();$('[data-passage] h2').focus();return;
  }
  if(action==='cancel-passage'){passage=false;message('');$('[data-action=passage]').focus();}
  if(action==='walk-table'&&canAct())passageTable=Number(value);
  if(action==='install-passage'&&passageTable!==null){
   const draft={revision:snapshot().revision,guests:$('[data-guests]').valueAsNumber,table:passageTable,
    type:$('[data-guest-type]').value,room:$('[data-guest-room]').value};
   void run(async()=>{
    await demo.walkIn(draft);passage=false;passageTable=null;$('[data-guest-room]').value='';
    message(`Simulation · passage installé en T${draft.table}.`);
   });return;
  }
  update();
 });

 for(const event of ['restomanager:notification-context','restomanager:supabase-snapshot','restomanager:connection-state','online','offline'])window.addEventListener(event,update);
 window.addEventListener('restomanager:screen',()=>{if(open)setOpen(false);});
 window.setInterval(()=>{if(open&&!demo)update();},30000);
 update();
}
