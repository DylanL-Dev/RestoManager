// BUG-01: staff-only submission. No client-side list/retrieval of reports.
// Author and establishment are verified again by Postgres RLS.
export function installFeedback({supabase,profile,management}){
 if(!profile?.active||!['fb_admin','reception'].includes(profile.role))return;
 if(management.querySelector('#manageFeedback'))return;
 const group=document.createElement('details');group.id='manageFeedback';group.className='managementGroup';
 group.innerHTML=`
  <summary class="managementGroupHead">
   <span class="managementGroupIcon" aria-hidden="true"><i data-lucide="bug"></i></span>
   <span class="managementGroupWords"><strong>Signaler un problème</strong><small>Bug, question ou suggestion pour le créateur</small></span>
   <span class="managementChevron" aria-hidden="true"><i data-lucide="chevron-down"></i></span>
  </summary>
  <div class="managementGroupBody">
   <p class="muted">Votre message est transmis en privé au créateur de RestoManager. Il n'est pas visible par vos collègues. N'inscrivez pas de données personnelles de clients ni de mots de passe.</p>
   <form id="reportIssueForm" class="reportIssueForm">
    <label for="reportIssueKind">Nature du message</label>
    <select id="reportIssueKind" required>
     <option value="bug">Un problème / un bug</option>
     <option value="question">Contacter le créateur</option>
     <option value="suggestion">Une suggestion</option>
    </select>
    <label for="reportIssueSeverity">Importance</label>
    <select id="reportIssueSeverity" required>
     <option value="normal">Normale</option>
     <option value="urgent">Urgente — bloque le service</option>
    </select>
    <label for="reportIssueTitle">Sujet</label>
    <input id="reportIssueTitle" type="text" maxlength="120" minlength="3" required placeholder="Ex. Impossible de modifier une réservation">
    <label for="reportIssueDescription">Que s'est-il passé ?</label>
    <textarea id="reportIssueDescription" minlength="10" maxlength="4000" rows="5" required placeholder="Décrivez l'écran, l'action effectuée et le résultat obtenu…"></textarea>
    <label for="reportIssueContact">Votre prénom ou contact pour une réponse (facultatif)</label>
    <input id="reportIssueContact" type="text" maxlength="160" placeholder="Ex. Camille, réception / téléphone professionnel">
    <button id="reportIssueSubmit" type="submit"><i data-lucide="send" aria-hidden="true"></i> Envoyer mon signalement</button>
    <p id="reportIssueFeedback" role="status" aria-live="polite"></p>
   </form>
  </div>`;
 const target=management.querySelector('#manageNetwork');
 if(target)target.before(group);else management.append(group);
 const form=group.querySelector('#reportIssueForm');
 const feedback=group.querySelector('#reportIssueFeedback');
 const submit=group.querySelector('#reportIssueSubmit');
 form.addEventListener('submit',async event=>{
  event.preventDefault();event.stopImmediatePropagation();
  if(submit.disabled||!form.reportValidity())return;
  submit.disabled=true;feedback.textContent='Envoi sécurisé en cours…';
  const data={
   restaurant_id:profile.restaurant_id,
   submitted_by:null,
   submitted_role:profile.role,
   kind:group.querySelector('#reportIssueKind').value,
   severity:group.querySelector('#reportIssueSeverity').value,
   title:group.querySelector('#reportIssueTitle').value.trim(),
   description:group.querySelector('#reportIssueDescription').value.trim(),
   reply_contact:group.querySelector('#reportIssueContact').value.trim()||null,
   screen:window.RestoScreens?.current?.()||'administration'
  };
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser();
   if(userError||!user)throw new Error('Session expirée');
   data.submitted_by=user.id;
   const {error}=await supabase.from('platform_reports').insert(data);
   if(error)throw error;
   form.reset();
   feedback.textContent='Message envoyé au créateur. Merci pour votre retour !';
  }catch{
   feedback.textContent='Envoi impossible. Vérifiez votre connexion et réessayez. Votre message est resté dans le formulaire.';
  }finally{submit.disabled=false}
 },true);
 if(window.lucide?.createIcons)window.lucide.createIcons();
}
