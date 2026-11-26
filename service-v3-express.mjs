import {assignedRoom,belongsToService,elapsedMinutes,findArrivals,isWaiting,liveSnapshot,parisTime,roomViews,serviceIndicators,tableStatus} from './service-v3-express-data.mjs?v=20261126-rmops-integration1';
import {createLiveAdapter} from './placement-express-adapter.mjs?v=20261126-rmops-integration1';

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
 launch.innerHTML=`${icon('zap')}<span>Coup de feu</span>`;
 launch.setAttribute('aria-label','Ouvrir le Mode Coup de feu');
 launch.title='Ouvrir le Mode Coup de feu';
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
   <button type="button" class="rmExpressPrimary" data-action="passage">${icon('plus')}<span>Passage</span></button>
  </div>
  <div class="rmExpressMetrics" aria-label="Affluence du service">
   <span>${icon('calendar-clock')}<span data-arrival-metric></span></span>
   <span>${icon('activity')}<span data-charge-metric></span></span>
   <span>${icon('circle-help')}<span data-check-metric></span></span>
  </div>
  <p class="rmExpressAlert" data-priority hidden></p>
  <div class="rmExpressRoomTabs" role="group" aria-label="Filtrer les tables par salle" aria-controls="rmExpressFloor" hidden></div>
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
     <div class="rmExpressConfirm" data-install hidden>
      <p data-placement-summary></p>
      <p class="rmExpressRoomChange" data-room-change hidden>${icon('arrow-left-right')}<strong></strong></p>
      <button type="button" class="rmExpressPrimary" data-action="install"></button>
     </div>
    </section>
    <section class="rmExpressPanel" data-passage hidden aria-label="Passage express">
     <div class="rmExpressHeading"><h2 tabindex="-1">Passage express</h2><button type="button" data-action="cancel-passage">Retour aux arrivées</button></div>
     <p class="rmExpressMuted" data-passage-readonly hidden>Aperçu du passage. Utilisez le mode complet pour l’enregistrer.</p>
     <div class="rmExpressFields">
      <label>Couverts<input type="number" min="1" max="40" value="2" data-guests></label>
      <label>Type de client<select data-guest-type><option value="external">Extérieur</option><option value="hotel">Hôtel</option></select></label>
      <label data-room-field hidden>Chambre (facultatif)<input type="text" maxlength="12" data-guest-room></label>
     </div>
     <p>Choisissez la table constatée sur place.</p><div class="rmExpressTiles" data-passage-tables></div>
     <button type="button" class="rmExpressPrimary" data-action="install-passage" disabled>Installer le passage</button>
    </section>
     <details class="rmExpressPanel" id="rmExpressFloor" data-floor open><summary>Tables du service</summary><div class="rmExpressRooms" data-floor-tiles></div></details>
   </div>
  </div>`;
 const $=selector=>root.querySelector(selector);
 const search=$('input[type=search]');
 const groups=$('[data-arrivals]');
 const booking=$('[data-booking]');
 const feedback=$('[data-feedback]');

 let open=false,demo=null,live=null,simulation=null,selectedId=null,selectedTable=null,selectedPlan=null,otherDates=false;
 let passage=false,passageTable=null,busy=false,previousFocus=null,previousScroll=0,lastNotice='';
 let scope=null,roomId=null,roomTabSignature='';
 const handoffs=new Set();
 const canOpen=()=>{
  const context=window.RestoNotificationContext;
  return Boolean(context?.role==='fb_admin'&&context.restaurantId&&context.userId&&!window.RestoReception);
 };
 const currentScope=()=>canOpen()?JSON.stringify([window.RestoNotificationContext.userId,window.RestoNotificationContext.restaurantId]):null;
 const readLive=()=>liveSnapshot(window,readPlan);
 const adapter=()=>demo??live;
 const snapshot=()=>adapter()?.read()??readLive();
 const canPreview=state=>Boolean(adapter()&&scope===currentScope()&&navigator.onLine!==false&&(demo||state.fresh));
 const canPreviewPassage=state=>canPreview(state)&&Boolean(demo||state.service&&state.now.time>=state.service.start);
 const canAct=()=>Boolean(demo)&&scope===currentScope()&&navigator.onLine!==false&&!busy;

 const style=element('link');style.rel='stylesheet';style.href=new URL('./service-v3-express.css?v=20261126-rmops-compact1',import.meta.url);
 // The regular screens remain usable while the optional stylesheet is loading.
 let styled=false;style.addEventListener('load',()=>{styled=true;update();});
 document.head.append(style);
 // Keep the rush-mode entry alongside the Restaurant identity rather than above the whole dashboard.
 const role=main.querySelector('.serviceIntro .serviceRole');
 if(role){
  const entry=element('div','','rmExpressEntry');
  role.before(entry);
  entry.append(role,launch);
 }else main.prepend(launch);
 main.append(root);
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
  const nextScope=currentScope();
  const changed=scope!==nextScope;
  if(changed){
   scope=nextScope;demo?.close();demo=null;busy=false;
   live?.close();live=null;
   resetView();
  }
  if(open&&scope&&!live&&window.RestoPlacement){
   live=createLiveAdapter({read:readLive});live.subscribe(update);
  }
  launch.hidden=!canOpen()||!styled;
  if(!canOpen()&&open)setOpen(false);
  if(open||changed)draw(snapshot());
 }

 function resetView(){
  selectedId=selectedTable=selectedPlan=passageTable=roomId=null;
  passage=otherDates=false;handoffs.clear();search.value='';message('');
  $('[data-guests]').value='2';$('[data-guest-type]').value='external';$('[data-guest-room]').value='';
  $('[data-other-tables]').open=false;
  $('[data-all-tables]').replaceChildren();$('[data-passage-tables]').replaceChildren();
  $('[data-placement-summary]').textContent='';$('[data-action=install]').textContent='';
  $('[data-room-change] strong').textContent='';
  $('[data-action=install-passage]').textContent='Installer le passage';
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
  $('[data-charge-metric]').textContent=freshness&&snapshot.charge?`Charge du service · ${snapshot.charge.current} / ${snapshot.charge.limit} couverts`:'Charge du service à vérifier';
  $('[data-check-metric]').textContent=snapshot.loaded?`${indicators.toCheck} à vérifier`:'Vérifications en attente';
  const passageButton=$('[data-action=passage]');
  passageButton.disabled=demo?!canAct():!canPreviewPassage(snapshot);
  passageButton.title=demo?'':'Consulter un aperçu du passage';
  passageButton.querySelector('span').textContent=demo?'Passage':'Aperçu passage';
  showFixtureLabel();
  const rooms=roomViews(snapshot);
  const room=rooms.find(item=>item.id===roomId);
  if(!room)roomId=null;
  drawRoomTabs(rooms,snapshot.loaded);
  drawArrivals(snapshot);
  drawBooking(snapshot,room);
  drawFloor(room?[room]:rooms,snapshot.loaded);
  root.classList.toggle('rmExpressSelection',Boolean(selectedId||passage));
  root.classList.toggle('rmExpressRoomView',Boolean(room));
  $('[data-reservation]').hidden=passage;$('[data-passage]').hidden=!passage;
  if(passage)drawPassage(snapshot,room);
  if(focusKey){
   const replacement=[...root.querySelectorAll('[data-focus-key]')].find(node=>node.dataset.focusKey===focusKey);
   if(replacement?.getClientRects().length&&!replacement.disabled)replacement.focus({preventScroll:true});
   else if(document.activeElement===document.body){
    const fallback=focusKey.startsWith('room-')&&snapshot.loaded?$('[data-action=room]'):search;
    fallback?.focus({preventScroll:true});
   }
  }
 }

 function drawRoomTabs(rooms,loaded){
  const tabs=$('.rmExpressRoomTabs');
  tabs.hidden=!loaded;
  const signature=JSON.stringify(rooms.map(({id,name})=>[id,name]));
  if(signature!==roomTabSignature){
   roomTabSignature=signature;
   const all=button('Toutes les salles','room','');all.insertAdjacentHTML('afterbegin',icon('layers'));
   tabs.replaceChildren(all,...rooms.map(room=>button(room.name,'room',room.id)));
   symbols();
  }
  for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.value===(roomId??'')));
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

 function roomName(snapshot,id){return snapshot.rooms.find(room=>room.id===id)?.name??'';}

 function placementPreview(snapshot,reservationId,number){
  const plan=adapter().preview(snapshot,reservationId,number);
  if(!plan.ok)return plan;
  const row=snapshot.reservations.find(item=>item.id===reservationId);
  const affected=new Set([...row.tables,...plan.targetTables,...plan.changes.flatMap(move=>[...move.from,...move.to])]);
  const tables=snapshot.tables.filter(item=>affected.has(item.number))
   .map(({id,number,roomId,capacity})=>[id,number,roomId,capacity]);
  const viewVersion=JSON.stringify([plan.fingerprint,plan.kind,plan.changes,plan.warnings,tables]);
  return {...plan,viewVersion};
 }

 function tableButton(snapshot,table,detail,kind='choose',otherRoom=false){
  const tile=button('',kind,table.number);tile.className='rmExpressTile';
  tile.append(element('strong',`T${table.number}`),element('small',detail));
  const room=roomName(snapshot,table.roomId);if(room)tile.append(element('small',otherRoom?`Autre salle · ${room}`:room));
  return tile;
 }

 function drawBooking(snapshot,room){
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
   booking.append(element('p','Aperçu uniquement. Utilisez le mode complet pour enregistrer une installation.','rmExpressMuted'));
   if(!canPreview(snapshot)){
    selectedTable=selectedPlan=null;
    return;
   }
   if(!belongsToService(snapshot,row)){
    notes.append(element('p','Cette réservation est hors du service affiché.','rmExpressMuted'));
    return;
   }
  }else{
   const handoff=button(handoffs.has(row.id)?'Retirer de « À reprendre »':'Je l’accompagne','handoff',row.id);
   handoff.disabled=!canAct();booking.append(handoff);
  }
  const {primary,entries,message:reason}=adapter().suggestions(snapshot,row,roomId);
  const fromRoom=assignedRoom(snapshot,row);
  function option({table,plan}){
   let detail=plan.message;
   if(plan.ok){
    detail=tableStatus(snapshot,table.number).label;
    if(row.tables.includes(table.number))detail='Prévue pour ce client';
    if(plan.kind==='swap')detail=`Échange avec ${plan.changes[0].client}`;
    if(plan.kind==='chain')detail=`${plan.changes.length} déplacements à vérifier`;
   }
   const tile=tableButton(snapshot,table,detail,'choose',Boolean(fromRoom&&fromRoom!==table.roomId));
   tile.disabled=!plan.ok||!canPreview(snapshot)||busy;tile.setAttribute('aria-pressed',String(selectedTable===table.number));
   return tile;
  }
  if(primary.length)notes.append(...primary.map(option));
  else notes.append(element('p',reason??(room?`Aucune proposition compatible dans ${room.name}.`:'Aucune proposition compatible.'),'rmExpressMuted'));
  appendOtherRooms(notes,snapshot,room);
  const remaining=entries.filter(entry=>!primary.includes(entry));
  allTables.hidden=!remaining.length;$('[data-all-tables]').replaceChildren(...remaining.map(option));
  if(selectedTable===null)return;
  const plan=placementPreview(snapshot,row.id,selectedTable);
  if(!plan.ok||plan.viewVersion!==selectedPlan?.viewVersion){
   selectedTable=null;selectedPlan=null;
   message('Le placement a changé. Vérifiez la situation en salle et choisissez de nouveau.');
   return;
  }
  selectedPlan=plan;install.hidden=false;
  const recap=plan.changes.length
   ?plan.changes.map(move=>`${move.client} passera de T${move.from[0]} à T${move.to[0]}.`)
   :[demo?'Confirmez la table réellement choisie en salle.':`Table proposée · T${plan.targetTables[0]}`];
  const destination=snapshot.tables.find(table=>table.number===plan.targetTables[0]);
  const roomChange=fromRoom&&destination&&destination.roomId!==fromRoom;
  const change=$('[data-room-change]');change.hidden=!roomChange;
  if(roomChange){
   change.querySelector('strong').textContent=`Changement de salle · ${roomName(snapshot,fromRoom)} → ${roomName(snapshot,destination.roomId)}`;
  }
  const warnings=plan.warnings.filter(warning=>!demo||warning.code!=='ROOM_CHANGE').map(warning=>warning.message);
  $('[data-placement-summary]').textContent=[...recap,...warnings].join(' ');
  const confirm=$('[data-action=install]');confirm.hidden=!demo;
  confirm.textContent=`Installer ${row.hotelRoom||row.client} en T${plan.targetTables[0]}`;confirm.disabled=!canAct();
 }

 function appendOtherRooms(container,snapshot,room){
  if(!room||!snapshot.rooms.some(other=>other.id!==room.id&&other.active!==false))return;
  const link=button('Voir les autres salles','all-rooms');link.className='rmExpressOtherRooms';
  container.append(link);
 }

 function drawFloor(rooms,loaded){
  const floor=$('[data-floor-tiles]');floor.replaceChildren();
  for(const room of rooms){
   const section=element('section','','rmExpressRoom');section.append(element('h3',room.name));
   const {configured,active,planned,installed,departures}=room.counts;
   if(!configured){
    section.append(element('p','Aucune table configurée','rmExpressMuted'));
   }else{
    const configuredLabel=`${configured} ${configured===1?'table configurée':'tables configurées'}`;
    const config=active===configured?configuredLabel:`${active} ${active===1?'table active':'tables actives'} / ${configuredLabel}`;
    const status=`${planned} ${planned===1?'prévue':'prévues'} · ${installed} ${installed===1?'installation déclarée':'installations déclarées'} · ${departures} ${departures===1?'départ à vérifier':'départs à vérifier'}`;
    section.append(element('p',active?`${config} · ${status}`:`${config} · Aucune table active`,'rmExpressRoomMeta'));
    const tiles=element('div','','rmExpressTiles');
    for(const {table,state} of room.tables){
     const tile=element('div','','rmExpressTile');tile.dataset.state=state.kind;
     tile.append(element('strong',`T${table.number}`),element('small',state.label));tiles.append(tile);
    }
    if(active)section.append(tiles);
   }
   floor.append(section);
  }
  if(!rooms.length)floor.append(element('p',loaded?'Aucune salle active configurée.':'Plan du restaurant en attente.','rmExpressMuted'));
 }

 function drawPassage(snapshot,room){
  const guests=$('[data-guests]').valueAsNumber;
  const choices=canPreviewPassage(snapshot)?adapter().suggestWalkIn(snapshot,guests).filter(table=>!roomId||table.roomId===roomId):[];
  if(!choices.some(table=>table.number===passageTable))passageTable=null;
  const options=$('[data-passage-tables]');
  options.replaceChildren(...choices.map(table=>{
   const tile=tableButton(snapshot,table,'Aucun client enregistré','walk-table');
   tile.disabled=busy;tile.setAttribute('aria-pressed',String(passageTable===table.number));return tile;
  }));
  if(!choices.length){
   const empty=room?`Aucune table compatible avec ce passage dans ${room.name}.`:'Aucune table compatible avec ce passage.';
   options.append(element('p',canPreviewPassage(snapshot)?empty:'Aperçu en pause pendant la synchronisation ou hors service.','rmExpressMuted'));
  }
  appendOtherRooms(options,snapshot,room);
  $('[data-room-field]').hidden=$('[data-guest-type]').value!=='hotel';
  const confirm=$('[data-action=install-passage]');
  $('[data-passage-readonly]').hidden=Boolean(demo);
  confirm.hidden=!demo||!choices.length;
  confirm.disabled=passageTable===null||!canAct();
  confirm.textContent=passageTable===null?'Installer le passage':`Installer ${covers(guests)} en T${passageTable}`;
 }

 async function run(action){
  if(!canAct())return;
  const adapter=demo;
  busy=true;message('');update();
  try{await action(adapter);}catch(error){if(demo===adapter)message(error.message);}
  finally{if(demo===adapter){busy=false;update();}}
 }

 async function switchSource(){
  if(busy)return;
  if(demo){demo.close();demo=null;}
  else{
   const requestedScope=scope;
   const toggle=$('[data-action=simulation]');toggle.disabled=true;
   try{
    simulation??=await import('./service-v3-express-simulation.mjs?v=20261126-rmops-integration1');
    if(requestedScope!==currentScope()||!open)return;
    demo=simulation.createSimulation(window,window.RestoNotificationContext.restaurantId);demo.subscribe(update);
   }catch{if(requestedScope===currentScope())message('Impossible de charger la simulation Express. Réessayez.');return;}
   finally{toggle.disabled=false;}
  }
  resetView();update();search.focus({preventScroll:true});
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
  if(action==='room'||action==='all-rooms'){
   roomId=value||null;
   const tables=snapshot().tables;
   if(roomId&&tables.find(table=>table.number===selectedTable)?.roomId!==roomId)selectedTable=selectedPlan=null;
   if(roomId&&tables.find(table=>table.number===passageTable)?.roomId!==roomId)passageTable=null;
   $('[data-floor]').open=true;
   update();
   if(action==='all-rooms')$('[data-action=room]').focus();
   return;
  }
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
  if(action==='choose'){
   const state=snapshot();if(!canPreview(state)||busy)return;
   const plan=placementPreview(state,selectedId,Number(value));
   if(plan.ok){selectedTable=Number(value);selectedPlan=plan;message('');}
   else message(plan.message);
  }
  if(action==='install'&&selectedPlan){
   const plan=selectedPlan;
   void run(async adapter=>{
    const result=await adapter.seat(plan);if(demo!==adapter)return;
    handoffs.delete(result.reservationId);selectedTable=selectedPlan=null;
    message(`Simulation · installation enregistrée en T${result.targetTables[0]}.`);
   });return;
  }
  if(action==='passage'&&canPreviewPassage(snapshot())&&!busy){
   passage=true;passageTable=null;message('');update();$('[data-passage] h2').focus();return;
  }
  if(action==='cancel-passage'){passage=false;message('');$('[data-action=passage]').focus();}
  if(action==='walk-table'&&canPreviewPassage(snapshot())&&!busy)passageTable=Number(value);
  if(action==='install-passage'&&passageTable!==null){
   const draft={revision:snapshot().revision,guests:$('[data-guests]').valueAsNumber,table:passageTable,
    type:$('[data-guest-type]').value,room:$('[data-guest-room]').value};
   void run(async adapter=>{
    await adapter.walkIn(draft);if(demo!==adapter)return;
    passage=false;passageTable=null;$('[data-guest-room]').value='';
    message(`Simulation · passage installé en T${draft.table}.`);
   });return;
  }
  update();
 });

 for(const event of ['restomanager:notification-context','restomanager:placement-ready'])window.addEventListener(event,update);
 for(const event of ['restomanager:supabase-snapshot','restomanager:connection-state','online','offline'])window.addEventListener(event,()=>{if(!live)update();});
 window.addEventListener('restomanager:screen',()=>{if(open)setOpen(false);});
 window.setInterval(()=>{if(open&&!demo)update();},30000);
 update();
}
