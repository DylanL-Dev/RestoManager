// RM-020.1 — Creator front-end shell only.
// Runs independently of DEV Root authentication. No Supabase access or network requests.
import {mountLucideIcons,createLucideIcon} from './creator-lucide.js?v=20261124-rm0201';
const shell=document.getElementById('ownerPanel');
const themeButton=document.getElementById('ownerThemeToggle');
const collapseButton=document.getElementById('ownerSidebarCollapse');
const desktop=window.matchMedia('(min-width: 1001px)');
const themeKey='rm:creator:theme';
const layoutKey='rm:creator:sidebar-collapsed';
const safeGet=(key)=>{try{return localStorage.getItem(key)}catch{return null}};
const safeSet=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
mountLucideIcons(document);
for(const button of document.querySelectorAll('#ownerSidebar [data-owner-nav]')){
 const label=button.querySelector('span:not(.ownerNavIcon)')?.textContent?.trim();
 if(label)button.setAttribute('aria-label',label);
}

function setTheme(theme){
 const dark=theme==='dark';
 document.documentElement.dataset.creatorTheme=dark?'dark':'light';
 themeButton?.setAttribute('aria-pressed',String(dark));
 themeButton?.setAttribute('aria-label',dark?'Activer le thème clair':'Activer le thème sombre');
 themeButton?.setAttribute('title',dark?'Activer le thème clair':'Activer le thème sombre');
 const icon=themeButton?.querySelector('[data-lucide]');
 if(icon){icon.dataset.lucide=dark?'sun':'moon';mountLucideIcons(themeButton);}
}
function setCollapsed(value){
 const enabled=Boolean(value)&&desktop.matches;
 shell?.classList.toggle('ownerShellCompact',enabled);
 collapseButton?.setAttribute('aria-pressed',String(enabled));
 collapseButton?.setAttribute('aria-label',enabled?'Déployer le menu latéral':'Réduire le menu latéral');
 collapseButton?.setAttribute('title',enabled?'Déployer le menu latéral':'Réduire le menu latéral');
 const icon=collapseButton?.querySelector('[data-lucide]');
 if(icon){icon.dataset.lucide=enabled?'panel-left-open':'panel-left-close';mountLucideIcons(collapseButton);}
}
setTheme(safeGet(themeKey)==='dark'?'dark':'light');
setCollapsed(safeGet(layoutKey)==='true');
themeButton?.addEventListener('click',()=>{
 const theme=document.documentElement.dataset.creatorTheme==='dark'?'light':'dark';
 setTheme(theme);safeSet(themeKey,theme);
});
collapseButton?.addEventListener('click',()=>{
 const next=!shell?.classList.contains('ownerShellCompact');
 setCollapsed(next);safeSet(layoutKey,String(next));
});
desktop.addEventListener?.('change',()=>setCollapsed(safeGet(layoutKey)==='true'));
// The legacy restaurant list is populated asynchronously. Upgrade only its
// existing decorative placeholders to the same local Lucide icons.
const restaurants=document.getElementById('ownerRestaurantList');
function upgradeRestaurantIcons(){
 for(const host of restaurants?.querySelectorAll('.ownerRestaurantIcon:not([data-creator-icon])')||[]){
  host.dataset.creatorIcon='true';
  const icon=createLucideIcon('store',22);
  if(icon)host.replaceChildren(icon);
 }
}
if(restaurants){
 new MutationObserver(upgradeRestaurantIcons).observe(restaurants,{childList:true,subtree:true});
 upgradeRestaurantIcons();
}
// Mark the current section in the topbar without changing the existing
// authorized navigation or extending the underlying client permissions.
const pageTitle=document.getElementById('ownerPageTitle');
const breadcrumb=document.getElementById('ownerBreadcrumbSection');
if(pageTitle&&breadcrumb){
 const update=()=>{breadcrumb.textContent=pageTitle.textContent||'Vue générale';};
 new MutationObserver(update).observe(pageTitle,{childList:true,characterData:true,subtree:true});
 update();
}
