'use strict';
(function(){
 const button=document.getElementById('refreshAppBtn');
 if(!button)return;
 let busy=false;
 button.addEventListener('click',async()=>{
  if(busy)return;
  busy=true;button.disabled=true;
  try{
   if(window.RestoBookingDraft?.checking?.()){
    await window.RestoDialog?.alert?.('Une vérification ou un enregistrement de réservation est en cours. Attendez sa confirmation avant d’actualiser.',{title:'Réservation en cours'});
    return;
   }
   // Protect the draft before releasing the table hold, clearing caches or reloading.
   if(typeof window.RestoScreens?.confirmLeaveForRefresh!=='function'){
    await window.RestoDialog?.alert?.('La protection des formulaires n’est pas disponible. Actualisation interrompue.',{title:'Actualisation indisponible'});
    return;
   }
   if(!await window.RestoScreens.confirmLeaveForRefresh())return;
   button.classList.add('is-refreshing');
   button.setAttribute('aria-label','Actualisation en cours');
   await window.RestoBookingDraft?.close();
   if('serviceWorker' in navigator){
    const registration=await navigator.serviceWorker.getRegistration('./');
    if(registration)await registration.update();
   }
   if('caches' in window){
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('restomanager-shell-')).map(key=>caches.delete(key)));
   }
  }catch(error){
   console.warn('Actualisation du cache non disponible',error);
   // If the booking hold could not be released, do not silently reload.
   if(window.RestoBookingDraft?.checking?.())return;
  }finally{
   busy=false;button.disabled=false;
   button.classList.remove('is-refreshing');
   button.setAttribute('aria-label','Actualiser l’application');
  }
  const url=new URL(window.location.href);
  url.searchParams.set('refresh',String(Date.now()));
  window.location.replace(url.href);
 });
})();
