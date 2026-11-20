'use strict';
(function(){
 const M=window.RestoPublicationModel,svgNS='http://www.w3.org/2000/svg';
 if(!M)return;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const icon=name=>{const n=el('i');n.dataset.lucide=name;n.setAttribute('aria-hidden','true');return n;};
 function qrSVG(matrix){
  const count=matrix.length+8,svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox','0 0 '+count+' '+count);svg.setAttribute('role','img');svg.setAttribute('aria-label','QR code de la page de réservation DEV');svg.setAttribute('shape-rendering','crispEdges');
  const white=document.createElementNS(svgNS,'rect');white.setAttribute('width',count);white.setAttribute('height',count);white.setAttribute('fill','#fff');svg.append(white);
  let d='';matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)d+='M'+(x+4)+' '+(y+4)+'h1v1h-1z';}));const path=document.createElementNS(svgNS,'path');path.setAttribute('d',d);path.setAttribute('fill','#000');svg.append(path);return svg;
 }
 function makePNG(matrix,hotel=false){
  const units=matrix.length+8,scale=Math.max(4,Math.floor(1200/units)),side=units*scale,canvas=document.createElement('canvas');canvas.width=side;canvas.height=side+100;const c=canvas.getContext('2d');if(!c)throw Error('Image unavailable');
  c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#000';matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)c.fillRect((x+4)*scale,(y+4)*scale,scale,scale);}));
  c.textAlign='center';c.font='bold 25px sans-serif';c.fillText('RESTOMANAGER · DEV',side/2,side+36);c.font='22px sans-serif';c.fillText(hotel?'Clients de l’hôtel · Aperçu':'Réservations en ligne · Aperçu',side/2,side+72);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Image unavailable')),'image/png'));
 }
 function mount({container,identity,canAct,onConfigure}){
  let signature='',generation=0;
  function reset(){signature='';generation++;container.replaceChildren();}
  function render(settings,{dirty=false,stale=false,busy=false}={}){
   const next=[identity(),settings.version,dirty,stale,busy].join('|');if(next===signature)return;signature=next;const own=identity(),ticket=++generation;container.replaceChildren();
   const head=el('div','rmWebPublicationHead'),words=el('div');words.append(el('p','rmWebEyebrow','VOTRE PORTAIL CLIENT'),el('h3','','Préparer et partager'));
   const badge=el('span','rmWebState '+(stale?'is-unknown':settings.enabled?'is-open':'is-closed'),stale?'État à vérifier':settings.enabled?'Portail ouvert':'Portail fermé');head.append(words,badge);container.append(head);
   container.append(el('p','rmWebHelp','DEV · Cet espace prépare votre portail. Les emails automatiques restent désactivés.'));
   const checks=M.readiness(settings),ready=checks.filter(c=>c.ready).length;
   if(!settings.enabled||ready<checks.length){
    const progress=el('p','rmWebProgress',ready===checks.length?'Les informations nécessaires sont renseignées. L’ouverture reste votre choix.':ready+(ready===1?' élément prêt sur ':' éléments prêts sur ')+checks.length+' avant l’ouverture.');container.append(progress);
    const list=el('ul','rmWebChecklist');for(const check of checks){const item=el('li',check.ready?'is-ready':'');item.append(icon(check.ready?'check-circle-2':'circle-dot'),el('span','',check.label),el('span','sr-only',check.ready?' : renseigné':' : à compléter'));list.append(item);}container.append(list);
    const setup=el('button','rmWebSecondary',ready===checks.length?'Vérifier les réglages':'Compléter les réglages');setup.type='button';setup.disabled=!canAct();setup.addEventListener('click',()=>{if(canAct())onConfigure(checks.find(c=>!c.ready)?.key)});container.append(setup);
   }
   if(!M.validSlug(settings.slug))return;
   let url;try{url=M.publicURL(location.href,settings.slug)}catch{return}
   const share=el('div','rmWebShare'),linkBox=el('div','rmWebShareWords'),label=el('label','rmWebField');label.htmlFor='rmWebSavedURL';label.append(el('span','','Lien public enregistré'));const input=el('input','rmWebSavedURL');input.id='rmWebSavedURL';input.value=url;input.readOnly=true;input.spellcheck=false;label.append(input);linkBox.append(label);
   linkBox.append(el('p','rmWebHelp',settings.enabled?'Le client choisit sa venue sur cette page. Le QR code ouvre le même lien.':'Le lien est prêt à vérifier. Les nouvelles réservations restent fermées tant que vous n’ouvrez pas le portail.'));
   const unsaved=el('p','rmWebUnsaved','Vos modifications ne sont pas enregistrées. Ce lien et ce QR code utilisent l’adresse enregistrée.');unsaved.hidden=!dirty;linkBox.append(unsaved);
   const actions=el('div','rmWebShareActions'),copy=el('button','rmWebSecondary');copy.type='button';copy.disabled=!canAct();copy.append(icon('copy'),document.createTextNode('Copier le lien'));
   const open=el('a','rmWebSecondary rmWebPreviewLink');open.href=url;open.target='_blank';open.rel='noopener noreferrer';open.append(icon('arrow-up-right'),document.createTextNode('Ouvrir la page DEV'));actions.append(copy,open);linkBox.append(actions);
   const notice=el('p','rmWebShareNotice');notice.setAttribute('role','status');linkBox.append(notice);
   copy.addEventListener('click',async()=>{if(!canAct())return;try{await navigator.clipboard.writeText(url);if(ticket===generation&&own===identity())notice.textContent='Lien copié.';}catch{if(ticket!==generation||own!==identity())return;input.focus();input.select();notice.textContent=matchMedia('(pointer:coarse)').matches?'Le lien est sélectionné. Maintenez votre doigt dessus, puis choisissez Copier.':'Le lien est sélectionné. Utilisez Ctrl+C, ou ⌘+C sur Mac, pour le copier.';}});
   share.append(linkBox);const qrBox=el('div','rmWebQR'),tag=el('span','rmWebQRTag','APERÇU DEV');qrBox.append(tag);
   try{
    const matrix=M.qrMatrix(url,window.qrcode);qrBox.append(qrSVG(matrix));const download=el('button','rmWebSecondary');download.type='button';download.disabled=!canAct();download.append(icon('file-down'),document.createTextNode('Télécharger le QR code'));qrBox.append(download,el('small','','Image PNG · Pour vos vérifications DEV'));
    download.addEventListener('click',async()=>{if(!canAct())return;try{const blob=await makePNG(matrix);if(ticket!==generation||own!==identity()||!canAct())return;const objectURL=URL.createObjectURL(blob),a=el('a');a.href=objectURL;a.download='restomanager-dev-'+settings.slug+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),3000);notice.textContent='QR code téléchargé. Il utilise le même lien public enregistré.';}catch{if(ticket===generation&&own===identity())notice.textContent='Le téléchargement n’a pas abouti. Vous pouvez toujours copier le lien.';}});
   }catch{qrBox.append(el('p','rmWebHelp','Le QR code est indisponible. Vous pouvez toujours copier le lien.'));}
   share.append(qrBox);container.append(share);
   if(settings.hotelGuestsEnabled===true){
    const hotelURL=M.publicURL(location.href,settings.slug,'hotel'),section=el('section','rmWebHotelLink'),title=el('h4','','Pour les clients de l’hôtel');section.append(title,el('p','rmWebHelp','Ce lien préselectionne le parcours Hôtel. Il ne vérifie pas le séjour et ne donne aucune priorité sur les disponibilités.'));
    const label=el('label','rmWebField');label.htmlFor='rmWebHotelURL';label.append(el('span','','Lien Hôtel enregistré'));const input=el('input');input.id='rmWebHotelURL';input.readOnly=true;input.value=hotelURL;label.append(input);section.append(label);
    const actions=el('div','rmWebShareActions'),copy=el('button','rmWebSecondary','Copier le lien Hôtel');copy.type='button';copy.disabled=!canAct();copy.addEventListener('click',async()=>{if(!canAct())return;try{await navigator.clipboard.writeText(hotelURL);if(ticket===generation&&own===identity())notice.textContent='Lien Hôtel copié.';}catch{input.focus();input.select();if(ticket===generation&&own===identity())notice.textContent='Le lien Hôtel est sélectionné. Vous pouvez le copier.';}});
    const open=el('a','rmWebSecondary rmWebPreviewLink','Ouvrir le parcours Hôtel DEV');open.href=hotelURL;open.target='_blank';open.rel='noopener noreferrer';actions.append(copy,open);section.append(actions);
    try{const matrix=M.qrMatrix(hotelURL,window.qrcode),qr=el('div','rmWebQR');const svg=qrSVG(matrix);svg.setAttribute('aria-label','QR code du parcours Hôtel DEV');qr.append(svg);const download=el('button','rmWebSecondary','Télécharger le QR Hôtel');download.type='button';download.disabled=!canAct();download.addEventListener('click',async()=>{if(!canAct())return;try{const blob=await makePNG(matrix,true);if(ticket!==generation||own!==identity()||!canAct())return;const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='restomanager-dev-hotel-'+settings.slug+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);notice.textContent='QR Hôtel téléchargé.';}catch{if(ticket===generation&&own===identity())notice.textContent='Le téléchargement du QR Hôtel n’a pas abouti.';}});qr.append(download);section.append(qr);}catch{section.append(el('p','rmWebHelp','Le QR Hôtel est indisponible. Vous pouvez copier le lien.'));}container.append(section);
   }
   window.lucide?.createIcons();
  }
  return {render,reset};
 }
 window.RestoPublicationUI=Object.freeze({mount});
})();
