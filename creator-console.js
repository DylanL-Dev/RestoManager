// Root console: read-only platform overview. Supabase RLS is the authority.
export function installCreatorConsole({client,installOwnerInbox}){
 const byId=id=>document.getElementById(id);
 const sections=[...document.querySelectorAll('[data-owner-section]')];
 const navigation=[...document.querySelectorAll('[data-owner-nav]')];
 const setText=(id,value)=>{const node=byId(id);if(node)node.textContent=String(value);};
 const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 let establishments=[],loaded=false,reportsLoaded=false,loading=false,lifecycleLoading=false,pilotLoading=false;
 const sidebar=byId('ownerSidebar'),navToggle=byId('ownerNavToggle'),navClose=byId('ownerNavClose'),navBackdrop=byId('ownerNavBackdrop');
 const mobileQuery=window.matchMedia('(max-width: 760px)');
 function setMenuOpen(open){
  const active=Boolean(open&&mobileQuery.matches);
  sidebar?.classList.toggle('open',active);
  if(navBackdrop)navBackdrop.hidden=!active;
  navToggle?.setAttribute('aria-expanded',String(active));
  navToggle?.setAttribute('aria-label',active?'Fermer la navigation':'Ouvrir la navigation');
  document.body.classList.toggle('ownerDrawerOpen',active);
 }

 const formatDate=date=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeZone:'Europe/Paris'}).format(date);
 setText('ownerToday',formatDate(new Date()));
 function navigate(view){
  const chosen=sections.some(s=>s.dataset.ownerSection===view)?view:'dashboard';
  for(const section of sections)section.hidden=section.dataset.ownerSection!==chosen;
  for(const link of navigation){const active=link.dataset.ownerNav===chosen;link.classList.toggle('active',active);link.setAttribute('aria-current',active?'page':'false');}
  const names={dashboard:'Vue générale',restaurants:'Établissements',reports:'Assistance & signalements',lifecycle:'Comptes & demandes',pilot:'Préparation inscriptions',monitoring:'Supervision',settings:'Paramètres'};
  setText('ownerPageTitle',names[chosen]||'Vue générale');
  if(chosen==='reports'&&!reportsLoaded){installOwnerInbox({client});reportsLoaded=true;}
  if(chosen==='restaurants')renderEstablishments();
  if(chosen==='lifecycle')void loadLifecycle();
  if(chosen==='pilot')void loadPilot();
  if(chosen==='dashboard'&&loaded)void load();
  setMenuOpen(false);
 }
 function renderEstablishments(){
  const container=byId('ownerRestaurantList');if(!container)return;
  container.replaceChildren();
  if(!establishments.length){container.append(make('p','ownerEmpty','Aucun établissement disponible.'));return;}
  establishments.forEach(restaurant=>{
   const row=make('article','ownerRestaurantRow');
   const icon=make('span','ownerRestaurantIcon','⌂');
   const name=make('div','ownerRestaurantName');
   name.append(make('strong','',restaurant.name||'Établissement sans nom'),make('small','','Identifiant : '+restaurant.id));
   const badge=make('span','ownerReadOnlyTag','Lecture seule');
   row.append(icon,name,badge);container.append(row);
  });
 }
 // RM-017.4: status of the public DEV frontend only; never claims to verify
 // private Supabase Auth settings, secret keys, invitation records or email delivery.
 async function loadPilot(){
  if(pilotLoading)return;
  pilotLoading=true;
  setText('ownerPilotSummary','Vérification du pilote DEV…');
  setText('ownerPilotStatusDetail','Lecture de la configuration publique du site.');
  setText('ownerPilotWebState','Vérification…');
  setText('ownerPilotCaptchaState','Vérification…');
  try{
   const response=await fetch(new URL('rm017-runtime.json',location.href),{
    cache:'no-store',credentials:'omit'
   });
   if(!response.ok)throw new Error('Configuration inaccessible');
   const config=await response.json();
   const valid=config?.schema===2&&config?.channel==='dev'&&
    config?.pilotOnly===true&&config?.confirmationEmailRequired===true&&
    config?.captchaRequired===true&&config?.redirectOrigin===location.origin&&
    typeof config?.enabled==='boolean';
   if(!valid){
    setText('ownerPilotSummary','Configuration à vérifier — pilote non validé');
    setText('ownerPilotStatusDetail','Le fichier public ne répond pas au contrat de sécurité RM-017. Aucune ouverture ne doit être présumée.');
    setText('ownerPilotWebState','Paramètres incohérents ou incomplets.');
   }else if(config.enabled===false){
    setText('ownerPilotSummary','Pilote fermé côté interface DEV');
    setText('ownerPilotStatusDetail','Le parcours d’inscription est désactivé sur ce site. Les contrôles serveur, email et anti-robots restent indépendants.');
    setText('ownerPilotWebState','Désactivée (enabled=false).');
   }else{
    setText('ownerPilotSummary','Activation côté interface détectée — vérifications obligatoires');
    setText('ownerPilotStatusDetail','La page autorise le pilote, mais ce seul fichier ne prouve ni les droits serveur ni le bon fonctionnement des emails et du CAPTCHA.');
    setText('ownerPilotWebState','Activation déclarée (enabled=true) : ne pas ouvrir au public sans recette.');
   }
   const key=config?.turnstileSiteKey;
   const validKey=typeof key==='string'&&/^0x[a-zA-Z0-9_-]{16,80}$/.test(key);
   setText('ownerPilotCaptchaState',validKey
    ?'Clé publique présente. La configuration du secret et les tests réels restent à vérifier.'
    :'Clé publique absente ou invalide. CAPTCHA non prêt pour un pilote.');
  }catch{
   setText('ownerPilotSummary','État indisponible — ne pas ouvrir');
   setText('ownerPilotStatusDetail','Impossible de lire la configuration Render DEV. Aucun statut serveur ne peut être déduit de cette erreur.');
   setText('ownerPilotWebState','Statut non vérifiable.');
   setText('ownerPilotCaptchaState','Statut non vérifiable.');
  }finally{pilotLoading=false;}
 }
 async function loadLifecycle(){
  if(lifecycleLoading)return;
  const status=byId('ownerLifecycleStatus'),list=byId('ownerLifecycleList');
  if(!status||!list)return;
  lifecycleLoading=true;
  status.textContent='Vérification des autorisations et chargement…';
  list.replaceChildren();
  try{
   // Strictly read-only: server RLS permits only the requestor and active platform admins.
   const {data,error}=await client.from('rm017_lifecycle_requests')
    .select('id,kind,restaurant_id,status,created_at,updated_at')
    .order('created_at',{ascending:false}).limit(100);
   if(error)throw error;
   status.textContent=(data||[]).length+' demande(s) visible(s) · lecture seule · aucune suppression possible.';
   if(!(data||[]).length){
    list.append(make('p','ownerLifecycleEmpty','Aucune demande reçue. Le pilote de suppression est désactivé.'));
   }
   for(const request of data||[]){
    const article=make('article','ownerLifecycleItem');
    const heading=make('div','ownerLifecycleItemHead');
    const kind=request.kind==='account_deletion'?'Suppression du compte':'Fermeture du restaurant';
    const state={
     requested:'En attente',reviewing:'En examen',
     closed_reviewed:'Dossier examiné — sans effacement',
     closed_rejected:'Demande rejetée — sans effacement'
    }[request.status]||'Statut inconnu';
    heading.append(make('strong','',kind),make('span','ownerReadOnlyTag',state));
    const when=new Date(request.created_at);
    const info=make('p','ownerLifecycleMeta',
     'Dossier '+String(request.id||'').slice(0,8)+' · '+(Number.isNaN(when.getTime())?'Date inconnue':formatDate(when))
      +(request.restaurant_id?' · Restaurant '+String(request.restaurant_id).slice(0,8):''));
    const detail=make('p','ownerLifecycleDetail','Consultation uniquement. Aucune action Root destructrice ni fermeture automatique.');
    article.append(heading,info,detail);list.append(article);
   }
  }catch{
   status.textContent='Accès impossible : assurez-vous d’utiliser un compte Root actif et de disposer de la migration DEV.';
  }finally{lifecycleLoading=false}
 }
 async function load(){
  if(loading)return;
  loading=true;setText('ownerLoadState','Actualisation…');
  try{
   // RLS must grant active platform administrators read access to these rows.
   const [restaurantsResponse,reportsResponse]=await Promise.all([
    client.from('restaurants').select('id,name').order('name',{ascending:true}),
    client.from('platform_reports').select('id,status,severity,created_at').order('created_at',{ascending:false}).limit(1000)
   ]);
   if(restaurantsResponse.error)throw restaurantsResponse.error;
   if(reportsResponse.error)throw reportsResponse.error;
   establishments=restaurantsResponse.data||[];
   const reports=reportsResponse.data||[];
   setText('ownerTotalRestaurants',establishments.length);
   setText('ownerNewReports',reports.filter(x=>x.status==='new').length);
   setText('ownerReviewingReports',reports.filter(x=>x.status==='reviewing').length);
   setText('ownerUrgentReports',reports.filter(x=>x.severity==='urgent'&&x.status!=='resolved').length);
   setText('ownerLoadState','Mis à jour le '+new Intl.DateTimeFormat('fr-FR',{timeStyle:'short',timeZone:'Europe/Paris'}).format(new Date()));
   loaded=true;renderEstablishments();
  }catch(error){
   setText('ownerLoadState','Chargement impossible : vérifiez les autorisations et la connexion.');
   if(!loaded){['ownerTotalRestaurants','ownerNewReports','ownerReviewingReports','ownerUrgentReports'].forEach(id=>setText(id,'—'));}
  }finally{loading=false;}
 }
 navigation.forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.ownerNav)));
 byId('ownerRefreshOverview')?.addEventListener('click',()=>void load());
 byId('ownerRefreshLifecycle')?.addEventListener('click',()=>void loadLifecycle());
 byId('ownerRefreshPilot')?.addEventListener('click',()=>void loadPilot());
 window.addEventListener('restomanager:root-reports-updated',()=>void load());
 navToggle?.addEventListener('click',()=>setMenuOpen(!sidebar?.classList.contains('open')));
 navClose?.addEventListener('click',()=>{setMenuOpen(false);navToggle?.focus();});
 navBackdrop?.addEventListener('click',()=>{setMenuOpen(false);navToggle?.focus();});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&sidebar?.classList.contains('open')){event.preventDefault();setMenuOpen(false);navToggle?.focus();}
 });
 mobileQuery.addEventListener?.('change',()=>setMenuOpen(false));
 navigate('dashboard');
 void load();
 return {refresh:load};
}
