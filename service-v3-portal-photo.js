'use strict';
// Staff-only preparation. Publication remains the versioned settings RPC.
(function(){
 const bucket='rm015-covers',maxInput=10*1024*1024,maxOutput=2*1024*1024;
 const types=new Set(['image/jpeg','image/png','image/webp']);
 const pathPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/;
 function checkFile(file){if(!file||!types.has(file.type)||file.size<1||file.size>maxInput)throw Error('Choisissez une photo JPG, PNG ou WebP de 10 Mo maximum.');}
 async function encode(file){
  checkFile(file);let bitmap;try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw Error('Cette photo ne peut pas être lue. Choisissez une autre image JPG, PNG ou WebP.');}
  try{if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error('La photo est trop grande. Choisissez une image de moins de 40 millions de pixels.');const scale=Math.min(1,1600/bitmap.width,1200/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('La photo ne peut pas être préparée sur cet appareil.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));if(!blob||blob.type!=='image/webp'||blob.size>maxOutput)throw Error('La photo ne peut pas être préparée. Choisissez une image plus légère.');return blob;}finally{bitmap.close();}
 }
 function mount({form,container,restaurantId,settings,enabled,identity,canEdit,storage,onDirty,onBusy}){
  const owner=identity(),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};let ticket=0,disposed=false,localURL='',blob=null,uploaded='',working=false;
  const own=()=>!disposed&&form.isConnected&&identity()===owner;
  const label=el('p','rmWebHelp',enabled?'Cette photo sera visible par vos clients après l’enregistrement des réglages. JPG, PNG ou WebP, 10 Mo maximum.':'La personnalisation de la photo n’est pas encore activée pour cet établissement. L’illustration actuelle reste affichée.');
  const preview=el('img','rmWebPhotoPreview');preview.hidden=true;preview.alt='Aperçu de la photo présentée aux clients';preview.width=800;preview.height=480;const empty=el('div','rmWebPhotoEmpty');empty.textContent='L’illustration de RestoManager est utilisée tant qu’aucune photo n’est enregistrée.';const notice=el('p','rmWebPhotoNotice');notice.setAttribute('role','status');container.append(preview,empty,label);
  if(!enabled){container.append(notice);return{isWorking:()=>false,destroy(){disposed=true;}};}
  const row=el('label','rmWebField'),caption=el('span','','Choisir une photo'),file=el('input');file.type='file';file.name='_coverFile';file.id='rmWeb-coverFile';file.accept='image/jpeg,image/png,image/webp';row.append(caption,file);
  const path=el('input');path.type='hidden';path.name='coverPath';path.value=settings.coverPath||'';const altRow=el('label','rmWebField'),altLabel=el('span','','Description de la photo (facultative)'),alt=el('input');alt.type='text';alt.name='coverAlt';alt.value=settings.coverAlt||'';alt.maxLength=160;alt.placeholder='Ex. La salle du restaurant et sa terrasse';altRow.append(altLabel,alt);
  const remove=el('button','rmWebSecondary','Retirer la photo');remove.type='button';container.append(row,altRow,path,remove,notice);
  const resetURL=()=>{if(localURL)URL.revokeObjectURL(localURL);localURL='';};
  const busy=value=>{working=value;onBusy(value);};
  const clean=async paths=>{try{if(identity()!==owner)return;const client=await storage();if(identity()!==owner)return;const names=[...new Set(paths)].filter(p=>pathPattern.test(p)&&p.startsWith(restaurantId+'/'));if(names.length)await client.remove(names);}catch{/* A later retry may clean an unpublished orphan. The active image is protected by RLS. */}};
  async function showSaved(){if(!settings.coverPath)return;try{const client=await storage();if(!own()||blob||path.value!==settings.coverPath)return;const value=client.getPublicUrl(settings.coverPath)?.data?.publicUrl,url=new URL(value);if(!pathPattern.test(settings.coverPath)||url.pathname!=='/storage/v1/object/public/'+bucket+'/'+settings.coverPath||url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return;preview.onerror=()=>{preview.onerror=null;preview.hidden=true;empty.hidden=false;};preview.onload=()=>{if(own()&&!blob&&path.value===settings.coverPath){preview.hidden=false;empty.hidden=true;}};preview.src=url.href;}catch{}}
  file.addEventListener('change',async()=>{
   const input=file.files?.[0];if(!input||!canEdit()||working)return;const turn=++ticket;notice.textContent='Préparation de la photo…';busy(true);
   try{const value=await encode(input);if(!own()||turn!==ticket||!canEdit())return;const orphan=uploaded;uploaded='';blob=value;resetURL();localURL=URL.createObjectURL(value);preview.onerror=null;preview.onload=null;preview.hidden=false;empty.hidden=true;preview.src=localURL;path.value='';notice.textContent='Nouvelle photo prête. Enregistrez les réglages pour la publier.';onDirty();if(orphan)void clean([orphan]);}
   catch(e){if(own()&&turn===ticket){notice.textContent=e.message||'Cette photo ne peut pas être lue. Choisissez une autre image.';file.value='';}}
   finally{if(own()&&turn===ticket)busy(false);}
  });
  remove.addEventListener('click',()=>{if(!canEdit()||working)return;const orphan=uploaded;ticket++;blob=null;uploaded='';resetURL();file.value='';path.value='';alt.value='';preview.onerror=null;preview.onload=null;preview.hidden=true;preview.removeAttribute('src');empty.hidden=false;notice.textContent='L’illustration sera rétablie après enregistrement.';onDirty();if(orphan)void clean([orphan]);});
  void showSaved();
  return{
   isWorking:()=>working,
   async prepare(){if(!own()||!canEdit()||working)throw Error('Vérifiez la connexion avant d’enregistrer la photo.');if(!blob)return path.value||null;if(uploaded)return uploaded;busy(true);const turn=ticket,name=restaurantId+'/'+crypto.randomUUID()+'.webp';let timeout;
    try{const client=await storage();if(!own()||turn!==ticket||!canEdit())throw Error('Le compte a changé. La photo n’a pas été publiée.');const result=await Promise.race([client.upload(name,blob,{contentType:'image/webp',cacheControl:'3600',upsert:false}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('L’envoi de la photo n’est pas confirmé. Réessayez après avoir vérifié la connexion.')),20000);})]);if(result.error)throw Error('La photo n’a pas pu être envoyée. Vérifiez la connexion et réessayez.');if(!own()||turn!==ticket||!canEdit())throw Error('La photo n’a pas été publiée. Vérifiez votre connexion.');uploaded=name;return name;
    }finally{clearTimeout(timeout);if(own())busy(false);}
   },
   committed(newPath){const old=settings.coverPath;if(old&&old!==newPath)void clean([old]);},
   destroy(){if(uploaded)void clean([uploaded]);disposed=true;ticket++;resetURL();}
  };
 }
 window.RestoPortalPhoto=Object.freeze({mount,encode,checkFile,bucket,maxInput,maxOutput,pathPattern});
})();
