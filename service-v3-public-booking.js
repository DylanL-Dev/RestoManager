'use strict';
(function(){
 const management=document.querySelector('[data-screen="administration"]');if(!management)return;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n},icon=name=>{const i=el('i');i.dataset.lucide=name;i.setAttribute('aria-hidden','true');return i};
 const button=(text,run,cls='rmWebSecondary')=>{const b=el('button',cls,text);b.type='button';b.addEventListener('click',()=>void run());return b};
 const group=el('details','managementGroup');group.id='manageWeb';const head=el('summary','managementGroupHead');head.innerHTML='<span class="managementGroupIcon" aria-hidden="true"><i data-lucide="calendar-days"></i></span><span class="managementGroupWords"><strong>Réservations en ligne</strong><small>Demandes clients et réglages du portail</small></span><span class="managementChevron" aria-hidden="true"><i data-lucide="chevron-down"></i></span>';
 const body=el('div','managementGroupBody'),root=el('section','rmWeb');root.id='rm015Workspace';root.setAttribute('aria-label','Réservations en ligne');body.append(root);group.append(head,body);management.append(group);
 const status=el('p','rmWebStatus');status.setAttribute('role','status');const retry=button('Vérifier l’action',()=>send(),'rmWebPrimary');retry.hidden=true;const settings=el('div','rmWebSettings'),requests=el('div','rmWebRequests'),publication=el('section','rmWebPublication');publication.setAttribute('aria-label','Publication du portail');root.append(status,retry,requests,publication,settings);
 let scope='',data=null,sequence=0,loading=false,busy=false,pending=null,dirty=false,dialog=null,registered=false,stale=true,reviewing=false;
 const context=()=>window.RestoNotificationContext,identity=()=>window.RestoNotificationModel?.scope(context())||'',capable=()=>window.RestoServiceCapabilities?.public_booking===1;
 const role=()=>context()?.role,authorized=()=>['fb_admin','reception'].includes(role())&&!!context()?.restaurantId;
 const readable=()=>authorized()&&capable()&&window.RestoSupabaseReady===true&&navigator.onLine!==false&&!busy&&!pending&&!reviewing;
 const writable=()=>readable()&&role()==='fb_admin'&&!stale;
 const model=window.RestoPublicationModel,publicationView=window.RestoPublicationUI?.mount({container:publication,identity,canAct:writable,onConfigure:focusSetting});
 if(!model){group.hidden=!authorized();status.textContent='Les réglages ne sont pas disponibles. Vérifiez la connexion, puis actualisez RestoManager.';return;}
 const format=value=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
 async function db(){const module=await import('./supabase-service-bridge.js?v=20261117-rm012');const {user,profile}=await module.requireStaff();if(user.id!==context()?.userId||profile.restaurant_id!==context()?.restaurantId||profile.role!==role())throw Object.assign(Error('Compte modifié.'),{code:'42501'});return module.supabase;}
 const call=async(action,payload)=>{const client=await db();let timer;try{return await Promise.race([client.rpc('rm015_staff_v1',{p_action:action,p_payload:payload||{}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Réponse non confirmée.'),{code:'NETWORK'})),15000)})]);}finally{clearTimeout(timer)}};
 function sync(){
  register();const own=identity();if(own!==scope){scope=own;sequence++;data=null;loading=false;busy=false;pending=null;dirty=false;stale=true;reviewing=false;dialog?.close();settings.replaceChildren();requests.replaceChildren();publicationView?.reset();}
  group.hidden=!authorized();if(!capable()){settings.replaceChildren();requests.replaceChildren();publicationView?.reset();status.textContent='Cette fonction n’est pas encore activée pour votre établissement.';}
 }
 function register(){
  if(registered||!window.RestoNotifications)return;registered=true;
  window.RestoNotifications.registerSource('rm015',{roles:['fb_admin'],collect(){
   if(!capable()||!data||data.restaurantId!==context()?.restaurantId)return [];if(stale)throw Error('Source Web en attente de vérification');
   const ids=new Set(data.requests.map(r=>r.id)),list=data.requests.filter(r=>Date.parse(r.deadline)>Date.now()).map(r=>({id:'request:'+r.id,restaurantId:data.restaurantId,type:'web-request',group:'service',title:r.state==='pending_change'?'Modification Web à confirmer':'Demande Web à confirmer',body:(r.contact.firstName||'Client')+' '+(r.contact.lastName||'')+' · '+r.draft.party+' personnes · '+r.draft.date.split('-').reverse().join('/')+' '+r.draft.time,createdAt:Date.parse(r.createdAt),revision:r.version,priority:'high',pending:true,dismissible:false,expiresAt:Date.parse(r.deadline),icon:'calendar-days',actionLabel:'Vérifier cette demande',requestId:r.id}));
   for(const e of data.events||[])if(!ids.has(e.reservation_id))list.push({id:'event:'+e.id,restaurantId:data.restaurantId,type:'web-event',group:'service',title:e.action==='cancel'?'Réservation Web annulée':e.action==='modify'?'Réservation Web modifiée':'Nouvelle réservation Web',body:(e.first_name||'Client')+' '+(e.last_name||'')+' · '+e.draft.party+' personnes · '+e.draft.date.split('-').reverse().join('/')+' '+e.draft.time,createdAt:Date.parse(e.occurred_at),revision:e.id,priority:e.action==='cancel'?'high':'normal',icon:'calendar-days',actionLabel:'Voir la réservation',reservationId:e.reservation_id});
   if(data.mailIssues)list.push({id:'email-issues',restaurantId:data.restaurantId,type:'web-email',group:'important',title:'Envoi d’email à vérifier',body:'Une confirmation nécessite une vérification de l’Assistance. Les réservations enregistrées restent valides.',priority:'normal',createdAt:0,revision:data.mailIssues,icon:'circle-help',actionLabel:'Voir les réservations en ligne'});
   return list;
  },open:async item=>{
   if(item.reservationId){if(await window.RestoScreens?.request('reservations'))window.dispatchEvent(new CustomEvent('restomanager:open-reservation',{detail:{reservationId:item.reservationId,view:'active'}}));}
   else if(await window.RestoScreens?.request('administration')){window.RestoManagementCategories?.open('manageWeb');document.querySelector('[data-web-request="'+item.requestId+'"]')?.scrollIntoView({block:'center'});}
  }});
 }
 function field(name,label,value,type='text',help=''){
  const row=el('label','rmWebField'),text=el('span','',label),input=el('input');input.name=name;input.id='rmWeb-'+name;input.type=type;input.value=value??'';text.id=input.id+'-label';input.setAttribute('aria-labelledby',text.id);
  if(type==='number'){const range=model.limits[name];input.min=String(range[0]);input.max=String(range[1]);input.step='1';}
  if(name==='slug'){input.pattern='[a-z0-9]+(-[a-z0-9]+)*';input.maxLength=80;input.minLength=3;input.placeholder='mon-restaurant';}
  if(name==='privacyContact')input.maxLength=500;row.append(text,input);if(help)row.append(el('small','',help));return row;
 }
 function renderSettings(){
  const current=settings.querySelector('form');if(current&&dirty){const reload=settings.querySelector('.rmWebReload');if(reload)reload.hidden=Number(current.dataset.version)===data.settings.version;return;}
  if(current&&settings.dataset.version===String(data.settings.version))return;
  settings.dataset.version=String(data.settings.version);
  settings.replaceChildren();if(role()!=='fb_admin'){settings.append(el('p','rmWebHelp','Les réglages et la confirmation des demandes sont réservés à l’équipe Restaurant.'));return;}
  const c=data.settings,disclosure=el('details','rmWebConfiguration'),summary=el('summary','','Réglages du portail');summary.tabIndex=0;disclosure.append(summary);const form=el('form','rmWebForm');form.id='rm015WebSettings';form.dataset.version=String(c.version);disclosure.open=!c.slug;const errors=el('div','rmWebValidation');errors.id='rmWebValidation';errors.setAttribute('role','alert');errors.hidden=true;form.append(errors);
  const enabled=el('label','rmWebCheck'),check=el('input');check.type='checkbox';check.name='enabled';check.checked=c.enabled===true;enabled.append(check,document.createTextNode('Accepter les réservations en ligne'));form.append(enabled);
  form.append(field('slug','Adresse publique',c.slug,'text','Cette adresse identifie votre restaurant dans le lien et le QR code. Un changement peut rendre les anciens supports inutilisables.'),field('maxParty','Nombre maximal de personnes',c.maxParty,'number','À partir de 4 personnes, une confirmation du Restaurant est nécessaire.'));
  const delay=el('label','rmWebField'),delayLabel=el('span','','Délai de confirmation');delayLabel.id='rmWeb-pendingMinutes-label';delay.append(delayLabel);const select=el('select');select.name='pendingMinutes';select.id='rmWeb-pendingMinutes';select.setAttribute('aria-labelledby',delayLabel.id);for(const value of [15,30,60,90,120,180]){const o=el('option','',value+' minutes');o.value=value;select.append(o)}if(c.pendingMinutes&&!Array.from(select.options).some(o=>Number(o.value)===c.pendingMinutes)){const custom=el('option','',c.pendingMinutes+' minutes');custom.value=c.pendingMinutes;select.append(custom);}select.value=String(c.pendingMinutes??60);delay.append(select);form.append(delay);
  form.append(el('p','rmWebHelp','Les horaires et le pourcentage de répartition des arrivées suivent les paramètres du service. Le portail respecte ce plafond et les tables réellement disponibles.'));
  const advanced=el('details','rmWebLegal'),aHead=el('summary','','Conditions et confidentialité');advanced.append(aHead,field('horizonDays','Réserver jusqu’à combien de jours ?',c.horizonDays??60,'number','De 1 à 180 jours après aujourd’hui.'),field('leadMinutes','Délai minimum avant la venue (minutes)',c.leadMinutes??30,'number','De 0 à 1 440 minutes. Exemple : 30 impose au moins une demi-heure avant la venue.'),field('cancellationMinutes','Délai limite d’annulation avant la venue (minutes)',c.cancellationMinutes??0,'number','0 permet l’annulation jusqu’à la venue ; 60 l’arrête une heure avant.'),field('privacyContact','Contact pour les données personnelles',c.privacyContact,'text','Indiquez le contact auquel vos clients pourront exercer leurs droits.'));
  for(const [key,label,max]of [['privacyNotice','Informations de confidentialité',3000],['cancellationNotice','Conditions d’annulation',1500]]){const l=el('label','rmWebField'),t=el('textarea');const caption=el('span','',label);caption.id='rmWeb-'+key+'-label';l.append(caption);t.name=key;t.id='rmWeb-'+key;t.setAttribute('aria-labelledby',caption.id);t.maxLength=max;t.rows=4;t.value=c[key]||'';l.append(t,el('small','',key==='privacyNotice'?'Précisez l’usage des coordonnées, le responsable, la durée de conservation et les droits des clients.':'Indiquez les règles d’annulation et comment joindre votre restaurant.'));advanced.append(l);}form.append(advanced);
  const save=el('button','rmWebPrimary','Enregistrer les réglages');save.type='submit';form.append(save);disclosure.append(form);settings.append(disclosure);updateConstraints(form);
  const reload=button('Recharger les réglages actuels',async()=>{if(!dirty)return;const owner=identity();if(!await window.RestoDialog?.confirm?.('Vos modifications non enregistrées seront remplacées par les réglages actuels.',{title:'Recharger les réglages ?',acceptLabel:'Recharger'}))return;if(owner!==identity())return;dirty=false;settings.dataset.version='';render();settings.querySelector('details').open=true;settings.querySelector('input')?.focus();},'rmWebSecondary rmWebReload');reload.hidden=true;settings.append(reload);

 }
 function render(){
  sync();if(!capable()||!authorized()||!data)return;renderSettings();publication.hidden=role()!=='fb_admin';if(role()==='fb_admin')publicationView?.render(data.settings,{dirty,stale,busy:busy||Boolean(pending)||reviewing});requests.replaceChildren();
  const heading=el('div','rmWebHead');const refresh=button('Actualiser',()=>load());refresh.dataset.webReadAction='true';heading.append(el('h3','','Demandes à confirmer'),refresh);requests.append(heading);
  if(!data.requests.length)requests.append(el('p','rmWebEmpty','Aucune demande en attente. Les réservations Web confirmées figurent dans Réservations.'));
  for(const r of data.requests){
   const article=el('article','rmWebRequest');article.dataset.webRequest=r.id;article.append(el('span','rmWebBadge',r.state==='pending_change'?'Modification demandée':'À confirmer'),el('h4','',(r.contact.firstName||'Client')+' '+(r.contact.lastName||'')),el('p','',r.draft.date.split('-').reverse().join('/')+' à '+r.draft.time+' · '+r.draft.party+' personnes'),el('p','rmWebDeadline','À confirmer avant le '+format(r.deadline)));
   if(r.state==='pending_change')article.append(el('p','rmWebHelp','La réservation initiale reste conservée si cette proposition est refusée ou expire.'));
   if(role()==='fb_admin'){
    article.append(el('p','rmWebHelp',[r.contact.email,r.contact.phone].filter(Boolean).join(' · ')));if(r.contact.notes)article.append(el('p','rmWebNote',r.contact.notes));const actions=el('div','rmWebActions');actions.append(button('Confirmer la demande',()=>ask(r,'approve'),'rmWebPrimary'),button('Refuser',()=>ask(r,'reject')));article.append(actions);
   }requests.append(article);
  }
  for(const b of root.querySelectorAll('button'))b.disabled=b.dataset.webReadAction?!readable():!writable();for(const i of settings.querySelectorAll('input,select,textarea'))i.disabled=!writable();
  retry.hidden=!pending;retry.disabled=busy||navigator.onLine===false||!window.RestoSupabaseReady;
  window.lucide?.createIcons();window.RestoNotifications?.refresh();
 }
 async function load(){
  sync();if(!capable()||!authorized()||loading||busy||navigator.onLine===false)return;
  const owner=scope,ticket=++sequence;loading=true;
  try{const value=await call('state');if(value.error)throw value.error;if(ticket!==sequence||owner!==identity())return;if(value.data?.schema!==1||value.data.restaurantId!==context().restaurantId||value.data.role!==role())throw Error('Contrat de réponse invalide');data=value.data;stale=false;status.textContent=pending?'La dernière réponse doit être vérifiée.':data.settings.enabled?'Réservations en ligne ouvertes.':'Réservations en ligne fermées. Les réservations existantes sont conservées.';}
  catch(e){if(owner===identity()){stale=true;status.textContent='Le suivi n’a pas pu être actualisé. Vérifiez la connexion avant toute action.';}}
  finally{if(owner===identity()){loading=false;render();}}
 }
 async function ask(r,action){
  if(!writable())return;const previous=document.activeElement,owner=scope,d=el('dialog','rmWebDialog');dialog=d;d.setAttribute('aria-labelledby','rmWebConfirmTitle');const title=el('h2','',action==='approve'?'Confirmer cette demande ?':'Refuser cette demande ?');title.id='rmWebConfirmTitle';
  d.append(title,el('p','',r.contact.firstName+' '+r.contact.lastName+' · '+r.draft.party+' personnes · '+r.draft.date.split('-').reverse().join('/')+' '+r.draft.time));
  if(r.state==='pending_change')d.append(el('p','','La réservation initiale sera remplacée seulement si la nouvelle proposition est confirmée.'));
  const actions=el('div','rmWebActions'),cancel=button('Revenir',()=>d.close()),accept=button(action==='approve'?'Oui, confirmer':'Oui, refuser',()=>{d.close();if(owner===identity()){pending={action,payload:{id:r.id,version:r.version},owner};void send();}},'rmWebPrimary');actions.append(cancel,accept);d.append(actions);document.body.append(d);
  d.addEventListener('close',()=>{dialog=null;d.remove();if(previous?.isConnected)previous.focus();});d.addEventListener('keydown',e=>{if(e.key==='Tab'){if(e.shiftKey&&document.activeElement===cancel){e.preventDefault();accept.focus();}else if(!e.shiftKey&&document.activeElement===accept){e.preventDefault();cancel.focus();}}});d.showModal();cancel.focus();
 }
 async function send(){
  if(!pending||busy||pending.owner!==identity()||navigator.onLine===false||!window.RestoSupabaseReady)return;
  const intent=pending;busy=true;render();status.textContent='Vérification et enregistrement…';
  try{const result=await call(intent.action,intent.payload);if(result.error)throw result.error;if(intent.owner!==identity())return;pending=null;if(intent.action==='configure'){dirty=false;data=result.data;}status.textContent=result.data?.state?'Cette demande a déjà été traitée. Le suivi est actualisé.':'Action confirmée par le serveur.';await window.RestoRefreshSharedService?.();}
  catch(e){if(intent.owner===identity()){if(['RM015','23514','22023','42501','P0002'].includes(e.code))pending=null;status.textContent=pending?'La réponse n’est pas confirmée. Vérifiez l’action avant de recommencer.':e.code==='RM015'?e.message:'L’action n’a pas été enregistrée. Vérifiez les réglages et actualisez.';}}
  finally{if(intent.owner===identity()){busy=false;const text=status.textContent;await load();status.textContent=text;render();}}
 }
 function focusSetting(name){
  const form=settings.querySelector('form');if(!form)return;for(const details of settings.querySelectorAll('details'))if(details===form.closest('details')||name&&details.contains(form.elements[name]))details.open=true;
  const target=form.elements[name]||form.querySelector('input');target?.scrollIntoView({block:'center'});target?.focus();
 }
 function updateConstraints(form){
  const opening=form.elements.enabled.checked;
  for(const name of ['slug','maxParty','privacyContact','privacyNotice','cancellationNotice'])form.elements[name].required=opening;
  form.elements.privacyContact.minLength=opening?5:0;form.elements.privacyNotice.minLength=opening?30:0;form.elements.cancellationNotice.minLength=opening?20:0;
 }
 function formValue(form){return model.fromForm(Object.fromEntries(new FormData(form)),form.elements.enabled.checked,Number(form.dataset.version));}
 function showErrors(form,errors){
  for(const old of form.querySelectorAll('.rmWebFieldError'))old.remove();for(const field of form.querySelectorAll('[aria-invalid]')){field.removeAttribute('aria-invalid');field.removeAttribute('aria-describedby');}
  const box=form.querySelector('.rmWebValidation'),names=Object.keys(errors);box.replaceChildren();box.hidden=!names.length;if(!names.length)return;
  box.append(el('p','','Vérifiez les informations indiquées ci-dessous.'));for(const [name,message]of Object.entries(errors)){const field=form.elements[name];if(!field)continue;const error=el('small','rmWebFieldError',message);error.id=field.id+'-error';field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',error.id);field.parentElement.append(error);}
  focusSetting(names[0]);
 }
 function changed(e){
  const form=e.target.closest('#rm015WebSettings');if(!form)return;dirty=true;updateConstraints(form);
  const error=form.querySelector('#'+e.target.id+'-error');if(error){error.remove();e.target.removeAttribute('aria-invalid');e.target.removeAttribute('aria-describedby');}
  publicationView?.render(data.settings,{dirty,stale,busy:busy||Boolean(pending)||reviewing});window.lucide?.createIcons();
 }
 root.addEventListener('input',changed);root.addEventListener('change',changed);
 let invalidQueued=false;root.addEventListener('invalid',e=>{const form=e.target.closest('#rm015WebSettings');if(!form)return;e.preventDefault();if(invalidQueued)return;invalidQueued=true;queueMicrotask(()=>{invalidQueued=false;if(form.isConnected)showErrors(form,model.validate(formValue(form)));});},true);
 root.addEventListener('submit',e=>{
  if(e.target.id!=='rm015WebSettings')return;e.preventDefault();void saveSettings(e.target);
 });
 async function saveSettings(form){
  if(!writable())return;const payload=formValue(form),errors=model.validate(payload);showErrors(form,errors);if(Object.keys(errors).length)return;
  const previous=document.activeElement,owner=scope,opening=!data.settings.enabled&&payload.enabled,closing=data.settings.enabled&&!payload.enabled,addressChanged=Boolean(data.settings.slug)&&payload.slug!==data.settings.slug;
  if(opening||closing||addressChanged){
   let message=opening?'Les clients pourront envoyer leurs demandes avec cette adresse : '+payload.slug+'. Maximum : '+payload.maxParty+' personnes. À partir de 4 personnes, votre accord sera nécessaire sous '+payload.pendingMinutes+' minutes. Les emails restent désactivés.':closing?'Les nouvelles demandes seront fermées. Les réservations existantes et leurs liens de gestion seront conservés.':'Les anciens liens et QR codes devront être remplacés. Le serveur refusera ce changement si des liens de réservation utilisent encore cette adresse.';
   if(addressChanged&&(opening||closing))message+=' L’adresse change aussi : les anciens liens et QR codes devront être remplacés.';
   reviewing=true;render();let accepted=false;try{accepted=await window.RestoDialog?.confirm?.(message,{title:opening?'Ouvrir le portail DEV ?':closing?'Fermer les nouvelles demandes ?':'Changer l’adresse publique ?',acceptLabel:opening?'Oui, ouvrir sur DEV':closing?'Oui, fermer':'Oui, changer l’adresse'});}catch{status.textContent='La confirmation n’a pas pu être affichée. Aucun réglage n’a été envoyé.';}finally{reviewing=false;}
   if(!accepted||owner!==identity()||!form.isConnected){render();if(owner===identity()&&previous?.isConnected)previous.focus();return;}
  }
  if(!writable()||owner!==identity())return;pending={action:'configure',payload:{...payload,operation:crypto.randomUUID()},owner};void send();
 }
 for(const event of ['restomanager:supabase-snapshot','restomanager:notification-context','online'])window.addEventListener(event,()=>{sync();if(capable())void load();});
 window.addEventListener('offline',()=>{stale=true;render();});window.addEventListener('restomanager:connection-state',()=>{if(!window.RestoSupabaseReady){stale=true;render();}else void load();});
 window.addEventListener('beforeunload',e=>{if(dirty||pending||busy){e.preventDefault();e.returnValue='';}});
 setInterval(()=>{if(!document.hidden&&capable())void load();},30000);
 window.RestoPublicBookings={isDirty:()=>dirty,isBusy:()=>busy||Boolean(pending)||Boolean(dialog)||reviewing,refresh:load};sync();if(capable())void load();
})();
