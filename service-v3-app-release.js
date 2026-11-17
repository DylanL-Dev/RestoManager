'use strict';
(function(){
 const current=document.querySelector('meta[name="restomanager-version"]')?.content;
 const channel=document.querySelector('meta[name="restomanager-channel"]')?.content;
 if(!current||!['dev','main'].includes(channel))return;
 const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
 const button=(text,fn,cls)=>{const el=node('button',cls,text);el.type='button';el.addEventListener('click',()=>void fn());return el};
 const storageKey='restomanager:release-history:v1:'+channel;
 let verified=null,onlineVerified=false,checking=null,lastCheck=0;
 const validate=value=>{
  if(value?.schema!==1||value.channel!==channel||!Array.isArray(value.releases)||!value.releases.length||value.releases.length>30)return false;
  const seen=new Set();
  for(const r of value.releases){
   if(typeof r.version!=='string'||!/^[a-zA-Z0-9.-]{1,70}$/.test(r.version)||seen.has(r.version)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||Date.parse(r.date)>Date.now()+86400000||typeof r.title!=='string'||r.title.length>150||!Array.isArray(r.changes)||r.changes.length<3||r.changes.length>5||r.changes.some(v=>typeof v!=='string'||v.length>500)||typeof r.impact!=='string'||typeof r.requiresReload!=='boolean')return false;
   seen.add(r.version);
  }
  return value.currentVersion===value.releases[0].version;
 };
 try{const cached=JSON.parse(localStorage.getItem(storageKey)||'null');if(validate(cached))verified=cached}catch{}
 const notify=()=>window.dispatchEvent(new Event('restomanager:app-release'));
 async function check(){
  if(checking)return checking;
  if(navigator.onLine===false){onlineVerified=false;notify();return false}
  checking=(async()=>{
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),8000);
   try{
    const manifest=await fetch('./app-release.json?check='+Date.now(),{cache:'no-store',signal:abort.signal});
    if(!manifest.ok)throw Error('Manifest indisponible');
    const data=await manifest.json();if(!validate(data))throw Error('Manifest invalide');
    // The manifest alone is not publication proof. Confirm the actual deployed entry page.
    const entry=await fetch('./v3-connected.html?release-check='+Date.now(),{cache:'no-store',signal:abort.signal});
    if(!entry.ok)throw Error('Application indisponible');
    const doc=new DOMParser().parseFromString(await entry.text(),'text/html');
    if(doc.querySelector('meta[name="restomanager-version"]')?.content!==data.currentVersion||doc.querySelector('meta[name="restomanager-channel"]')?.content!==channel)throw Error('Publication non concordante');
    verified=data;onlineVerified=true;lastCheck=Date.now();
    try{localStorage.setItem(storageKey,JSON.stringify(data))}catch{}
    notify();return true;
   }catch{onlineVerified=false;notify();return false}finally{clearTimeout(timer);checking=null}
  })();return checking;
 }
 function notification(){
  if(!onlineVerified||!verified)return null;
  const release=verified.releases[0],newer=verified.releases.findIndex(r=>r.version===current)>0,update=newer&&release.requiresReload;
  if(!newer&&release.version!==current)return null;
  if(!update&&Date.now()-Date.parse(release.date)>30*86400000)return null;
  return {id:'release:'+release.version,source:'release',type:'release',group:'news',priority:'low',title:update?'Nouvelle version disponible':release.title,body:update?'Une nouvelle version de RestoManager est publiée. Installez-la quand votre saisie est terminée.':release.requiresReload?'Découvrez les améliorations de cette version.':'Découvrez ces nouveautés. Aucune actualisation n’est nécessaire.',createdAt:Date.parse(release.date+'T12:00:00Z'),version:release.version,update,context:'RestoManager',release};
 }
 function card(item,{mark,history}){
  const article=node('article','rmNcCard rmNcRelease'+(!item.read?' is-unread':''));article.dataset.notificationId=item.id;
  const top=node('div','rmNcCardTop'),glyph=node('span','rmNcGlyph'),i=node('i');i.dataset.lucide='sparkles';i.setAttribute('aria-hidden','true');glyph.append(i);
  const words=node('div','rmNcWords');words.append(node('h3','rmNcCardTitle',item.title),node('p','rmNcMeta',new Date(item.createdAt).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})+' · '+(item.read?'Lue':'Non lue')));top.append(glyph,words);
  article.append(top,node('p','rmNcBody',item.body));const actions=node('div','rmNcActions');
  if(item.update)actions.append(button('Mettre à jour',async()=>{window.RestoNotifications?.close?.();await window.RestoAppRefresh?.request({kind:'update',expectedVersion:item.version})},'rmNcPrimary'));
  actions.append(button('Voir les nouveautés',()=>{mark();history()},item.update?'rmNcSecondary':'rmNcPrimary'));
  if(!item.read)actions.append(button('Marquer comme lue',mark,'rmNcTextButton'));
  article.append(actions);return article;
 }
 function renderHistory(container){
  const key=JSON.stringify([verified,onlineVerified,current]);if(container.dataset.releaseView==='history'&&container.dataset.releaseKey===key&&container.childElementCount)return;container.dataset.releaseKey=key;container.dataset.releaseView='history';
  container.replaceChildren();
  if(!onlineVerified)container.append(node('p','rmNcHelp',verified?'Vous êtes hors ligne ou la publication ne peut pas être vérifiée. Voici les dernières nouveautés vérifiées sur cet appareil.':'Les nouveautés ne peuvent pas être vérifiées pour le moment. Réessayez après reconnexion.'));
  if(!onlineVerified)container.append(button('Vérifier les nouveautés',async()=>{await check();renderHistory(container)},'rmNcSecondary'));
  if(!verified)return;
  for(const r of verified.releases){
   const article=node('article','rmNcHistoryEntry'),time=node('time','',new Date(r.date+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'long',year:'numeric'}));time.dateTime=r.date;
   article.append(time,node('h3','',r.title));const list=node('ul');for(const change of r.changes)list.append(node('li','',change));article.append(list,node('p','',r.impact));
   const learning=window.RestoTutorial?.guideForRelease?.(r.version);
   if(learning)article.append(button('Comprendre cette nouveauté',()=>{window.RestoNotifications?.close?.();window.RestoTutorial?.open?.({topic:learning})},'rmNcSecondary'));
   const installed=r.version===current;article.append(node('p','rmNcMeta',installed?'Version ouverte sur cet appareil':r.version===verified.currentVersion?'Version publiée':'Version précédente'));
   if(!r.requiresReload)article.append(node('p','rmNcMeta','Aucune actualisation nécessaire'));
   if(r.version===verified.currentVersion&&!installed&&onlineVerified&&r.requiresReload)article.append(button('Mettre à jour',async()=>{window.RestoNotifications?.close?.();await window.RestoAppRefresh?.request({kind:'update',expectedVersion:r.version})},'rmNcPrimary'));
   container.append(article);
  }
 }
 function installHelp(){
  const management=document.querySelector('[data-screen="administration"]');if(!management||document.getElementById('manageNews'))return;
  const wrapper=node('details','managementGroup');wrapper.id='manageNews';
  const summary=node('summary','managementGroupHead');summary.innerHTML='<span class="managementGroupIcon" aria-hidden="true"><i data-lucide="sparkles"></i></span><span class="managementGroupWords"><strong>Quoi de neuf ?</strong><small>Les améliorations de RestoManager</small></span><span class="managementChevron" aria-hidden="true"><i data-lucide="chevron-down"></i></span>';
  const body=node('div','managementGroupBody'),launch=button('Voir les nouveautés',()=>window.RestoNotifications?.showHistory(),'rmNewsLaunch'),glyph=node('i');glyph.dataset.lucide='sparkles';glyph.setAttribute('aria-hidden','true');launch.prepend(glyph);body.append(node('p','muted','Retrouvez les évolutions de votre application et les informations de mise à jour.'),launch);
  wrapper.append(summary,body);management.append(wrapper);
 }
 window.RestoAppRelease={check,notification,card,renderHistory,availableVersion:()=>onlineVerified&&verified?.releases.findIndex(r=>r.version===current)>0&&verified.releases[0].requiresReload?verified?.currentVersion:null};
 installHelp();
 if('serviceWorker' in navigator&&window.isSecureContext){navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{})}
 window.addEventListener('online',()=>void check());window.addEventListener('offline',()=>{onlineVerified=false;notify()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastCheck>60000)void check()});
 setInterval(()=>{if(!document.hidden)void check()},300000);void check();
})();
