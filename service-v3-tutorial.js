// RestoManager V3 — contextual onboarding for authenticated Restaurant and Reception users.
// Informational only: no forms submitted, data written, or permissions changed.
export function installTutorial({user,profile,management}){
 if(!user?.id||!profile?.active||!management||document.getElementById('restoTourHelp'))return;
 const role=profile.role==='reception'?'reception':'restaurant';
 const storageKey='restomanager_tutorial_seen_v1_'+user.id;
 const $=selector=>document.querySelector(selector);
 const element=(tag,className,text)=>{
  const e=document.createElement(tag);
  if(className)e.className=className;
  if(text!==undefined)e.textContent=text;
  return e;
 };
 const base=[
  {screen:'tables',target:'.serviceIntro',title:'Bienvenue dans RestoManager',description:'Voici votre tableau de bord. Retrouvez les informations essentielles du service et accédez aux autres écrans depuis le menu.'},
  {screen:'reservationForm',target:'#reservationForm',title:'Ajouter une réservation',description:'Saisissez le client, la date, l’heure et le nombre de couverts. Ce parcours est une présentation : aucune réservation n’est créée.'},
  {screen:'reservations',target:'#reservations',title:'Retrouver les réservations',description:'Recherchez une réservation par date, nom ou numéro de chambre. Les deux équipes consultent les mêmes informations synchronisées.'},
  {screen:'tables',target:'#tables',title:'Visualiser les tables',description:'Repérez les tables disponibles, attendues ou occupées et consultez les détails utiles avant d’accueillir un client.'}
 ];
 const steps=role==='reception'
  ? [...base,
    {screen:'passages',target:'#receptionServiceOverview',title:'Suivre le service',description:'La Réception consulte le suivi du restaurant sans disposer des actions de placement réservées à l’équipe Restaurant.'},
    {screen:'administration',target:'#manageFeedback',title:'Besoin d’aide ?',description:'Depuis Gestion, vous pouvez signaler un problème ou transmettre une suggestion à l’assistance RestoManager.'}]
  : [...base,
    {screen:'passages',target:'#passages',title:'Accompagner le service',description:'L’équipe Restaurant peut gérer les clients de passage et suivre les arrivées selon les disponibilités et autorisations du service.'},
    {screen:'tables',target:'#rushDashboard',title:'Anticiper les arrivées',description:'Le tableau de charge des arrivées anticipe les créneaux chargés. Son engrenage ouvre les réglages du seuil conseillé.'},
    {screen:'administration',target:'#manageFeedback',title:'Assistance et réglages',description:'Dans Gestion, retrouvez les paramètres autorisés ainsi que le formulaire pour signaler un bug ou une suggestion.'}];
 const help=document.createElement('details');
 help.className='managementGroup restoTourHelp';help.id='restoTourHelp';
 const summary=element('summary','managementGroupHead');
 const badge=element('span','managementGroupIcon');badge.setAttribute('aria-hidden','true');
 const icon=element('i');icon.dataset.lucide='circle-help';badge.append(icon);
 const words=element('span','managementGroupWords');
 words.append(element('strong','','Didacticiel & aide'),element('small','','Découvrir les fonctions de RestoManager'));
 const chev=element('span','managementChevron');chev.setAttribute('aria-hidden','true');
 const chevIcon=element('i');chevIcon.dataset.lucide='chevron-down';chev.append(chevIcon);
 summary.append(badge,words,chev);
 const body=element('div','managementGroupBody');
 const explain=element('p','muted','Découvrez les écrans à votre rythme. Vous pouvez fermer le guide à tout moment et le retrouver ici.');
 const start=element('button','restoTourLaunch','Suivre le didacticiel');
 start.type='button';start.addEventListener('click',()=>openTour());
 body.append(explain,start);help.append(summary,body);
 management.append(help);
 window.lucide?.createIcons?.();
 let dock=null,highlight=null,stepIndex=0,source=null,busy=false;
 function markSeen(){try{localStorage.setItem(storageKey,'1')}catch(_){}}
 function cleanup(){
  if(highlight){highlight.classList.remove('restoTourTarget');highlight=null}
  dock?.remove();dock=null;busy=false;
  if(source&&source.isConnected)source.focus({preventScroll:true});
  source=null;
 }
 function close(){markSeen();cleanup()}
 function buildDock(){
  const panel=element('section','restoTourDock');panel.id='restoTourDock';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Didacticiel RestoManager');
  const head=element('div','restoTourDockHeader');
  const label=element('span','restoTourStepLabel');
  const x=element('button','restoTourClose','×');x.type='button';x.setAttribute('aria-label','Fermer le didacticiel');x.title='Fermer le didacticiel';x.addEventListener('click',close);
  head.append(label,x);
  const title=element('h2','restoTourTitle');
  const description=element('p','restoTourDescription');
  const foot=element('div','restoTourDockFooter');
  const prev=element('button','restoTourPrev','Précédent');prev.type='button';prev.addEventListener('click',()=>move(-1));
  const next=element('button','restoTourNext','Suivant');next.type='button';next.addEventListener('click',()=>move(1));
  foot.append(prev,next);panel.append(head,title,description,foot);
  panel._refs={label,title,description,prev,next};document.body.append(panel);
  return panel;
 }
 async function showStep(){
  const step=steps[stepIndex];if(!dock||!step)return;
  busy=true;
  try{
   await window.RestoScreens?.request?.(step.screen);
   // request() preserves unsaved work and may refuse to leave the active screen.
   if(window.RestoScreens?.current?.()!==step.screen){
    dock._refs.description.textContent='Terminez ou annulez votre saisie en cours avant de poursuivre le didacticiel.';
    return;
   }
   highlight?.classList.remove('restoTourTarget');highlight=null;
   const target=$(step.target);
   if(target){
    if(step.target==='#manageFeedback'&&target.tagName==='DETAILS')target.open=true;
    highlight=target;target.classList.add('restoTourTarget');
    target.scrollIntoView({block:'center',behavior:'smooth'});
   }
   dock._refs.label.textContent='Étape '+(stepIndex+1)+' sur '+steps.length;
   dock._refs.title.textContent=step.title;
   dock._refs.description.textContent=step.description;
   dock._refs.prev.disabled=stepIndex===0;
   dock._refs.next.textContent=stepIndex===steps.length-1?'Terminer':'Suivant';
  }finally{busy=false}
 }
 async function move(delta){
  if(busy)return;
  if(delta>0&&stepIndex===steps.length-1){close();return}
  const next=Math.max(0,Math.min(steps.length-1,stepIndex+delta));
  if(next===stepIndex)return;
  const previous=stepIndex;stepIndex=next;
  await showStep();
  if(window.RestoScreens?.current?.()!==steps[stepIndex].screen){stepIndex=previous}
 }
 function openTour(){
  markSeen();
  document.getElementById('restoTourWelcome')?.remove();
  if(dock){dock.focus?.();return}
  source=document.activeElement;stepIndex=0;
  dock=buildDock();void showStep();
 }
 function welcome(){
  if(document.getElementById('restoTourWelcome')||dock)return;
  const prompt=element('aside','restoTourWelcome');prompt.id='restoTourWelcome';
  prompt.setAttribute('aria-label','Découvrir RestoManager');
  const x=element('button','restoTourWelcomeClose','×');x.type='button';x.setAttribute('aria-label','Fermer cette suggestion');x.addEventListener('click',()=>{markSeen();prompt.remove()});
  const top=element('div','restoTourWelcomeTop');
  const text=element('div');text.append(element('strong','','Bienvenue sur RestoManager !'),element('p','','Nouveau ? Découvrez les principales fonctions avec un guide interactif.'));
  top.append(text,x);
  const actions=element('div','restoTourWelcomeActions');
  const later=element('button','restoTourLater','Plus tard');later.type='button';later.addEventListener('click',()=>{markSeen();prompt.remove()});
  const launch=element('button','restoTourStart','Suivre le didacticiel');launch.type='button';launch.addEventListener('click',openTour);
  actions.append(later,launch);prompt.append(top,actions);document.body.append(prompt);
 }
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&dock){event.preventDefault();close()}
 });
 try{if(localStorage.getItem(storageKey)!=='1')welcome()}catch(_){welcome()}
 window.RestoTutorial={start:openTour};
}
