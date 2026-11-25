'use strict';
(function(){
 const model=window.RestoNotificationModel;if(!model)return;
 const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
 const icon=name=>{const el=node('i');el.dataset.lucide=name;el.setAttribute('aria-hidden','true');return el};
 const button=(label,fn,cls='rmNcSecondary',glyph)=>{const b=node('button',cls);b.type='button';if(glyph)b.append(icon(glyph));b.append(document.createTextNode(label));b.addEventListener('click',()=>void fn());return b};
 const bell=button('',()=>open(),'serviceBell');bell.append(icon('bell'));bell.id='serviceBell';bell.setAttribute('aria-label','Ouvrir les notifications');bell.setAttribute('aria-haspopup','dialog');bell.setAttribute('aria-controls','serviceReminderPanel');bell.setAttribute('aria-expanded','false');
 const badge=node('span','serviceBellCount','0');badge.hidden=true;badge.setAttribute('aria-hidden','true');bell.append(badge);
 const panel=node('dialog','rmNotificationCenter');panel.id='serviceReminderPanel';panel.setAttribute('aria-labelledby','rmNcTitle');
 (document.querySelector('.headerQuickActions')||document.querySelector('.top'))?.append(bell);document.body.append(panel);
 const profile=document.getElementById('mobileAccountToggle');if(profile&&bell.parentElement){bell.after(profile);const media=matchMedia('(max-width:900px)');const sync=()=>{profile.style.setProperty('display',media.matches?'inline-flex':'none','important');profile.style.setProperty('visibility',media.matches?'visible':'hidden','important');profile.style.setProperty('flex','0 0 42px','important')};sync();media.addEventListener('change',sync)}
 const header=node('header','rmNcHeader'),row=node('div','rmNcTitleRow'),words=node('div');
 words.append(node('span','rmNcEyebrow','Votre équipe, à jour'));const title=node('h1','rmNcTitle','Notifications');title.id='rmNcTitle';title.tabIndex=-1;words.append(title);
 const close=button('',()=>closePanel(),'rmNcIconButton','x');close.setAttribute('aria-label','Fermer les notifications');row.append(words,close);
 const subtitle=node('p','rmNcSubtitle'),tools=node('div','rmNcTools');let unreadOnly=false,showSnoozed=false,historyView=false;
 const filter=button('Non lues',()=>{unreadOnly=!unreadOnly;showSnoozed=false;render(true)},'rmNcFilter');filter.setAttribute('aria-pressed','false');
 const allRead=button('Tout marquer comme lu',()=>markAll(),'rmNcTextButton');tools.append(filter,allRead);header.append(row,subtitle,tools,node('p','rmNcGestureHint','Glissez une notification pour la retirer.'));
 const status=node('p','rmNcStatus');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const scroll=node('div','rmNcScroll'),footer=node('footer','rmNcFooter'),history=button('Quoi de neuf ?',()=>{if(historyView){historyView=false;render(true);scroll.scrollTop=flowScroll}else showHistory()},'rmNcTextButton','sparkles'),snoozed=button('Reportés',()=>{showSnoozed=!showSnoozed;unreadOnly=false;historyView=false;render(true)},'rmNcTextButton');
 const undoBar=node('div','rmNcUndo'),undoMessage=node('span','','Notification retirée sur cet appareil.'),undoButton=button('Annuler',()=>undoDismissal(),'rmNcTextButton');undoButton.setAttribute('aria-label','Annuler le retrait');undoBar.setAttribute('role','status');undoBar.setAttribute('aria-live','polite');undoBar.hidden=true;undoBar.append(undoMessage,undoButton);
 footer.append(history,snoozed);panel.append(header,status,undoBar,scroll,footer);
 let storageKey='',state={},items=[],renderKey='',returnFocus=null,marking=false,flowScroll=0,bodyLocked=false,previousOverflow='';
 let previousVisibleIds=new Set(),previousUnread=null;
 const sourceRegistry=new Map(),undoStack=[];
 function context(){return window.RestoNotificationContext}
 function load(){const key=model.scope(context());const next=key?'restomanager:notifications:v1:'+key:'';if(next===storageKey)return;storageKey=next;state={};previousVisibleIds=new Set();previousUnread=null;undoStack.length=0;undoBar.hidden=true;status.textContent='';if(next)try{const value=JSON.parse(localStorage.getItem(next)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))state=value}catch{}renderKey=''}
 function save(){if(!storageKey)return false;const now=Date.now();for(const [id,value] of Object.entries(state))if(!value||now-Number(value.updatedAt||0)>30*86400000)delete state[id];try{localStorage.setItem(storageKey,JSON.stringify(state));return true}catch{status.textContent='Les préférences de notifications ne peuvent pas être conservées sur cet appareil.';return false}}
 function setLocal(id,patch){state[id]={...state[id],...patch,updatedAt:Date.now()};return save()}
 function dismissItem(item){
  if(marking||!ready()||!model.dismissible(item))return;
  const current=collect().find(n=>n.id===item.id);if(!current||model.dismissalRevision(current)!==model.dismissalRevision(item)){update();return}
  const previous=state[item.id],revision=model.dismissalRevision(item);
  if(!setLocal(item.id,{dismissedRevision:revision})){if(previous)state[item.id]=previous;else delete state[item.id];return}
  undoStack.push({id:item.id,revision});undoBar.hidden=false;status.textContent='';
  const focused=document.activeElement?.closest('[data-notification-id]')?.dataset.notificationId===item.id;update();if(focused)undoButton.focus({preventScroll:true});
 }
 function undoDismissal(){
  if(!ready())return;const last=undoStack.at(-1);if(!last)return;
  const previous=state[last.id];
  if(previous?.dismissedRevision===last.revision){const next={...previous};delete next.dismissedRevision;state[last.id]={...next,updatedAt:Date.now()};if(!save()){state[last.id]=previous;return}}
  undoStack.pop();undoBar.hidden=!undoStack.length;status.textContent='Retrait annulé.';update();if(undoBar.hidden)title.focus({preventScroll:true});
 }
 function dismissibleCard(article,item){
  if(!model.dismissible(item))return article;
  const wrapper=node('div','rmNcDismissible'),back=node('div','rmNcSwipeBack');back.setAttribute('aria-hidden','true');back.append(icon('trash-2'),node('span','','Retirer'));wrapper.append(back,article);
  const remove=button('Retirer',()=>dismissItem(item),'rmNcTextButton rmNcDismiss','trash-2');remove.setAttribute('aria-label','Retirer la notification : '+item.title);article.querySelector('.rmNcActions').append(remove);
  let gesture=null,suppressClickUntil=0;
  const reset=()=>{gesture=null;wrapper.classList.remove('is-swiping');article.style.removeProperty('transform')};
  article.addEventListener('pointerdown',event=>{
   if(!event.isPrimary||event.button!==0||event.target.closest('button,a,input,select,textarea'))return;
   gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,horizontal:false};
  });
  article.addEventListener('pointermove',event=>{
   if(!gesture||gesture.id!==event.pointerId)return;
   const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
   if(!gesture.horizontal){if(Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx)){reset();return}if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.35)return;gesture.horizontal=true;article.setPointerCapture(event.pointerId);wrapper.classList.add('is-swiping')}
   event.preventDefault();gesture.dx=dx;wrapper.dataset.direction=dx<0?'left':'right';article.style.transform='translateX('+Math.max(-article.clientWidth*.7,Math.min(article.clientWidth*.7,dx))+'px)';
  });
  article.addEventListener('pointerup',event=>{
   if(!gesture||gesture.id!==event.pointerId)return;
   const horizontal=gesture.horizontal,commit=horizontal&&Math.abs(gesture.dx)>=Math.min(100,article.clientWidth*.3);reset();
   if(horizontal)suppressClickUntil=performance.now()+400;if(commit)dismissItem(item);
  });
  article.addEventListener('pointercancel',reset);article.addEventListener('lostpointercapture',event=>{if(event.target===article)reset()});
  article.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation()}},true);
  return wrapper;
 }
 const ready=()=>Boolean(model.scope(context()));
 const reservations=()=>Array.isArray(window.RestoSharedReservations)?window.RestoSharedReservations:[];
 function capacity(){
  if(!window.RestoSharedDataLoaded||!window.RestoTablePressure?.availability||typeof TableStore==='undefined')return [];
  const now=Date.now(),date=model.day(now),p=model.paris(now),minute=Number(p.hour)*60+Number(p.minute);
  const times=[...new Set(reservations().filter(r=>r.date===date&&['reserved','confirmed','late','arrived'].includes(r.status)&&Number(r.time?.slice(0,2))*60+Number(r.time?.slice(3,5))>=minute-15).map(r=>r.time))].sort();
  const slots=times.map(time=>({time,info:window.RestoTablePressure.availability({date,time,guests:2,tables:TableStore.get().tables,reservations:reservations(),holds:window.RestoDraftHolds||[]})})).filter(x=>x.info.valid&&x.info.total>0&&x.info.remaining<=3).sort((a,b)=>a.info.remaining-b.info.remaining||a.time.localeCompare(b.time));
  const slot=slots[0];return slot?[{id:'capacity:'+date+':'+slot.time,source:'capacity',type:'capacity',group:'service',priority:'normal',title:slot.info.remaining===0?'Créneau complet':'Peu de tables disponibles',icon:'users',body:slot.time+' · '+slot.info.remaining+' table'+(slot.info.remaining>1?'s':'')+' compatible'+(slot.info.remaining>1?'s':'')+' pour 2 couverts. Vérifiez les disponibilités avant de proposer ce créneau.',createdAt:window.RestoBookingInterval?.(date,slot.time,1)?.[0]||0,action:'capacity',context:'Disponibilités'}]:[];
 }
 function collect(){
  if(!ready())return [];
  const role=context().role,common={reservations:reservations(),role,interval:window.RestoBookingInterval,now:Date.now()};
  const list=[...model.reminders(common),...model.events({...common,bookings:window.RestoFbReservationAlerts||[],changes:window.RestoFbChangeAlerts||[]}),...capacity()];
  const sync=window.RestoSyncState||'pending';
  if(navigator.onLine===false||sync&&sync!=='ok'||role==='fb_admin'&&window.RestoFbAlertsStatus!=='ready'){
   const pending=navigator.onLine!==false&&(!sync||sync==='pending'||role==='fb_admin'&&(!window.RestoFbAlertsStatus||window.RestoFbAlertsStatus==='pending'));
   list.push({id:'important:sync',source:'sync',type:'sync',pending,group:'important',priority:pending?'normal':'high',title:pending?'Vérification des notifications':sync==='readonly'?'Service en consultation seule':'Synchronisation indisponible',read:pending,body:pending?'Les informations du service sont en cours de vérification.':sync==='readonly'?'Les informations restent consultables. Contactez le responsable avant de reprendre les modifications.':navigator.onLine===false?'Vous êtes hors ligne. Les informations affichées peuvent être anciennes. La reconnexion sera automatique.':role==='fb_admin'&&window.RestoFbAlertsStatus==='error'?'Les notifications de la Réception ne sont pas à jour. Les informations disponibles restent affichées.':'Les informations du service peuvent être anciennes. Vérifiez la connexion avant toute action.',createdAt:0,action:'sync',context:'Connexion'});
  }
  if(sync==='ok'&&(role!=='fb_admin'||window.RestoFbAlertsStatus==='ready')&&navigator.onLine!==false&&state['important:sync']){delete state['important:sync'];save()}
  const release=window.RestoAppRelease?.notification?.();if(release)list.push(release);
  for(const [name,source] of sourceRegistry){
   if(!source.roles.includes(role))continue;
   try{for(const value of source.collect({context:context(),now:Date.now()})){if(value.restaurantId!==context().restaurantId||!value.id||value.resolved||value.expiresAt&&value.expiresAt<=Date.now())continue;list.push({...value,id:name+':'+value.id,source:name,group:value.group==='important'?'important':'service',snoozable:false,action:'source',handler:source.open})}}catch{list.push({id:name+':unavailable',source:name,type:'sync',group:'important',priority:'normal',title:'Une information est indisponible',body:'Cette source de notifications ne peut pas être vérifiée pour le moment.',createdAt:0,icon:'wifi-off',context:'Connexion'})}
  }
  return model.project(list,state);
 }
 async function markItem(item){
  if(item.source==='event'){
   if(window.RestoMarkFbNotificationsRead)await window.RestoMarkFbNotificationsRead(item.refs);
   else for(const ref of item.refs)await (ref.source==='booking'?window.RestoMarkFbAlertRead:window.RestoMarkFbChangeRead)?.(ref.id);
  }else setLocal(item.id,{readAt:Date.now()});
 }
 async function perform(fn,control){
  if(marking)return;marking=true;if(control)control.disabled=true;status.textContent='';
  try{await fn()}catch(error){window.RestoErrors?.diagnostic('notification-action',error);status.textContent='Action non confirmée. Vérifiez la connexion puis réessayez.'}finally{marking=false;if(control)control.disabled=false;update()}
 }
 async function markAll(){
  return perform(async()=>{
   const unread=items.filter(n=>!n.read&&!n.snoozed&&!(n.type==='sync'&&n.read));
   const events=unread.filter(n=>n.source==='event');
   if(events.length&&window.RestoMarkFbNotificationsRead)await window.RestoMarkFbNotificationsRead(events.flatMap(n=>n.refs));
   else for(const event of events)await markItem(event);
   for(const item of unread.filter(n=>n.source!=='event'))setLocal(item.id,{readAt:Date.now()});
   status.textContent='Notifications marquées comme lues. Les rappels actifs restent disponibles.';
  },allRead);
 }
 async function navigate(item){
  // Close the top-layer drawer before the existing draft confirmation can open.
  closePanel({restoreFocus:false});
  const destination=item.action==='capacity'?'reservationForm':item.action==='sync'||item.action==='source'&&item.targetScreen!=='reservations'?'administration':'reservations';
  const allowed=await window.RestoScreens?.request(destination);
  if(allowed!==true||window.RestoScreens?.current()!==destination)return;
  if(item.action==='sync'){window.RestoManagementCategories?.open('manageNetwork');await markItem(item);return}
  if(item.action==='capacity'){await markItem(item);return}
  if(item.action==='source'){await item.handler?.(item);await markItem(item);return}
  const r=reservations().find(r=>r.id===item.reservationId),a=item.event;
  const date=document.getElementById('reservationDate'),query=document.getElementById('reservationQuery');
  if(date&&(r||a?.starts_at)){date.value=r?.date||model.day(a.starts_at);date.dispatchEvent(new Event('change',{bubbles:true}))}
  if(query){query.value=r?(r.hotelRoom||r.client):(a?.hotel_room||a?.guest_name||'');query.dispatchEvent(new Event('input',{bubbles:true}))}
  window.dispatchEvent(new CustomEvent('restomanager:open-reservation',{detail:{view:r&&['completed','released','cancelled','no_show'].includes(r.status)||item.type==='cancelled'?'departed':'active',reservationId:item.reservationId}}));
  await markItem(item);
 }
 function card(item){
  const classes='rmNcCard'+(!item.read?' is-unread':'')+(item.priority==='high'||item.group==='important'?' is-important':'')+(item.source==='event'?' '+(item.type==='created'?'serviceReceptionBookingAlert':'serviceReceptionChangeAlert'):'');
  const article=node('article',classes);article.dataset.notificationId=item.id;
  const top=node('div','rmNcCardTop'),glyph=node('span','rmNcGlyph');glyph.append(icon(item.icon||'info'));
  const words=node('div','rmNcWords');words.append(node('h3','rmNcCardTitle',item.title));
  const meta=node('p','rmNcMeta',item.context||'Service');
  if(item.createdAt){const time=node('time','',new Date(item.createdAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));time.dateTime=new Date(item.createdAt).toISOString();meta.append(document.createTextNode(' · '),time)}
  meta.append(document.createTextNode(' · '+(item.pending?'En cours':item.snoozed?'Reportée':item.read?'Lue':'Non lue')));words.append(meta);top.append(glyph,words);if(!item.read){const dot=node('span','rmNcUnread');dot.setAttribute('aria-hidden','true');top.append(dot)}
  article.append(top,node('p','rmNcBody',item.body));
  if(item.groupedCount>1)article.append(node('p','rmNcMeta',item.groupedCount+' événements regroupés'));
  const actions=node('div','rmNcActions');
  if(item.action){const label=item.action==='capacity'?'Voir les disponibilités':item.action==='sync'?'Voir la connexion':item.action==='source'?item.actionLabel||'Voir le détail':'Voir la réservation';actions.append(button(label,()=>perform(()=>navigate(item)),'rmNcPrimary',item.action==='sync'?'wifi':'arrow-up-right'))}
  if(item.snoozable)actions.append(button(item.snoozed?'Réactiver le rappel':'Reporter 10 min',()=>{setLocal(item.id,{snoozedUntil:item.snoozed?0:Date.now()+600000});status.textContent=item.snoozed?'Rappel réactivé.':'Rappel reporté de 10 minutes.';update()},'rmNcSecondary',item.snoozed?'bell':'alarm-clock'));
  if(!item.read&&item.type!=='sync'){
   const readButton=button('',()=>perform(()=>markItem(item),readButton),'rmNcIconButton','check');readButton.setAttribute('aria-label','Marquer comme lue : '+item.title);readButton.title='Marquer comme lue';top.append(readButton);
  }
  article.append(actions);return article;
 }
 function render(force=false){
  if(!panel.open)return;
  if(historyView){window.RestoAppRelease?.renderHistory(scroll);return}
  title.textContent='Notifications';tools.hidden=false;history.textContent='Quoi de neuf ?';filter.setAttribute('aria-pressed',String(unreadOnly));
  const visible=items.filter(n=>showSnoozed?n.snoozed:!n.snoozed&&(!unreadOnly||!n.read||n.priority==='high'||n.type==='sync'));
  const count=items.filter(n=>!n.read&&!n.snoozed).length;
  subtitle.textContent=showSnoozed?'Rappels reportés · Réactivables à tout moment':count+' non lue'+(count>1?'s':'')+' · Espace '+(context()?.role==='reception'?'Réception':'Restaurant');
  allRead.hidden=!items.some(n=>!n.read&&!n.snoozed&&!(n.type==='sync'&&n.read));snoozed.hidden=!items.some(n=>n.snoozed)&&!showSnoozed;snoozed.textContent=showSnoozed?'Retour au flux':'Reportés ('+items.filter(n=>n.snoozed).length+')';
  const key=JSON.stringify([visible,showSnoozed,unreadOnly]);if(!force&&key===renderKey)return;renderKey=key;
  const newIds=new Set(!force?[...visible].filter(item=>!previousVisibleIds.has(item.id)&&!item.read).map(item=>item.id):[]);previousVisibleIds=new Set(visible.map(item=>item.id));
  const active=document.activeElement,focusId=active?.closest('[data-notification-id]')?.dataset.notificationId,focusLabel=active?.getAttribute('aria-label')||active?.textContent,position=scroll.scrollTop;
  scroll.dataset.releaseView='notifications';
  scroll.replaceChildren();
  if(!visible.length){const empty=node('div','rmNcEmpty'),glyph=node('span','rmNcGlyph');glyph.append(icon('bell-off'));empty.append(glyph,node('strong','',showSnoozed?'Aucun rappel reporté':unreadOnly?'Vous êtes à jour':'Aucune notification pour le moment'),node('p','',unreadOnly?'Les rappels importants encore actifs restent toujours visibles.':'Les informations utiles à votre équipe apparaîtront ici.'));scroll.append(empty)}
  const groups=[['attention','À votre attention',n=>n.group==='important'||n.priority==='high'],['service','Votre service',n=>n.group!=='important'&&n.priority!=='high'&&n.group!=='news'],['news','Nouveautés',n=>n.group==='news']];
  for(const [,label,predicate] of groups){const list=visible.filter(predicate);if(!list.length)continue;const section=node('section','rmNcSection'),h=node('h2','rmNcGroupTitle',label);h.append(node('span','',String(list.length)));section.append(h);for(const item of list)section.append(dismissibleCard(item.source==='release'?window.RestoAppRelease.card(item,{mark:()=>{setLocal(item.id,{readAt:Date.now()});update()},history:showHistory}):card(item),item));scroll.append(section)}
  for(const card of scroll.querySelectorAll('[data-notification-id]'))if(newIds.has(card.dataset.notificationId))card.dataset.rmNewNotice='true';
  scroll.scrollTop=position;
  if(focusId){const candidate=[...scroll.querySelectorAll('[data-notification-id]')].find(n=>n.dataset.notificationId===focusId);const control=[...(candidate?.querySelectorAll('button')||[])].find(b=>(b.getAttribute('aria-label')||b.textContent)===focusLabel);(control||title).focus({preventScroll:true})}
 }
 function update(){load();items=collect();const count=items.filter(n=>!n.read&&!n.snoozed).length;bell.hidden=!ready();badge.textContent=count>99?'99+':String(count);badge.hidden=!count;if(previousUnread!==null&&previousUnread!==count&&count&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){badge.animate?.([{boxShadow:'0 0 0 3px currentColor'},{boxShadow:'0 0 0 0 transparent'}],{duration:320});}previousUnread=count;bell.setAttribute('aria-label',count?'Notifications, '+count+' non lues':'Notifications, aucune non lue');if(!ready()&&panel.open)closePanel();render()}
 function mountModal(){if(panel.open)return;returnFocus=document.activeElement;previousOverflow=document.body.style.overflow;panel.showModal();bodyLocked=true;document.body.style.overflow='hidden';bell.setAttribute('aria-expanded','true')}
 function finishClose(restoreFocus=true){bell.setAttribute('aria-expanded','false');if(bodyLocked){bodyLocked=false;document.body.style.overflow=previousOverflow}if(restoreFocus)returnFocus?.focus?.({preventScroll:true});returnFocus=null}
 function closePanel({restoreFocus=true}={}){if(panel.open)panel.close();finishClose(restoreFocus)}
 function open(){if(!ready())return;mountModal();historyView=false;unreadOnly=false;showSnoozed=false;update();render(true);scroll.scrollTop=0;title.focus({preventScroll:true})}
 function showHistory(){if(!ready())return;if(!historyView)flowScroll=scroll.scrollTop;const release=items.find(n=>n.source==='release');if(release&&!release.read)setLocal(release.id,{readAt:Date.now()});mountModal();historyView=true;title.textContent='Quoi de neuf ?';subtitle.textContent='Les évolutions de votre application';tools.hidden=true;history.textContent='Retour aux notifications';window.RestoAppRelease?.renderHistory(scroll);scroll.scrollTop=0;update();title.focus({preventScroll:true})}
 panel.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const controls=[...panel.querySelectorAll('button,a[href],input,select,textarea')].filter(el=>!el.disabled&&el.getClientRects().length),first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===title)){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
 });
 panel.addEventListener('close',()=>{if(bodyLocked&&!panel.open)finishClose()});
 panel.addEventListener('click',e=>{if(e.target===panel){const r=panel.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel()}});
 for(const event of ['restomanager:notification-context','restomanager:v3-change','restomanager:supabase-snapshot','restomanager:fb-alerts','restomanager:connection-state','restomanager:app-release','online','offline'])window.addEventListener(event,update);
 window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null){storageKey='';load();update()}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});setInterval(()=>{if(!document.hidden)update()},60000);
 window.RestoNotifications={open,close:()=>closePanel({restoreFocus:false}),showHistory,refresh:update,registerSource(name,source){if(!/^[a-z][a-z0-9-]+$/.test(name)||['release','event','reminder','sync','capacity'].includes(name)||!Array.isArray(source.roles)||typeof source.collect!=='function')throw Error('Source de notifications invalide.');if(sourceRegistry.has(name))throw Error('Source déjà enregistrée.');sourceRegistry.set(name,source);update();return ()=>{sourceRegistry.delete(name);update()}}};update();
})();
