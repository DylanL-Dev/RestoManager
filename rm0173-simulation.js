'use strict';
/* RM-017.3.1 — Browser-only local simulator. No auth, fetch, storage or RPC. */
(function(){
 const M=window.RM0173Pilot;
 const $=id=>document.getElementById(id);
 if(!M||!$('pilotCreateForm'))return;
 let state=M.empty(),view='owner';
 const labels={
  account:{none:'Non créé',pending_email:'Email fictif à confirmer',active:'Actif (fictif)',deletion_requested:'Suppression demandée (fictive)',deleted:'Exemple effacé'},
  restaurant:{none:'Non créé',active:'Actif (fictif)',closure_requested:'Fermeture demandée (fictive)',suspended:'Suspendu (fictif)',archived:'Archivé (fictif)',erased:'Exemple effacé'},
  actions:{
   create:'Inscription fictive enregistrée en mémoire',
   'confirm-email':'Confirmation email simulée — établissement fictif actif',
   'request-account-delete':'Demande fictive de suppression du compte',
   'request-closure':'Demande fictive de fermeture du restaurant',
   'root-suspend':'Root fictif : suspension',
   'root-restore':'Root fictif : réactivation',
   'root-archive':'Root fictif : archivage',
   'root-erase':'Root fictif : effacement de l’exemple'
  }
 };
 function feedback(message,isError=false){
  $('pilotFeedback').textContent=message;
  $('pilotFeedback').classList.toggle('is-error',isError);
 }
 function setView(target){
  view=target==='root'?'root':'owner';
  $('pilotOwnerPanel').hidden=view!=='owner';
  $('pilotRootPanel').hidden=view!=='root';
  $('pilotOwnerTab').classList.toggle('active',view==='owner');
  $('pilotRootTab').classList.toggle('active',view==='root');
  $('pilotOwnerTab').setAttribute('aria-pressed',String(view==='owner'));
  $('pilotRootTab').setAttribute('aria-pressed',String(view==='root'));
 }
 function render(){
  const profile=state.profile;
  $('pilotCreateForm').hidden=state.account!=='none';
  $('pilotEmailStage').hidden=state.account!=='pending_email';
  $('pilotOwnerActions').hidden=!['active','deletion_requested'].includes(state.account);
  $('pilotSummaryName').textContent=profile?.name||(state.restaurant==='erased'?'Exemple fictif effacé':'Aucun exemple créé');
  $('pilotSummaryType').textContent=profile?(profile.type==='hotel'?"Restaurant d'hôtel":'Restaurant indépendant'):'—';
  $('pilotAccountState').textContent=labels.account[state.account];
  $('pilotRestaurantState').textContent=labels.restaurant[state.restaurant];
  $('pilotSirenValue').textContent=profile?.siren||'—';
  $('pilotSiretValue').textContent=profile?M.maskSiret(profile.siret):'—';
  $('pilotEmailValue').textContent=profile?M.maskEmail(profile.email):'—';
  $('pilotRequestAccount').disabled=state.account!=='active';
  $('pilotRequestClosure').disabled=state.restaurant!=='active';
  $('pilotSuspend').disabled=!['active','closure_requested'].includes(state.restaurant);
  $('pilotRestore').disabled=state.restaurant!=='suspended';
  $('pilotArchive').disabled=state.restaurant!=='suspended';
  $('pilotErase').disabled=state.restaurant!=='archived'||$('pilotErasePhrase').value.trim()!=='EFFACER LA DÉMO';
  $('pilotEventCount').textContent=state.events.length+' étape'+(state.events.length>1?'s':'');
  const list=$('pilotEventLog');
  list.replaceChildren();
  if(!state.events.length){
   const item=document.createElement('li');item.textContent='Aucune action simulée pour le moment.';list.append(item);
  }else{
   for(const event of state.events){
    const item=document.createElement('li');item.textContent=labels.actions[event]||'Action inconnue';list.append(item);
   }
  }
 }
 function perform(action,input){
  try{
   state=M.next(state,action,input);
   if(action==='reset'){
    $('pilotCreateForm').reset();
    $('pilotErasePhrase').value='';
    setView('owner');
   }
   if(action==='root-erase')$('pilotErasePhrase').value='';
   render();
   feedback(action==='reset'?'Nouvel exemple prêt. Les données de la simulation précédente ont été abandonnées.':labels.actions[action]+'. Aucune donnée réelle modifiée.');
  }catch(error){feedback(String(error.message||'Action indisponible.'),true);}
 }
 $('pilotCreateForm').addEventListener('submit',event=>{
  event.preventDefault();
  perform('create',{
   type:$('pilotType').value,
   name:$('pilotName').value,
   siret:$('pilotSiret').value,
   email:$('pilotEmail').value
  });
 });
 $('pilotReset').addEventListener('click',()=>perform('reset'));
 $('pilotOwnerTab').addEventListener('click',()=>setView('owner'));
 $('pilotRootTab').addEventListener('click',()=>setView('root'));
 const actions={
  pilotConfirmEmail:'confirm-email',
  pilotRequestAccount:'request-account-delete',
  pilotRequestClosure:'request-closure',
  pilotSuspend:'root-suspend',
  pilotRestore:'root-restore',
  pilotArchive:'root-archive',
  pilotErase:'root-erase'
 };
 for(const [id,action] of Object.entries(actions))$(id).addEventListener('click',()=>{
  if(action==='root-erase'&&$('pilotErasePhrase').value.trim()!=='EFFACER LA DÉMO'){
   feedback('Saisissez exactement la phrase de confirmation fictive.',true);return;
  }
  perform(action);
 });
 $('pilotErasePhrase').addEventListener('input',render);
 setView('owner');
 render();
 window.lucide?.createIcons();
})();
