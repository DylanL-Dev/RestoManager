// Root console: read-only platform overview. Supabase RLS is the authority.
export function installCreatorConsole({client,installOwnerInbox}){
 const byId=id=>document.getElementById(id);
 const sections=[...document.querySelectorAll('[data-owner-section]')];
 const navigation=[...document.querySelectorAll('[data-owner-nav]')];
 const setText=(id,value)=>{const node=byId(id);if(node)node.textContent=String(value);};
 const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 let establishments=[],loaded=false,reportsLoaded=false,loading=false;
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
  const names={dashboard:'Vue générale',restaurants:'Établissements',reports:'Assistance & signalements',monitoring:'Supervision',settings:'Paramètres'};
  setText('ownerPageTitle',names[chosen]||'Vue générale');
  if(chosen==='reports'&&!reportsLoaded){installOwnerInbox({client});reportsLoaded=true;}
  if(chosen==='restaurants')renderEstablishments();
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
   setText('ownerTotalReports',reports.length===1000?'1000+':reports.length);
   setText('ownerOpenReports',reports.filter(x=>x.status!=='resolved').length);
   setText('ownerUrgentReports',reports.filter(x=>x.severity==='urgent'&&x.status!=='resolved').length);
   setText('ownerLoadState','Mis à jour le '+new Intl.DateTimeFormat('fr-FR',{timeStyle:'short',timeZone:'Europe/Paris'}).format(new Date()));
   loaded=true;renderEstablishments();
  }catch(error){
   setText('ownerLoadState','Chargement impossible : vérifiez les autorisations et la connexion.');
   if(!loaded){['ownerTotalRestaurants','ownerTotalReports','ownerOpenReports','ownerUrgentReports'].forEach(id=>setText(id,'—'));}
  }finally{loading=false;}
 }
 navigation.forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.ownerNav)));
 byId('ownerRefreshOverview')?.addEventListener('click',()=>void load());
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
