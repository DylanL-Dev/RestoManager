'use strict';
(function(){
 const button=document.getElementById('refreshAppBtn');
 let busy=false;
 const state=()=>({dirty:window.RestoScreens?.hasUnsavedChanges?.()??true,busy:Boolean(window.RestoBookingDraft?.checking?.()||window.RestoEditNavigation?.isBusy?.()||window.RestoCloseout?.isBusy?.()||window.RestoPublicBookings?.isBusy?.()||document.querySelector('form[aria-busy="true"]'))});
 // A worker asks every open client immediately before activating an application update.
 navigator.serviceWorker?.addEventListener('message',event=>{
  if(event.data?.type==='RESTO_UPDATE_CHECK')event.ports?.[0]?.postMessage({type:'RESTO_UPDATE_STATE',...state()});
 });
 async function tell(message,title='Mise à jour reportée'){
  await window.RestoDialog?.alert?.(message,{title});
 }
 async function askWorker(worker,type){
  if(!worker)throw Error('Le service de mise à jour est indisponible.');
  return new Promise((resolve,reject)=>{
   const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('La vérification des autres fenêtres n’a pas abouti.'))},4500);
   channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.ok?resolve(event.data):reject(Error(event.data?.message||'Une autre fenêtre doit terminer sa saisie.'))};
   worker.postMessage({type},[channel.port2]);
  });
 }
 async function request({kind='refresh',expectedVersion}={}){
  if(busy)return false;
  busy=true;if(button)button.disabled=true;
  try{
   if(state().busy){await tell('Une vérification ou un enregistrement de réservation est en cours. Attendez sa confirmation avant d’actualiser.','Réservation en cours');return false}
   if(typeof window.RestoScreens?.confirmLeaveForRefresh!=='function'){await tell('La protection des formulaires n’est pas disponible. Actualisation interrompue.','Actualisation indisponible');return false}
   // Both entry points use RM-011-A. Application updates never offer to discard a draft.
   if(!await window.RestoScreens.confirmLeaveForRefresh({preserveDraft:kind==='update'}))return false;
   if(navigator.onLine===false){await tell('Vous êtes hors ligne. La mise à jour sera disponible après reconnexion.');return false}
   if(kind==='update'&&expectedVersion){
    await window.RestoAppRelease?.check?.();
    if(window.RestoAppRelease?.availableVersion?.()!==expectedVersion){await tell('Cette version ne peut pas être confirmée. Réessayez après synchronisation.');return false}
   }
   // Recheck after every asynchronous boundary. A draft typed meanwhile must survive.
   const changed=()=>state().busy||state().dirty;
   if(changed())return false;
   const registration='serviceWorker' in navigator?await navigator.serviceWorker.getRegistration('./'):null;
   if(changed())return false;
   if(registration){
    await registration.update();
    if(changed())return false;
    // Includes other tabs even when still running the previous application version.
    const worker=registration.waiting||registration.active;
    if(worker){await askWorker(worker,'RESTO_CAN_UPDATE');if(changed())return false}
   }
   // No automatic cache purge: old clients may still depend on their exact asset versions.
   await window.RestoBookingDraft?.close();
   if(changed())return false;
   if(registration?.waiting){
    const waiting=registration.waiting;
    await askWorker(waiting,'RESTO_APPLY_UPDATE');
    if(waiting.state!=='activated')await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>{waiting.removeEventListener('statechange',changed);reject(Error('Activation non confirmée.'))},4500);
     function changed(){if(waiting.state==='activated'){clearTimeout(timer);waiting.removeEventListener('statechange',changed);resolve()}}
     waiting.addEventListener('statechange',changed);changed();
    });
    if(changed())return false;
   }
   const url=new URL(window.location.href);url.searchParams.set('refresh',String(Date.now()));
   window.location.replace(url.href);return true;
  }catch(error){
   window.RestoErrors?.diagnostic('app-update',error);
   await tell('La mise à jour n’a pas été appliquée. Vérifiez la connexion. Si une autre fenêtre contient une saisie, terminez-la puis réessayez.');return false;
  }finally{busy=false;if(button)button.disabled=false}
 }
 button?.addEventListener('click',()=>void request());
 window.RestoAppRefresh={request,state};
})();
