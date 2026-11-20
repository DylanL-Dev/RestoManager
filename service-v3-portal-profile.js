'use strict';
// Editorial fields only: booking rules and business hours stay server-owned.
(function(){
 const fields=[['name','Nom affiché aux clients',180,'input'],['description','Présentation du restaurant',1200,'textarea'],['address','Adresse du restaurant',300,'textarea'],['phone','Téléphone du restaurant',40,'input']];
 window.RestoPortalProfile={mount({form,settings,openingHours,restaurantName,identity}){
  const owner=identity(),section=document.createElement('details');section.className='rmWebProfile rmWebAccordion';section.innerHTML='<summary><span class="rmWebAccordionIcon" aria-hidden="true"><i data-lucide="building-2"></i></span><span class="rmWebAccordionWords"><strong>Fiche du restaurant</strong><small>Nom, présentation, adresse et téléphone visibles par les clients</small></span><i data-lucide="chevron-down" aria-hidden="true"></i></summary>';
  const body=document.createElement('div');body.className='rmWebProfileBody';const help=document.createElement('p');help.className='rmWebHelp';help.textContent='Ces informations sont publiques après enregistrement. Vous pouvez laisser un champ vide pour ne pas l’afficher.';body.append(help);
  for(const [key,title,max,tag]of fields){const row=document.createElement('label');row.className='rmWebField';const label=document.createElement('span');label.textContent=title;const input=document.createElement(tag);input.name='profile.'+key;input.id='rmWeb-profile-'+key;label.id=input.id+'-label';input.setAttribute('aria-labelledby',label.id);input.maxLength=max;input.value=settings.publicProfile?.[key]||'';
   if(tag==='textarea'){input.rows=key==='address'?2:4;}else input.type=key==='phone'?'tel':'text';
   if(key==='name')input.placeholder=restaurantName||'Nom de votre restaurant';if(key==='description')input.placeholder='Présentez votre cuisine et l’ambiance du restaurant.';if(key==='phone'){input.autocomplete='tel';input.placeholder='Ex. +33 2 00 00 00 00';}
   row.append(label,input);if(key==='name'){const note=document.createElement('small');note.id=input.id+'-help';input.setAttribute('aria-describedby',note.id);note.textContent='Vide : le nom de votre établissement est conservé. Le lien de réservation ne change pas.';row.append(note);}body.append(row);
  }
  const hoursBox=document.createElement('details');hoursBox.className='rmWebProfileHours';const summary=document.createElement('summary');summary.textContent='Horaires de réservation';const hours=document.createElement('div');hours.className='rmWebProfileHoursTable';const note=document.createElement('p');note.className='rmWebHelp';note.textContent='Ces plages d’arrivée et dernières réservations suivent les horaires du service définis dans Gestion. Elles se modifient dans cette rubrique.';hoursBox.append(summary,hours,note);body.append(hoursBox);section.append(body);form.append(section);
  let destroyed=false,latest=openingHours;const ready=import('./public-restaurant-profile.mjs?v=20261120-rm0156');
  const updateHours=value=>{latest=value;void ready.then(module=>{if(!destroyed&&form.isConnected&&identity()===owner)module.renderHours(hours,latest);}).catch(()=>{if(hours.isConnected)hours.textContent='Les horaires ne peuvent pas être affichés. Actualisez la page.';});};updateHours(openingHours);
  return {updateHours,destroy(){destroyed=true;}};
 }};
})();
