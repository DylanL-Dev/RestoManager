'use strict';
(function(){
  const dialog=document.createElement('div');
  dialog.className='v3-picker-backdrop';
  dialog.hidden=true;
  dialog.innerHTML='<section class="v3-picker-panel" role="dialog" aria-modal="true" aria-label="Choisir une option"><header><strong>Choisir une option</strong><button type="button" data-close aria-label="Fermer"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5L19 19M19 5L5 19" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/></svg></button></header><div class="v3-picker-items"></div><footer><button type="button" data-cancel>Annuler</button><button type="button" data-confirm>Valider</button></footer></section>';
  document.body.appendChild(dialog);
  const items=dialog.querySelector('.v3-picker-items');
  let source=null,choice=null,focusBefore=null;
  function close(){dialog.hidden=true;dialog.classList.remove('v3-rush-period-picker','v3-percent-picker','v3-theme-picker','v3-duration-picker');document.body.classList.remove('v3-picker-open');source=null;focusBefore?.focus?.({preventScroll:true});}
  function render(){items.querySelectorAll('button').forEach(b=>{const yes=b.dataset.value===choice;b.classList.toggle('selected',yes);b.setAttribute('aria-checked',String(yes));});}
  function open(select){
    source=select;focusBefore=document.activeElement;choice=select.value;
    const rushMode=select.getAttribute('aria-label')==='Choisir une plage horaire';
    const percentMode=select.closest('.rushSettings')!==null;
    const themeMode=select.id==='themeMode';
    const durationMode=select.id==='restaurantDefaultDuration';
    const instantMode=rushMode||percentMode||themeMode||durationMode;
    dialog.classList.toggle('v3-rush-period-picker',rushMode);
    dialog.classList.toggle('v3-percent-picker',percentMode);
    dialog.classList.toggle('v3-theme-picker',themeMode);
    dialog.classList.toggle('v3-duration-picker',durationMode);
    const associated=select.labels?.[0];
    const explicit=select.getAttribute('aria-label')?.trim();
    const labelText=associated ? Array.from(associated.childNodes).filter(node=>node!==select).map(node=>node.textContent||'').join(' ').replace(/\s+/g,' ').trim() : '';
    const label=explicit||labelText||'Choisir une option';
    dialog.querySelector('header strong').textContent=label;
    items.replaceChildren();
    let lastGroup='';
    Array.from(select.options).filter(o=>!o.hidden).forEach(o=>{
      if(rushMode){
        const group=o.textContent.split(' · ')[0];
        if(group!==lastGroup){
          const heading=document.createElement('div');
          heading.className='v3-rush-period-group';
          heading.textContent=group==='Midi'?'Service du midi':group==='Soir'?'Service du soir':group;
          items.append(heading);
          lastGroup=group;
        }
      }
      const button=document.createElement('button');
      button.type='button';button.dataset.value=o.value;button.disabled=o.disabled;
      button.setAttribute('role','radio');
      button.textContent=rushMode?o.textContent.replace(/^(Midi|Soir) · /,''):percentMode?o.textContent.replace(/ de la capacité$/,''):o.textContent;
      if(themeMode){
        const icon=document.createElement('i');
        icon.setAttribute('data-lucide',o.value==='auto'?'monitor':o.value==='light'?'sun':'moon');
        icon.setAttribute('aria-hidden','true');
        const label=document.createElement('span');label.textContent=o.textContent;
        button.replaceChildren(icon,label);
      }
      button.addEventListener('click',()=>{
        choice=o.value;
        if(instantMode){
          const current=source;
          if(!current)return;
          const changed=current.value!==choice;
          current.value=choice;
          if(changed){
            current.dispatchEvent(new Event('input',{bubbles:true}));
            current.dispatchEvent(new Event('change',{bubbles:true}));
          }
          close();
        }else render();
      });
      items.append(button);
    });
    items.setAttribute('role','radiogroup');render();dialog.hidden=false;
    document.body.classList.add('v3-picker-open');
    if(instantMode)items.querySelector('button.selected')?.focus({preventScroll:true});
    else dialog.querySelector('[data-confirm]').focus();
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
