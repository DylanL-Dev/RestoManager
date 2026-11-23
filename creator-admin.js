// RM-019 — private Creator assistance centre.
// Works exclusively with the existing platform_reports schema and authorised
// Supabase RLS. Staff cannot see this view, and no additional RPC is needed.
export function installOwnerInbox({client}){
 const root=document.getElementById('ownerInbox');
 if(!root)return;
 const $=(tag,klass,text)=>{
  const node=document.createElement(tag);
  if(klass)node.className=klass;
  if(text!==undefined)node.textContent=text;
  return node;
 };
 const statuses={new:'Nouveau',reviewing:'En cours',resolved:'Résolu'};
 const kinds={bug:'Problème',question:'Assistance',suggestion:'Suggestion'};
 const dateFormat=new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Paris'});
 let busy=false,filter='open',urgentOnly=false,search='',selectedId=null,reports=[],names=new Map(),saving=false;
 const safeDate=date=>{
  const parsed=new Date(date);
  return Number.isNaN(parsed.getTime())?'Date non renseignée':dateFormat.format(parsed);
 };
 const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr-FR');
 root.replaceChildren();
 root.classList.add('ownerSupport');
 const header=$('div','ownerInboxHead ownerSupportHeader');
 const heading=$('div','ownerSupportTitle');
 heading.append($('span','ownerSupportEyebrow','VOTRE CENTRE DE SUPPORT'),
  $('h2','','Assistance des établissements'),
  $('p','ownerSupportLead','Tous les messages de vos restaurants, regroupés dans une interface de suivi.'));
 const refresh=$('button','secondary','Actualiser');
 refresh.id='ownerRefreshReports';refresh.type='button';
 header.append(heading,refresh);
 const stats=$('div','ownerSupportStats');
 const metric=(label,id,sub)=>{
  const card=$('div','ownerSupportStat');
  card.append($('small','',label),$('strong','', '—'),$('span','',sub));
  card.querySelector('strong').id=id;return card;
 };
 stats.append(
  metric('À traiter','ownerSupportOpen','Nouveaux et en cours'),
  metric('Urgences ouvertes','ownerSupportUrgent','À examiner en priorité'),
  metric('Résolus','ownerSupportResolved','Dans les 200 derniers reçus'));
 const toolbar=$('div','ownerSupportToolbar');
 const searchLabel=$('label','ownerSupportSearch');
 searchLabel.htmlFor='ownerReportSearch';
 searchLabel.append($('span','','Rechercher un signalement'));
 const searchInput=$('input');
 searchInput.type='search';searchInput.id='ownerReportSearch';searchInput.autocomplete='off';
 searchInput.placeholder='Sujet, restaurant, message ou identifiant…';
 searchInput.setAttribute('aria-controls','ownerSupportQueue');
 searchLabel.append(searchInput);
 const urgent=$('button','ownerSupportUrgentToggle','Urgences uniquement');
 urgent.id='ownerReportUrgentOnly';urgent.type='button';
 urgent.setAttribute('aria-pressed','false');
 toolbar.append(searchLabel,urgent);
 const filters=$('div','ownerReportFilters');
 filters.setAttribute('aria-label','Filtrer les signalements par statut');
 const chips=[['open','À traiter'],['all','Tous'],['new','Nouveaux'],['reviewing','En cours'],['resolved','Résolus']];
 const buttons=new Map();
 for(const [value,label] of chips){
  const button=$('button','ownerReportFilter',label);
  button.type='button';button.setAttribute('aria-pressed',String(filter===value));
  button.addEventListener('click',()=>{
   filter=value;
   for(const [key,entry] of buttons)entry.setAttribute('aria-pressed',String(key===value));
   render();
  });
  filters.append(button);buttons.set(value,button);
 }
 const summary=$('p','ownerSupportFeedback','Chargement des demandes…');
 summary.id='ownerReportsFeedback';summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');
 const workspace=$('div','ownerSupportWorkspace');
 const queuePanel=$('section','ownerSupportQueuePanel');
 queuePanel.setAttribute('aria-label','Liste des demandes');
 const queueHeader=$('div','ownerSupportQueueHeader');
 queueHeader.append($('h3','','Demandes reçues'));
 const visibleCount=$('span','ownerSupportCount','0 résultat');
 visibleCount.id='ownerSupportCount';
 queueHeader.append(visibleCount);
 const queue=$('div','ownerReportList ownerSupportQueue');
 queue.id='ownerSupportQueue';queue.setAttribute('aria-label','Demandes correspondant aux filtres');
 queuePanel.append(queueHeader,queue);
 const detail=$('section','ownerSupportDetail');
 detail.id='ownerSupportDetail';detail.setAttribute('aria-label','Fiche du signalement');
 const actionFeedback=$('p','ownerSupportActionFeedback','');
 actionFeedback.id='ownerSupportActionFeedback';actionFeedback.setAttribute('role','status');actionFeedback.setAttribute('aria-live','polite');
 workspace.append(queuePanel,detail);
 root.append(header,stats,toolbar,filters,summary,actionFeedback,workspace);
 const filtered=()=>reports.filter(r=>{
  if(!(filter==='all'||(filter==='open'?r.status!=='resolved':r.status===filter)))return false;
  if(urgentOnly&&(r.severity!=='urgent'||r.status==='resolved'))return false;
  const text=norm([r.title,r.description,r.id,r.reply_contact,r.screen,names.get(r.restaurant_id)].join(' '));
  return !search||text.includes(search);
 });
 function renderMetrics(){
  root.querySelector('#ownerSupportOpen').textContent=reports.filter(r=>r.status!=='resolved').length;
  root.querySelector('#ownerSupportUrgent').textContent=reports.filter(r=>r.severity==='urgent'&&r.status!=='resolved').length;
  root.querySelector('#ownerSupportResolved').textContent=reports.filter(r=>r.status==='resolved').length;
 }
 function renderDetail(item){
  detail.replaceChildren();
  if(!item){
   const empty=$('div','ownerSupportEmptyDetail');
   empty.append($('span','ownerSupportEmptySymbol','✉'),
    $('h3','','Sélectionnez une demande'),
    $('p','','Choisissez un signalement dans la liste pour consulter son détail et gérer son statut.'));
   detail.append(empty);return;
  }
  const top=$('div','ownerSupportDetailTop');
  const section=$('span','ownerSupportEyebrow','FICHE DU SIGNALEMENT');
  const reference=$('span','ownerSupportRef','Référence : '+item.id);
  top.append(section,reference);
  const badges=$('div','ownerSupportBadges');
  badges.append($('span','ownerReportTag',kinds[item.kind]||'Message'));
  if(item.severity==='urgent')badges.append($('span','ownerReportUrgent','Urgent · service bloqué'));
  badges.append($('span','ownerSupportStatusBadge ownerSupportStatus-'+item.status,statuses[item.status]||'Statut inconnu'));
  const title=$('h3','ownerSupportDetailTitle',item.title||'Demande sans objet');
  const meta=$('div','ownerSupportMeta');
  meta.append(
   $('span','',names.get(item.restaurant_id)||'Établissement non identifié'),
   $('span','',item.submitted_role==='reception'?'Réception':'Restaurant'),
   $('time','',safeDate(item.created_at)));
  const label=$('h4','ownerSupportBlockTitle','Message reçu');
  const body=$('p','ownerReportDescription ownerSupportMessage',item.description||'Aucune description.');
  detail.append(top,badges,title,meta,label,body);
  if(item.screen){
   const screen=$('div','ownerSupportInfoRow');
   screen.append($('strong','','Écran concerné'),$('span','',item.screen));
   detail.append(screen);
  }
  if(item.reply_contact){
   const contact=$('div','ownerSupportInfoRow');
   contact.append($('strong','','Contact communiqué'),$('span','',item.reply_contact));
   detail.append(contact);
  }
  const statusBox=$('div','ownerSupportChange');
  statusBox.append($('h4','','Suivi de la demande'),
   $('p','','Modifiez uniquement son statut. Le message et son historique restent conservés.'));
  const controls=$('div','ownerReportStatus');
  const field=$('label','','Statut');
  const selector=$('select');
  selector.id='ownerStatus_'+item.id;field.htmlFor=selector.id;
  for(const [value,caption] of Object.entries(statuses)){
   const option=$('option','',caption);option.value=value;selector.append(option);
  }
  selector.value=item.status;
  const saveState=$('span','ownerStatusFeedback','');
  controls.append(field,selector,saveState);statusBox.append(controls);detail.append(statusBox);
  selector.addEventListener('change',async()=>{
   if(saving)return;
   const old=item.status,next=selector.value;
   if(next===old)return;
   saving=true;selector.disabled=true;refresh.disabled=true;
   saveState.textContent='Enregistrement…';
   actionFeedback.textContent='';
   try{
    const {error}=await client.from('platform_reports').update({status:next}).eq('id',item.id);
    if(error)throw error;
    item.status=next;
    actionFeedback.textContent='Statut enregistré : '+statuses[next]+'.';
    window.dispatchEvent(new Event('restomanager:root-reports-updated'));
    render();
   }catch{
    selector.value=old;
    saveState.textContent='Impossible de modifier ce statut.';
    actionFeedback.textContent='La modification a échoué. Le signalement est conservé.';
   }finally{saving=false;selector.disabled=false;refresh.disabled=false;}
  });
 }
 function render(){
  const list=filtered();
  const selected=list.find(r=>r.id===selectedId)||list[0]||null;
  selectedId=selected?.id??null;
  renderMetrics();
  queue.replaceChildren();
  visibleCount.textContent=list.length+' résultat'+(list.length>1?'s':'');
  summary.textContent=reports.length+' signalement(s) dans l’historique · '+list.length+' affiché(s) · '+reports.filter(r=>r.status==='resolved').length+' résolu(s).';
  if(!list.length){
   queue.append($('p','ownerReportEmpty',filter==='open'&&!search&&!urgentOnly?'Aucun signalement à traiter.':'Aucun signalement dans cette catégorie.'));
  }
  for(const item of list){
   const card=$('button','ownerReport ownerSupportTicket');
   card.type='button';card.setAttribute('aria-pressed',String(item.id===selectedId));
   card.setAttribute('aria-controls','ownerSupportDetail');
   const head=$('div','ownerReportTop');
   const kind=$('span',item.severity==='urgent'?'ownerReportUrgent':'ownerReportTag',
    kinds[item.kind]||'Message');
   const when=$('time','',safeDate(item.created_at));
   head.append(kind,when);
   const title=$('strong','ownerSupportTicketTitle',item.title||'Demande sans objet');
   const venue=$('p','ownerReportLocation',names.get(item.restaurant_id)||'Établissement non identifié');
   const preview=$('p','ownerSupportTicketPreview',item.description||'');
   const state=$('span','ownerSupportStatusBadge ownerSupportStatus-'+item.status,statuses[item.status]||'Statut inconnu');
   card.append(head,title,venue,preview,state);
   card.addEventListener('click',()=>{selectedId=item.id;render();});
   queue.append(card);
  }
  renderDetail(selected);
 }
 async function refreshReports(){
  if(busy||saving)return;
  busy=true;refresh.disabled=true;
  summary.textContent='Chargement des signalements…';
  try{
   const {data,error}=await client.from('platform_reports')
    .select('id,restaurant_id,submitted_role,kind,severity,title,description,reply_contact,screen,status,created_at')
    .order('created_at',{ascending:false}).limit(200);
   if(error)throw error;
   const {data:restaurants,error:restaurantError}=await client.from('restaurants').select('id,name');
   if(restaurantError)throw restaurantError;
   names=new Map((restaurants||[]).map(r=>[r.id,r.name]));
   reports=data||[];
   render();
  }catch{
   queue.replaceChildren();
   detail.replaceChildren();
   queue.append($('p','ownerReportEmpty','Les demandes ne peuvent pas être chargées.'));
   detail.append($('p','ownerReportEmpty','Accès indisponible.'));
   summary.textContent='Impossible de charger les signalements. Vérifiez votre compte Créateur et la connexion.';
  }finally{busy=false;refresh.disabled=false;}
 }
 searchInput.addEventListener('input',()=>{search=norm(searchInput.value.trim());render();});
 urgent.addEventListener('click',()=>{
  urgentOnly=!urgentOnly;urgent.setAttribute('aria-pressed',String(urgentOnly));render();
 });
 refresh.addEventListener('click',()=>void refreshReports());
 void refreshReports();
}
