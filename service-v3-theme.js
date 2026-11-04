'use strict';
(function(){
 const KEY='restomanager_v3_theme';
 const root=document.documentElement;
 const options=['auto','light','dark'];
 const system=window.matchMedia('(prefers-color-scheme: dark)');
 function saved(){try{const value=localStorage.getItem(KEY);return options.includes(value)?value:'auto'}catch{return 'auto'}}
 function apply(mode){const effective=mode==='auto'?(system.matches?'dark':'light'):mode;root.dataset.theme=effective;root.style.colorScheme=effective;const picker=document.getElementById('themeMode');if(picker)picker.value=mode;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=effective==='dark'?'#102821':'#103f35'}
 const picker=document.createElement('select');picker.id='themeMode';picker.setAttribute('aria-label','Thème de RestoManager');for(const [value,label] of [['auto','Automatique'],['light','Clair'],['dark','Sombre']]){const o=document.createElement('option');o.value=value;o.textContent=label;picker.append(o)}
 const label=document.createElement('label');label.className='themeModeControl';const icon=document.createElement('span');icon.textContent='Apparence';label.append(icon,picker);const management=document.querySelector('[data-screen="administration"]');if(management){const section=document.createElement('section');section.className='managementGroup themeSettingsGroup';const head=document.createElement('div');head.className='themeSettingsHead';const heading=document.createElement('strong');heading.textContent='Apparence';const description=document.createElement('p');description.textContent='Choisissez le thème de RestoManager sur cet appareil.';head.append(heading,description);section.append(head,label);management.append(section)}else{document.querySelector('header.top')?.append(label)}
 picker.addEventListener('change',()=>{try{localStorage.setItem(KEY,picker.value)}catch{}apply(picker.value)});
 if(system.addEventListener)system.addEventListener('change',()=>{if(saved()==='auto')apply('auto')});else if(system.addListener)system.addListener(()=>{if(saved()==='auto')apply('auto')});
 apply(saved());
})();
