// Creator's private inbox. All reads and status updates are authorized by
// Supabase policies, never by a client-side isAdmin flag alone.
export function installOwnerInbox({client}){
 const root=document.getElementById('ownerInbox');
 if(!root)return;
 const $=(tag,klass,text)=>{const n=document.createElement(tag);if(klass)n.className=klass;if(text!==undefined)n.textContent=text;return n;};
 let busy=false,filter='open';
 root.replaceChildren();
 const top=$('div','ownerInboxHead');
 const title=$('h2','', 'Signalements des établissements');
 const refresh=$('button','secondary','Actualiser');
 refresh.type='button';refresh.id='ownerRefreshReports';
 top.append(title,refresh);
 const summary=$('p','muted','Liste privée des messages transmis depuis Gestion.');
 const filters=$('div','ownerReportFilters');
 const chips=[['open','À traiter'],['all','Tous'],['new','Nouveaux'],['reviewing','En cours'],['resolved','Résolus']];
 const buttons=new Map();
 const list=$('div','ownerReportList');
 const feedback=$('p','muted','');feedback.id='ownerReportsFeedback';feedback.setAttribute('role','status');
 for(const [value,label] of chips){
  const b=$('button','ownerReportFilter',label);b.type='button';
  b.setAttribute('aria-pressed',String(filter===value));
  b.addEventListener('click',()=>{filter=value;for(const [key,button] of buttons)button.setAttribute('aria-pressed',String(key===value));void refreshReports()});
  buttons.set(value,b);filters.append(b);
 }
 root.append(top,summary,filters,feedback,list);
 async function refreshReports(){
  if(busy)return;
  busy=true;refresh.disabled=true;feedback.textContent='Chargement des signalements…';
  list.replaceChildren();
  try{
   const {data:reports,error}=await client.from('platform_reports')
    .select('id,restaurant_id,submitted_role,kind,severity,title,description,reply_contact,screen,status,created_at')
    .order('created_at',{ascending:false}).limit(200);
   if(error)throw error;
   const {data:restaurants,error:restaurantError}=await client.from('restaurants').select('id,name');
   if(restaurantError)throw restaurantError;
   const names=new Map((restaurants||[]).map(r=>[r.id,r.name]));
   const visible=(reports||[]).filter(r=>filter==='all'||(filter==='open'?r.status!=='resolved':r.status===filter));
   feedback.textContent=(reports||[]).length+' signalement(s) dans l’historique · '+visible.length+' affiché(s) · '+(reports||[]).filter(r=>r.status==='resolved').length+' résolu(s).';
   if(!visible.length)list.append($('p','ownerReportEmpty',filter==='open'?'Aucun signalement à traiter.':'Aucun signalement dans cette catégorie.'));
   for(const item of visible){
    const article=$('article','ownerReport');
    const row=$('div','ownerReportTop');
    const kind={bug:'Bug',question:'Contact',suggestion:'Suggestion'}[item.kind]||'Message';
    const tag=$('span',item.severity==='urgent'?'ownerReportUrgent':'ownerReportTag',kind+(item.severity==='urgent'?' · Urgent':''));
    const date=$('time','',new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Paris'}).format(new Date(item.created_at)));
    row.append(tag,date);
    const heading=$('h3','',item.title);
    const location=$('p','ownerReportLocation',(names.get(item.restaurant_id)||'Établissement non identifié')+' · '+(item.submitted_role==='reception'?'Réception':'Restaurant')+' · '+item.screen);
    const description=$('p','ownerReportDescription',item.description);
    const contact=item.reply_contact?$('p','ownerReportContact','Contact : '+item.reply_contact):null;
    const statusRow=$('div','ownerReportStatus');
    const label=$('label','', 'Statut');
    const selector=$('select');selector.id='ownerStatus_'+item.id;
    label.htmlFor=selector.id;
    for(const [value,name] of [['new','Nouveau'],['reviewing','En cours'],['resolved','Résolu']]){
     const option=$('option','',name);option.value=value;selector.append(option);
    }
    selector.value=item.status;
    const saveState=$('span','ownerStatusFeedback','');
    selector.addEventListener('change',async()=>{
     const old=item.status;
     selector.disabled=true;saveState.textContent='Enregistrement…';
     try{
      const {error}=await client.from('platform_reports').update({status:selector.value}).eq('id',item.id);
      if(error)throw error;
      item.status=selector.value;saveState.textContent='Statut enregistré';
      window.dispatchEvent(new Event('restomanager:root-reports-updated'));
      if(filter==='open'&&item.status==='resolved')void refreshReports();
     }catch{
      selector.value=old;saveState.textContent='Impossible de modifier ce statut.';
     }finally{selector.disabled=false}
    });
    statusRow.append(label,selector,saveState);
    article.append(row,heading,location,description);
    if(contact)article.append(contact);
    article.append(statusRow);
    list.append(article);
   }
  }catch{
   feedback.textContent='Impossible de charger les signalements. Vérifiez votre compte Créateur et la connexion.';
  }finally{busy=false;refresh.disabled=false}
 }
 refresh.addEventListener('click',()=>void refreshReports());
 void refreshReports();
}
