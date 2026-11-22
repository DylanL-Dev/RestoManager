'use strict';
/* RM-017.1: accessible static UX preview. No signup API, persistence or network writes. */
(function(){
 const M=window.RestoSignupDraft;
 const $=id=>document.getElementById(id);
 if(!M||!$('signupDraft'))return;
 const form=$('signupDraft');
 let step=1;
 const data=()=>({name:$('businessName').value,city:$('businessCity').value,email:$('businessEmail').value});
 const chosen=()=>form.querySelector('input[name="businessType"]:checked')?.value||'';
 const siretHelpByType={
  independent:"Le numéro est vérifié auprès d'un registre officiel français. Indiquez le SIRET de l'établissement qui exploite votre restaurant.",
  hotel:"Le numéro est vérifié auprès d'un registre officiel français. Si le restaurant est exploité par l'hôtel, indiquez le SIRET de l'établissement hôtelier. Sinon, indiquez celui de la société exploitante."
 };
 const drawIcons=()=>window.lucide?.createIcons();
 const replaceIcon=(selector,name)=>{
  const wrapper=document.querySelector(selector);if(!wrapper||!['hotel','utensils'].includes(name))return;
  const i=document.createElement('i');i.setAttribute('data-lucide',name);i.setAttribute('aria-hidden','true');wrapper.replaceChildren(i);drawIcons();
 };
 function clearErrors(){
  for(const id of ['name','city','email']){$(id+'Error').hidden=true;$(id+'Error').textContent='';$('business'+id[0].toUpperCase()+id.slice(1)).removeAttribute('aria-invalid');}
  $('typeError').hidden=true;$('typeError').textContent='';$('formMessage').textContent='';
 }
 function setError(id,text){
  const label=$(id+'Error');label.textContent=text;label.hidden=!text;
  if(id!=='type')$('business'+id[0].toUpperCase()+id.slice(1)).setAttribute('aria-invalid',String(!!text));
 }
 function syncPreview(){
  const type=chosen(),v=type?M.types[type]:null;
  $('siretHelp').textContent=siretHelpByType[type]||"Le numéro SIRET est vérifié auprès d'un registre officiel français.";
  $('storyBusiness').textContent=v?$('businessName').value.trim()||v.label:'Votre futur établissement';
  replaceIcon('.insight-logo',v?v.icon:'utensils');
  if(v){$('selectedTypeLabel').textContent=v.label;replaceIcon('.mini-icon',v.icon);}
 }
 function renderReview(){
  const type=chosen(),info=M.preview(type,data());
  $('reviewType').textContent=info.label;
  $('reviewName').textContent=info.name;
  $('reviewCity').textContent=info.city;
  $('reviewSiret').textContent=$('businessSiret').value.trim()||'À vérifier avant inscription';
  $('reviewEmail').textContent=info.email;
  const list=$('reviewFeatures');list.replaceChildren();
  for(const feature of info.features){
   const li=document.createElement('li'),icon=document.createElement('i'),span=document.createElement('span');
   icon.setAttribute('data-lucide','check');icon.setAttribute('aria-hidden','true');span.textContent=feature;li.append(icon,span);list.append(li);
  }
  $('exampleLink').href=type==='hotel'?'reservation/?restaurant=hotel-des-rives-demo':'reservation/?restaurant=le-jardin-demo';
  drawIcons();
 }
 const titles=[
  ['Commençons par votre établissement.','Chaque restaurant est différent. Choisissez votre activité pour découvrir une configuration adaptée.','Votre activité'],
  ['Faisons connaissance.','Pour cet aperçu, indiquez des informations fictives. Rien ne quitte cette page.','Votre établissement'],
  ['Votre futur espace prend forme.','Un aperçu de votre configuration, avant toute inscription réelle.','Votre aperçu']
 ];
 function showStep(next,{focus=true}={}){
  step=next;clearErrors();
  $('stepType').hidden=next!==1;$('stepDetails').hidden=next!==2;$('stepPreview').hidden=next!==3;
  $('stepCount').textContent='0'+next+' / 03';
  $('stepCaption').textContent=titles[next-1][2];
  $('setupTitle').textContent=titles[next-1][0];
  $('setupSubtitle').textContent=titles[next-1][1];
  $('progressTrack').setAttribute('aria-valuenow',String(next));
  $('progressTrack').setAttribute('aria-label','Progression : étape '+next+' sur 3');
  $('progressFill').style.width=(next/3*100)+'%';
  $('backStep').hidden=next===1;
  $('nextStep').hidden=next===3;
  $('restart').hidden=next!==3;
  $('nextStep').replaceChildren(document.createTextNode(next===1?'Continuer ': 'Voir mon aperçu '));
  const arrow=document.createElement('i');arrow.setAttribute('data-lucide','chevron-right');arrow.setAttribute('aria-hidden','true');$('nextStep').append(arrow);
  drawIcons();
  if(next===3)window.dispatchEvent(new Event('restomanager:registration-preview'));
  if(focus){$('setupTitle').setAttribute('tabindex','-1');$('setupTitle').focus({preventScroll:true});}
 }
 function advance(){
  if(step===1){
   const type=chosen(),error=M.validateType(type);
   if(error){setError('type',error);$('typeIndependent').querySelector('input').focus();return;}
   syncPreview();showStep(2);return;
  }
  if(step===2){
   const errors=M.validateDetails(data());
   for(const [id,text] of Object.entries(errors))setError(id,text);
   if(Object.keys(errors).length){const first=Object.keys(errors)[0];$('business'+first[0].toUpperCase()+first.slice(1)).focus();return;}
   renderReview();syncPreview();showStep(3);
  }
 }
 function back(){if(step>1)showStep(step-1);}
 $('nextStep').addEventListener('click',advance);
 $('backStep').addEventListener('click',back);
 form.addEventListener('submit',event=>{event.preventDefault();advance();});
 form.addEventListener('change',event=>{
  if(event.target.name==='businessType'){setError('type','');syncPreview();}
 });
 for(const id of ['name','city','email']){
  const field=$('business'+id[0].toUpperCase()+id.slice(1));
  field.addEventListener('input',()=>{
   $(id+'Error').hidden=true;$(id+'Error').textContent='';field.removeAttribute('aria-invalid');
   if(id==='name')syncPreview();
  });
 }
 $('restart').addEventListener('click',()=>{
  form.reset();$('reviewFeatures').replaceChildren();syncPreview();showStep(1);
 });
 // No state is persisted, transmitted, or interpreted as an account creation.
 showStep(1,{focus:false});drawIcons();
})();
