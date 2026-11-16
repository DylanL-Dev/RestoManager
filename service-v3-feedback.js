// BUG-01: staff-only submission. No client-side list/retrieval of reports.
// Author and establishment are verified again by Postgres RLS.
export function installFeedback({supabase,profile,management}){
 if(!profile?.active||!['fb_admin','reception'].includes(profile.role))return;
 if(management.querySelector('#manageFeedback'))return;
 const group=document.createElement('details');group.id='manageFeedback';group.className='managementGroup';
 group.innerHTML=`
  <summary class="managementGroupHead">
   <span class="managementGroupIcon" aria-hidden="true"><i data-lucide="circle-help"></i></span>
   <span class="managementGroupWords"><strong>Assistance</strong><small>Aide, problème ou suggestion</small></span>
   <span class="managementChevron" aria-hidden="true"><i data-lucide="chevron-down"></i></span>
  </summary>
  <div class="managementGroupBody">
   <div class="reportIssueIntro"><h3>Comment pouvons-nous vous aider ?</h3><p>Décrivez votre demande pour que l’assistance puisse vous accompagner.</p></div>
   <form id="reportIssueForm" class="reportIssueForm">
    <div class="reportIssueOptions">
     <fieldset class="reportIssueChoiceGroup"><legend>Nature du message</legend>
      <select id="reportIssueKind" required hidden aria-hidden="true" tabindex="-1"><option value="bug">Un problème / un bug</option><option value="question">Assistance</option><option value="suggestion">Une suggestion</option></select>
      <div class="reportIssueChoices reportIssueTypes">
       <label class="reportIssueChoice"><input type="radio" name="reportIssueKindVisual" value="bug" checked><i data-lucide="bug" aria-hidden="true"></i><strong>Problème</strong><small>Signaler un bug</small></label>
       <label class="reportIssueChoice"><input type="radio" name="reportIssueKindVisual" value="question"><i data-lucide="circle-help" aria-hidden="true"></i><strong>Assistance</strong><small>Obtenir de l’aide</small></label>
       <label class="reportIssueChoice"><input type="radio" name="reportIssueKindVisual" value="suggestion"><i data-lucide="star" aria-hidden="true"></i><strong>Suggestion</strong><small>Proposer une idée</small></label>
      </div>
     </fieldset>
     <fieldset class="reportIssueChoiceGroup"><legend>Importance</legend>
      <select id="reportIssueSeverity" required hidden aria-hidden="true" tabindex="-1"><option value="normal">Normale</option><option value="urgent">Urgente — bloque le service</option></select>
      <div class="reportIssueChoices reportIssuePriorities">
       <label class="reportIssueChoice"><input type="radio" name="reportIssueSeverityVisual" value="normal" checked><i data-lucide="info" aria-hidden="true"></i><strong>Normale</strong><small>Le service continue</small></label>
       <label class="reportIssueChoice"><input type="radio" name="reportIssueSeverityVisual" value="urgent"><i data-lucide="alert-triangle" aria-hidden="true"></i><strong>Urgente</strong><small>Le service est bloqué</small></label>
      </div>
     </fieldset>
    </div>
    <label class="reportIssueField" for="reportIssueTitle"><span class="reportIssueCaption"><i data-lucide="clipboard-list" aria-hidden="true"></i>Sujet</span><input id="reportIssueTitle" type="text" maxlength="120" minlength="3" required placeholder="Résumez votre demande en quelques mots"></label>
    <label class="reportIssueField" for="reportIssueContact"><span class="reportIssueCaption"><i data-lucide="circle-user-round" aria-hidden="true"></i>Votre contact <small>facultatif</small></span><input id="reportIssueContact" type="text" maxlength="160" placeholder="Prénom, équipe ou contact professionnel"></label>
    <label class="reportIssueField reportIssueFull" for="reportIssueDescription"><span class="reportIssueCaption"><i data-lucide="info" aria-hidden="true"></i>Votre message</span><textarea id="reportIssueDescription" minlength="10" maxlength="4000" rows="5" required aria-describedby="reportIssueMessageHint" placeholder="Précisez l’écran concerné, votre demande et les informations utiles…"></textarea><small id="reportIssueMessageHint">10 caractères minimum · 4 000 maximum</small></label>
    <div class="reportIssuePrivacy reportIssueFull"><i data-lucide="info" aria-hidden="true"></i><p>Message privé à l’assistance, invisible pour vos collègues. N’indiquez ni données personnelles de clients ni mots de passe.</p></div>
    <div class="reportIssueFooter reportIssueFull"><button id="reportIssueSubmit" type="submit"><i data-lucide="send" aria-hidden="true"></i><span>Envoyer à l’assistance</span></button><p id="reportIssueFeedback" role="status" aria-live="polite"></p></div>
   </form>
  </div>
`;
 const target=management.querySelector('#manageNetwork');
 if(target)target.before(group);else management.append(group);
 const form=group.querySelector('#reportIssueForm');
 const feedback=group.querySelector('#reportIssueFeedback');
 const submit=group.querySelector('#reportIssueSubmit');
 // Keep the existing database enums and IDs; the visible controls are native radio groups.
 for(const [id,name] of [['reportIssueKind','reportIssueKindVisual'],['reportIssueSeverity','reportIssueSeverityVisual']]){
  const select=group.querySelector('#'+id),choices=[...group.querySelectorAll('input[name="'+name+'"]')];
  select.addEventListener('change',()=>{for(const input of choices)input.checked=input.value===select.value});
  for(const input of choices)input.addEventListener('change',()=>{if(input.checked){select.value=input.value;select.dispatchEvent(new Event('change',{bubbles:true}))}});
 }

 form.addEventListener('submit',async event=>{
  event.preventDefault();event.stopImmediatePropagation();
  if(submit.disabled||!form.reportValidity())return;
  submit.disabled=true;form.setAttribute('aria-busy','true');feedback.dataset.state='sending';feedback.textContent='Envoi de votre message…';
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
   feedback.dataset.state='success';feedback.textContent='Message envoyé à l’assistance. Merci pour votre retour !';
  }catch{
   feedback.dataset.state='error';feedback.textContent='Envoi impossible. Vérifiez votre connexion et réessayez. Votre message est resté dans le formulaire.';
  }finally{submit.disabled=false;form.removeAttribute('aria-busy')}
 },true);
 if(window.lucide?.createIcons)window.lucide.createIcons();
}
