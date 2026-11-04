'use strict';
(function(){
  const dialog=document.createElement('div');
  dialog.className='v3-picker-backdrop';
  dialog.hidden=true;
  dialog.innerHTML='<section class="v3-picker-panel" role="dialog" aria-modal="true" aria-label="Choisir une option"><header><strong>Choisir une option</strong><button type="button" data-close aria-label="Fermer">×</button></header><div class="v3-picker-items"></div><footer><button type="button" data-cancel>Annuler</button><button type="button" data-confirm>Valider</button></footer></section>';
  document.body.appendChild(dialog);
  const items=dialog.querySelector('.v3-picker-items');
  let source=null,choice=null,focusBefore=null;
  function close(){dialog.hidden=true;source=null;focusBefore?.focus?.();}
  function render(){items.querySelectorAll('button').forEach(b=>{const yes=b.dataset.value===choice;b.classList.toggle('selected',yes);b.setAttribute('aria-checked',String(yes));});}
  function open(select){
    source=select;focusBefore=document.activeElement;choice=select.value;
    const associated=select.labels?.[0];
    const explicit=select.getAttribute('aria-label')?.trim();
    const labelText=associated ? Array.from(associated.childNodes).filter(node=>node!==select).map(node=>node.textContent||'').join(' ').replace(/\\s+/g,' ').trim() : '';
    const label=explicit||labelText||'Choisir une option';
    dialog.querySelector('header strong').textContent=label;
    items.replaceChildren();
    Array.from(select.options).filter(o=>!o.hidden).forEach(o=>{
      const button=document.createElement('button');
      button.type='button';button.dataset.value=o.value;button.disabled=o.disabled;
      button.setAttribute('role','radio');button.textContent=o.textContent;
      button.addEventListener('click',()=>{choice=o.value;render();});
      items.append(button);
    });
    items.setAttribute('role','radiogroup');render();dialog.hidden=false;
    dialog.querySelector('[data-confirm]').focus();
  }
  function eligible(s){return s instanceof HTMLSelectElement&&!s.multiple&&!s.disabled&&!s.hidden&&s.options.length>0&&s.getClientRects().length>0&&!s.classList.contains('visuallyHiddenSelect')&&!['bookingType','walkinTable'].includes(s.id);}
  document.addEventListener('pointerdown',e=>{
    const s=e.target.closest?.('select');
    if(!eligible(s)||e.button!==0)return;
    e.preventDefault();open(s);
  },true);
  document.addEventListener('keydown',e=>{
    if(!dialog.hidden){if(e.key==='Escape'){e.preventDefault();close();}return;}
    if(eligible(e.target)&&['Enter',' '].includes(e.key)){e.preventDefault();open(e.target);}
  },true);
  dialog.querySelector('[data-close]').addEventListener('click',close);
  dialog.querySelector('[data-cancel]').addEventListener('click',close);
  dialog.querySelector('[data-confirm]').addEventListener('click',()=>{
    if(!source)return;
    const changed=source.value!==choice;source.value=choice;
    if(changed){source.dispatchEvent(new Event('input',{bubbles:true}));source.dispatchEvent(new Event('change',{bubbles:true}));}
    close();
  });
  dialog.addEventListener('pointerdown',e=>{if(e.target===dialog)close();});
})();
