'use strict';
(function(){
 let dialog=null;
 function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e}
 function ensure(){
  if(dialog)return dialog;
  dialog=node('dialog','restoKpiDialog');
  dialog.setAttribute('aria-labelledby','restoKpiDialogTitle');
  dialog.innerHTML='<div class="restoKpiDialogHead"><div><span class="restoKpiEyebrow">DÉTAIL DU SERVICE</span><h2 id="restoKpiDialogTitle"></h2></div><button type="button" class="restoKpiClose" aria-label="Fermer">×</button></div><p class="restoKpiDialogSubtitle"></p><ul class="restoKpiRows"></ul><button type="button" class="restoKpiDone">Fermer</button>';
  document.body.append(dialog);
  dialog.querySelector('.restoKpiClose').addEventListener('click',()=>dialog.close());
  dialog.querySelector('.restoKpiDone').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  return dialog;
 }
 function open(title,entries){
  const modal=ensure();
  modal.querySelector('#restoKpiDialogTitle').textContent=title;
  const list=modal.querySelector('.restoKpiRows');
  list.replaceChildren();
  const rows=Array.isArray(entries)?entries:[];
  modal.querySelector('.restoKpiDialogSubtitle').textContent=rows.length?rows.length+' élément(s)':'Aucun élément pour ce service.';
  for(const entry of rows){list.append(node('li','restoKpiRow',entry))}
  if(!modal.open)modal.showModal();
  modal.querySelector('.restoKpiClose').focus();
 }
 window.RestoKpiDetails={open};
})();
