'use strict';
(function(){
 const button=document.getElementById('refreshAppBtn');
 if(!button)return;
 let busy=false;
 button.addEventListener('click',async()=>{
  if(busy)return;
  busy=true;
  button.disabled=true;
  button.classList.add('is-refreshing');
  button.setAttribute('aria-label','Actualisation en cours');
  try{
   await window.RestoBookingDraft?.close();
   // Update the service worker and remove only application-shell caches.
   // Never touch localStorage: it contains reservations and configuration.
   if('serviceWorker' in navigator){
    const registration=await navigator.serviceWorker.getRegistration('./');
    if(registration)await registration.update();
   }
   if('caches' in window){
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('restomanager-shell-')).map(key=>caches.delete(key)));
   }
  }catch(error){console.warn('Actualisation du cache non disponible',error)}
  // A unique query bypasses stale cached HTML; the page then loads its versioned assets.
  const url=new URL(window.location.href);
  url.searchParams.set('refresh',String(Date.now()));
  window.location.replace(url.href);
 });
})();
