'use strict';
(function(){
 const m=window.RestoCloseoutModel,legacy=document.getElementById('serviceClosure');if(!m||!legacy)return;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const icon=name=>{const i=node('i');i.dataset.lucide=name;i.setAttribute('aria-hidden','true');return i};
 const button=(text,run,cls='rm012Secondary',glyph)=>{const b=node('button',cls);b.type='button';if(glyph)b.append(icon(glyph));b.append(document.createTextNode(text));b.addEventListener('click',()=>void run());return b};
 const root=node('section','rm012');root.id='rm012Workspace';root.hidden=true;root.setAttribute('aria-labelledby','rm012Title');legacy.after(root);
 const header=node('header','rm012Intro'),intro=node('div'),eyebrow=node('span','rm012Eyebrow','FIN DE SERVICE'),title=node('h2','','Services à régulariser');title.id='rm012Title';title.tabIndex=-1;
 intro.append(eyebrow,title,node('p','','Retrouvez les suivis oubliés et clôturez la bonne journée, après vérification.'));
 const reload=button('Actualiser',()=>load(),'rm012Secondary','refresh-cw');reload.dataset.focus='refresh';header.append(intro,reload);
 const status=node('p','rm012Status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const outcome=node('div','rm012Outcome');outcome.hidden=true;const outcomeText=node('span'),verify=button('Vérifier l’enregistrement',()=>sendPending(),'rm012Secondary');outcome.append(outcomeText,verify);
 const monitoring=node('p','rm012Help');monitoring.hidden=true;const body=node('div','rm012Body');root.append(header,monitoring,status,outcome,body);
 let scope='',data=null,selected='',stale=true,loading=false,busy=false,pending=null,confirming=false,sequence=0,view='pending',renderKey='',registered=false,dialog=null,loadError='';
 const context=()=>window.RestoNotificationContext;
 const authorized=()=>context()?.role==='fb_admin'&&Boolean(context()?.restaurantId);
 const capable=()=>window.RestoServiceCapabilities?.service_regularization===1;
 const enabled=()=>authorized()&&capable();
 const writable=()=>enabled()&&!stale&&!loading&&!busy&&!pending&&window.RestoSupabaseReady===true&&navigator.onLine!==false;
 const identity=()=>window.RestoNotificationModel?.scope(context())||'';
 async function db(){
  const module=await import('./supabase-service-bridge.js?v=20261117-rm012');
  const {user,profile}=await module.requireStaff();
  if(!authorized()||user.id!==context().userId||profile.restaurant_id!==context().restaurantId||profile.role!=='fb_admin')throw Object.assign(Error('Compte Restaurant non autorisé.'),{code:'42501'});
  return module.supabase;
 }
 async function call(client,name,args){let timer;try{return await Promise.race([Promise.resolve(client.rpc(name,args)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Délai de réponse dépassé.'),{code:'RM012_TIMEOUT'})),20000)})])}finally{clearTimeout(timer)}}
 function notificationUpdate(){window.RestoNotifications?.refresh()}
 function register(){
  if(registered||!window.RestoNotifications)return;registered=true;
  window.RestoNotifications.registerSource('rm012',{roles:['fb_admin'],collect(){
   if(!enabled())return [];if(!data&&loadError)throw Error('Source RM-012 indisponible');
   return m.notifications(data?.notification_days||[],context(),{stale,since:data?.detection_since,automatic:data?.automatic_closure===true});
  },open:item=>openDate(item.serviceDate)});
 }
 function sync(){
  register();const next=identity();
  if(next!==scope){scope=next;sequence++;data=null;selected='';pending=null;busy=false;loading=false;stale=true;loadError='';renderKey='';dialog?.close();}
  root.hidden=!authorized();
  if(!authorized())return;
  legacy.hidden=enabled();
  if(enabled()){
   const words=document.querySelector('#manageClosureToggle .managementGroupWords');
   if(words){words.querySelector('strong').textContent='Services à régulariser';words.querySelector('small').textContent='Vérification, clôture et historique des journées';}
  }
  if(!capable()){status.textContent='RM-012 est en attente de sa migration serveur. La régularisation sécurisée n’est pas encore disponible sur ce clone.';body.replaceChildren();reload.disabled=true;return}
  reload.disabled=loading||busy||Boolean(pending);
 }
 function message(error){
  if(error?.code==='RM001')return 'Cette réservation a été modifiée sur un autre poste. Actualisez et vérifiez son statut avant une nouvelle action.';
  if(['PGRST202','42883'].includes(error?.code))return 'La mise à jour RM-012 du serveur est incomplète. Aucune régularisation n’a été engagée.';
  if(error?.code==='42501')return 'Le compte connecté ne dispose plus des droits Restaurant nécessaires.';
  if(['RM012','22023','23514','P0002'].includes(error?.code))return error.message;
  return 'La réponse du serveur n’a pas pu être confirmée. Vérifiez la connexion.';
 }
 async function load({date=selected,append=false}={}){
  sync();if(!enabled()||navigator.onLine===false){stale=true;render();notificationUpdate();return}
  const ticket=++sequence,owner=scope,previous=data,requestedView=view;loading=true;stale=true;loadError='';render();
  try{
   const client=await db(),{data:value,error}=await call(client,'rm012_services_v1',{p_date:date||null,p_before:append?(requestedView==='history'?data?.history_next_before:data?.next_before)||null:null,p_limit:30});
   if(error)throw error;if(ticket!==sequence||owner!==identity()||!enabled()||navigator.onLine===false)return;
   if(!m.validate(value,context().restaurantId)||date&&value.selected.date!==date)throw Error('Réponse de fin de service incompatible.');
   if(append&&previous&&value.revision!==previous.revision){loading=false;return load({date})}
   data=append&&previous?{...value,
    services:requestedView==='pending'?[...new Map([...previous.services,...value.services].map(d=>[d.date,d])).values()]:previous.services,
    has_more:requestedView==='pending'?value.has_more:previous.has_more,next_before:requestedView==='pending'?value.next_before:previous.next_before,
    history:requestedView==='history'?[...new Map([...previous.history,...value.history].map(d=>[d.service_date,d])).values()]:previous.history,
    history_has_more:requestedView==='history'?value.history_has_more:previous.history_has_more,history_next_before:requestedView==='history'?value.history_next_before:previous.history_next_before}:value;
   selected=value.selected.date;stale=false;loadError='';
  }catch(error){if(ticket===sequence&&owner===identity()){loadError=message(error);stale=true;window.RestoErrors?.diagnostic('rm012-read',error)}}
  finally{if(ticket===sequence&&owner===identity()){loading=false;render();notificationUpdate()}}
 }
 function badge(text,kind=''){return node('span','rm012Badge '+kind,text)}
 function render(){
  sync();if(!enabled())return;
  status.textContent=loadError||(!data?'Chargement des journées…':stale?'Informations à revérifier. Les actions sont suspendues jusqu’à une lecture serveur confirmée.':loading?'Actualisation…':'Horaires et statuts vérifiés auprès du serveur.');
  monitoring.hidden=!data?.detection_since;if(!monitoring.hidden)monitoring.textContent='Suivi depuis le '+m.formatDate(data.detection_since)+'. '+(data.automatic_closure?'Clôture automatique après la fin de journée si tout est finalisé, avec vérification toutes les 5 minutes.':'Clôture sur confirmation du responsable.');
  status.classList.toggle('is-warning',stale&&Boolean(data)||Boolean(loadError));
  outcome.hidden=!pending;verify.disabled=busy||!window.RestoSupabaseReady||navigator.onLine===false;
  outcomeText.textContent=pending?'Une action sur le service du '+m.formatDate(pending.date)+' attend confirmation. Son identifiant est conservé pour éviter un doublon.':'';
  const key=JSON.stringify([data,stale,loading,busy,Boolean(pending),view]);if(key===renderKey)return;renderKey=key;
  const active=document.activeElement,focus=active?.dataset.focus,details=[...body.querySelectorAll('details[open]')].map(d=>d.dataset.detail);
  body.replaceChildren();if(!data)return;
  const layout=node('div','rm012Layout'),aside=node('aside','rm012Dates'),picker=node('details','rm012DatePicker');aside.setAttribute('aria-label','Choisir une journée');picker.dataset.detail='dates';picker.open=matchMedia('(min-width:1001px)').matches||details.includes('dates');const pickerTitle=node('summary','','Changer de journée · '+m.formatDate(selected));picker.append(pickerTitle);aside.append(picker);
  const tabs=node('div','rm012Tabs');for(const [value,label] of [['pending','À régulariser'],['history','Historique']]){const b=button(label,()=>{view=value;render()});b.setAttribute('aria-pressed',String(view===value));b.dataset.focus='view-'+value;tabs.append(b)}picker.append(tabs);
  const list=node('div','rm012DateList');
  const dates=view==='pending'?data.services:data.history;
  for(const day of dates){
   const date=day.date||day.service_date,b=button('',()=>selectDate(date),'rm012Date');b.setAttribute('aria-pressed',String(selected===date));b.dataset.focus='day-'+date;
   b.append(node('strong','',m.formatDate(date)),node('small','',view==='history'?'Clôturé le '+m.formatTime(day.closed_at):!day.ended?'Journée en cours':day.pending?day.pending+' réservation(s) à vérifier':day.active_holds?'Maintien de réservation actif':'Prêt à clôturer'));list.append(b);
  }
  if(!dates.length)list.append(node('p','rm012Empty',view==='history'?'Aucune journée clôturée dans cette page.':'Toutes les journées retrouvées sont à jour.'));
  picker.append(list);if(view==='history'?data.history_has_more:data.has_more){const more=button('Journées plus anciennes',()=>load({append:true}));more.disabled=loading;picker.append(more)}
  const custom=node('label','rm012CustomDate','Consulter une date précise'),input=node('input');input.type='date';input.lang='fr';input.value=selected;input.max=data.today;input.dataset.focus='date';input.disabled=busy||Boolean(pending);input.addEventListener('change',()=>{if(input.value)void selectDate(input.value)});custom.append(input);picker.append(custom);window.RestoCalendar?.attach(input);
  const detail=node('section','rm012Detail');detail.setAttribute('aria-labelledby','rm012DayTitle');const day=data.selected;
  const dayHeader=node('header','rm012DayHead'),dayWords=node('div'),h=node('h3','','Service du '+m.formatDate(day.date));h.id='rm012DayTitle';h.tabIndex=-1;dayWords.append(h,node('p','',day.ends_at?'Fin de journée prévue : '+m.formatTime(day.ends_at)+' · Europe/Paris':'Horaires de cette journée indisponibles'));
  dayHeader.append(dayWords,badge(day.closure?'Clôturé':!day.ended?'En cours':day.pending||day.active_holds?'À vérifier':'Prêt à clôturer',day.closure?'is-done':day.pending?'is-attention':''));detail.append(dayHeader);
  if(!day.ended&&!day.closure)detail.append(node('p','rm012Callout','La journée est encore en cours. Son suivi habituel reste disponible ; aucune régularisation ni clôture n’est autorisée ici.'));
  if(data.detection_since&&day.date<data.detection_since)detail.append(node('p','rm012Callout','Journée antérieure au début du suivi. Elle reste consultable à votre demande, sans rappel ni clôture automatique.'));
  if(day.closure)detail.append(node('p','rm012Callout','Service du '+m.formatDate(day.date)+(day.closure.close_mode==='automatic'?' clôturé automatiquement le ':' clôturé le ')+m.formatTime(day.closure.closed_at)+'. '+day.closure.served_covers+' couverts servis. Les autres journées restent indépendantes.'));
  const stats=node('dl','rm012Stats');for(const [label,value] of [['Tables occupées',day.occupied_tables],['Clients attendus',day.awaited],['Arrivés, non installés',day.arrived]]){const box=node('div');box.append(node('dt','',label),node('dd','',String(value)));stats.append(box)}detail.append(stats);
  if(day.active_holds)detail.append(node('p','rm012Callout',day.active_holds+' maintien(s) de réservation encore actif(s). Attendez leur expiration ou la fin de la saisie sur le poste concerné.'));
  const unresolved=day.items.filter(r=>!m.finalStates.has(r.status));
  const heading=node('h4','rm012ListTitle',unresolved.length?'Réservations à vérifier':'Vérifications terminées');detail.append(heading);
  if(!unresolved.length)detail.append(node('p','rm012Empty',day.closure?'Cette journée est archivée.':'Aucune réservation non finalisée. Vérifiez la date avant de clôturer.'));
  for(const item of unresolved)detail.append(itemCard(item,day));
  const close=button('Clôturer le service du '+m.formatDate(day.date),()=>closeDay(day),'rm012Primary rm012Close','clipboard-check');close.dataset.focus='close-day';close.disabled=!writable()||!day.can_close;detail.append(close);
  if(!day.can_close&&!day.closure&&day.ended)detail.append(node('p','rm012Help','La clôture restera indisponible tant que des éléments bloquants subsistent.'));
  const audit=node('details','rm012Audit');audit.dataset.detail='audit';const summary=node('summary','','Historique de cette journée ('+day.audit.length+')');audit.append(summary);
  if(!day.audit.length)audit.append(node('p','rm012Help','Aucune régularisation enregistrée pour cette journée.'));
  for(const entry of day.audit){const row=node('article','rm012AuditRow');row.append(node('strong','',entry.action==='close_service'?(entry.actor_kind==='system'?'Clôture automatique':'Clôture confirmée'):(m.labels[entry.old_status]||entry.old_status)+' → '+(m.labels[entry.new_status]||entry.new_status)),node('p','',m.formatTime(entry.performed_at)+' · '+entry.actor_label),node('small','','Service du '+m.formatDate(entry.service_date)));if(entry.reason)row.append(node('p','',entry.reason));audit.append(row)}
  if(day.audit.length===100)audit.append(node('p','rm012Help','Les 100 dernières traces de cette journée sont affichées. Les traces antérieures sont conservées sur le serveur.'));
  detail.append(audit);layout.append(aside,detail);body.append(layout);
  window.lucide?.createIcons();
  for(const d of body.querySelectorAll('details'))if(details.includes(d.dataset.detail))d.open=true;
  if(focus){const target=[...body.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===focus);(target||document.getElementById('rm012DayTitle'))?.focus({preventScroll:true})}
 }
 function itemCard(item,day){
  const article=node('article','rm012Item');article.dataset.reservationId=item.id;
  const head=node('div','rm012ItemHead'),words=node('div'),who=item.hotel_room?'Chambre '+item.hotel_room:item.guest_name||'Client';
  words.append(node('h5','',who),node('p','',m.formatTime(item.starts_at)+' · '+item.guests+' couvert(s)'));head.append(words,badge(m.labels[item.status]||'Statut à examiner',item.status==='seated'?'is-attention':''));article.append(head);
  article.append(node('p','rm012Table',item.tables.length?item.tables.map(t=>/^table\b/i.test(t.label)?t.label:'Table '+t.label).join(' + '):'Table non attribuée'));
  const actions=node('div','rm012Actions'),see=button('Voir la réservation',()=>seeReservation(item,day),'rm012Secondary','arrow-up-right');see.dataset.focus='see-'+item.id;actions.append(see);
  const available=m.available(item,day);
  for(const [i,key] of available.entries()){
   const b=button(m.actions[key].label,()=>regularize(item,day,key),i===0?'rm012Primary':'rm012Secondary');b.disabled=!writable();b.dataset.focus=key+'-'+item.id;
   if(i===0)actions.append(b);else{const extra=node('details','rm012Corrections');extra.dataset.detail=item.id;extra.append(node('summary','','Autre correction'),b);actions.append(extra)}
  }
  if(!available.length&&!m.finalStates.has(item.status)&&day.ended)article.append(node('p','rm012Help','Ce statut nécessite une vérification par le responsable. Aucune conversion automatique n’est proposée.'));
  article.append(actions);return article;
 }
 async function selectDate(date){if(busy||pending)return;await load({date});if(matchMedia('(max-width:1000px)').matches){const picker=body.querySelector('.rm012DatePicker');if(picker)picker.open=false}document.getElementById('rm012DayTitle')?.focus({preventScroll:true})}
 async function openDate(date){
  if(!authorized())return;const allowed=await window.RestoScreens?.request('administration');if(allowed!==true)return;
  window.RestoManagementCategories?.open('manageClosure');await selectDate(date);root.scrollIntoView({block:'start',behavior:'instant'});
 }
 async function seeReservation(item,day){
  if(!authorized())return;if(await window.RestoScreens?.request('reservations')!==true)return;
  const date=document.getElementById('reservationDate'),query=document.getElementById('reservationQuery');if(date){date.value=day.date;date.dispatchEvent(new Event('change',{bubbles:true}))}if(query){query.value=item.hotel_room||item.guest_name||'';query.dispatchEvent(new Event('input',{bubbles:true}))}
  window.dispatchEvent(new CustomEvent('restomanager:open-reservation',{detail:{view:m.finalStates.has(item.status)?'departed':'active',reservationId:item.id}}));
 }
 async function ask({title,description,day,item,reason=false,accept}){
  if(confirming)return null;confirming=true;const prior=document.activeElement,owner=identity();
  return new Promise(resolve=>{
   const d=node('dialog','rm012Confirm');d.setAttribute('role','alertdialog');d.setAttribute('aria-labelledby','rm012ConfirmTitle');d.setAttribute('aria-describedby','rm012ConfirmText');dialog=d;
   const form=node('form'),h=node('h2','',title);form.id='rm012ConfirmationForm';h.id='rm012ConfirmTitle';const desc=node('p','',description);desc.id='rm012ConfirmText';
   form.append(node('span','rm012Eyebrow','Service du '+m.formatDate(day.date)),h,desc);
   if(item)form.append(node('p','rm012Callout',(item.hotel_room?'Chambre '+item.hotel_room:item.guest_name)+' · '+item.tables.map(t=>t.label).join(' + ')+' · '+(m.labels[item.status]||item.status)));
   const label=node('label','',reason?'Motif de la correction':'Commentaire (facultatif)'),input=node('textarea');input.rows=3;input.maxLength=300;input.setAttribute('aria-label',reason?'Motif de la correction':'Commentaire (facultatif)');label.append(input);if(item||reason)form.append(label);
   const error=node('p','rm012Status');error.setAttribute('role','alert');form.append(error);
   const controls=node('div','rm012Actions'),cancel=button('Annuler',()=>d.close(),'rm012Secondary'),submit=node('button','rm012Primary',accept||'Confirmer');submit.type='submit';controls.append(cancel,submit);form.append(controls);d.append(form);document.body.append(d);
   let result=null;form.addEventListener('submit',e=>{e.preventDefault();if(owner!==identity()){d.close();return}const text=input.value.trim();if(reason&&text.length<5){error.textContent='Expliquez la correction en au moins 5 caractères.';input.focus();return}result=text;d.close()});
   d.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const controls=[...form.querySelectorAll('textarea,button')],i=controls.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();controls.at(-1).focus()}else if(!e.shiftKey&&i===controls.length-1){e.preventDefault();controls[0].focus()}});
   d.addEventListener('close',()=>{confirming=false;dialog=null;d.remove();prior?.focus?.({preventScroll:true});resolve(owner===identity()?result:null)},{once:true});d.showModal();cancel.focus();
  });
 }
 async function regularize(item,day,key){
  if(!writable()||!m.available(item,day).includes(key))return;const action=m.actions[key],owner=scope;
  const reason=await ask({title:action.title,description:action.description+' Nouveau statut : '+m.labels[action.target]+'.',day,item,reason:action.reason,accept:action.label});
  if(reason===null||owner!==identity()||!writable())return;
  pending={date:day.date,name:'rm012_regularize_v1',owner,args:{p_date:day.date,p_reservation:item.id,p_version:item.version,p_action:key,p_operation:crypto.randomUUID(),p_reason:reason||null}};await sendPending();
 }
 async function closeDay(day){
  if(!writable()||!day.can_close)return;const owner=scope;
  const answer=await ask({title:'Clôturer le service du '+m.formatDate(day.date)+' ?',description:'Les vérifications sont terminées. Cette clôture archive uniquement la journée du '+m.formatDate(day.date)+'. La date réelle de clôture sera conservée séparément.',day,accept:'Clôturer ce service'});
  if(answer===null||owner!==identity()||!writable())return;
  pending={date:day.date,name:'rm012_close_v1',owner,args:{p_date:day.date,p_operation:crypto.randomUUID()}};await sendPending();
 }
 async function sendPending(){
  if(!pending||busy||pending.owner!==identity()||!window.RestoSupabaseReady||navigator.onLine===false)return;
  const intent=pending;busy=true;render();
  try{
   const client=await db(),{error}=await call(client,intent.name,intent.args);if(error)throw error;if(intent.owner!==identity())return;
   pending=null;loadError='';status.textContent='Action confirmée. Mise à jour des journées…';await window.RestoRefreshSharedService?.();
  }catch(error){if(intent.owner===identity()){
   if(['RM001','RM012','22023','23514','42501','P0002','PGRST202','42883'].includes(error?.code))pending=null;
   loadError=message(error);stale=true;window.RestoErrors?.diagnostic('rm012-write',error);
  }}finally{if(intent.owner===identity()){busy=false;const text=loadError;await load({date:intent.date});if(text){status.textContent=text;outcome.hidden=!pending}}}
 }
 window.RestoCloseout={get enabled(){return enabled()},isBusy:()=>busy||Boolean(pending)||confirming,refresh:()=>load(),openDate};
 for(const event of ['restomanager:supabase-snapshot','online','restomanager:notification-context'])window.addEventListener(event,()=>{sync();if(enabled())void load()});
 window.addEventListener('restomanager:connection-state',()=>{sync();if(!window.RestoSupabaseReady){stale=true;render();notificationUpdate()}});
 window.addEventListener('offline',()=>{sequence++;loading=false;stale=true;render();notificationUpdate()});
 matchMedia('(min-width:1001px)').addEventListener('change',()=>{renderKey='';render()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&enabled())void load()});
 setInterval(()=>{if(!document.hidden&&enabled())void load()},30000);sync();if(enabled())void load();
})();
