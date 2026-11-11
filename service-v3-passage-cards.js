'use strict';
(function(){
 const form=document.getElementById('walkinForm');
 const select=document.getElementById('walkinTable');
 if(!form||!select)return;
 const deck=document.createElement('section');
 deck.id='walkinTableDeck';
 deck.className='walkinTableDeck';
 deck.setAttribute('aria-label','Tables disponibles maintenant');
 deck.innerHTML='<div class="walkinDeckHeading"><h3><i data-lucide="table-2" aria-hidden="true"></i>Tables disponibles maintenant</h3><span id="walkinAvailableCount" class="walkinAvailableCount">0 table</span></div><div class="walkinDeckTabs" role="group" aria-label="Catégories de tables"><button type="button" id="walkinGoRecommended" class="isActive"><i data-lucide="star" aria-hidden="true"></i><span>Recommandées</span> <small id="walkinRecommendedCount">0</small></button><button type="button" id="walkinGoOther"><i data-lucide="layout-grid" aria-hidden="true"></i><span>Autres disponibles</span> <small id="walkinOtherCount">0</small></button></div><div id="walkinRecommendedCards" class="walkinTableCards" role="group" aria-label="Tables recommandées"></div><h4 id="walkinOtherHeading" class="walkinOtherHeading">Autres tables disponibles</h4><div id="walkinOtherCards" class="walkinTableCards walkinOtherCards" role="group" aria-label="Autres tables disponibles"></div><p id="walkinNoCards" class="walkinNoCards" hidden>Aucune table disponible pour le moment.</p>';
 const anchor=form.querySelector('#walkinRecommendation');
 form.insertBefore(deck,anchor);
 const install=form.querySelector('.walkinInstall span');
 if(install)install.textContent='Installer le passage';
 const summary=document.createElement('div');
 summary.id='walkinSelectedSummary';summary.className='walkinSelectedSummary';
 summary.innerHTML='<i data-lucide="table-2" aria-hidden="true"></i><strong id="walkinSelectedText">Sélectionnez une table</strong><button type="button" id="walkinChangeTable">Changer</button>';
 form.append(summary);
 const $=id=>document.getElementById(id);
 function tableCapacity(numbers){
  const plan=typeof TableStore!=='undefined'?TableStore.get().tables:[];
  return numbers.reduce((sum,n)=>sum+(Number(plan.find(t=>Number(t.number)===n)?.capacity)||0),0);
 }
 function title(numbers){return (numbers.length>1?'Tables ':'Table ')+numbers.join(' + ')}
 function createCard(option,best){
  const numbers=option.value.split(',').map(Number).filter(Number.isFinite);
  const capacity=tableCapacity(numbers)||Number(option.textContent.match(/(\d+) places/)?.[1])||0;
  const card=document.createElement('button');card.type='button';
  card.className='walkinTableCard'+(select.value===option.value?' isSelected':'');
  card.disabled=option.disabled;
  card.setAttribute('aria-pressed',String(select.value===option.value));
  card.setAttribute('aria-label',title(numbers)+', '+capacity+' places'+(best?', recommandée':''));
  const heading=document.createElement('div');heading.className='walkinCardTop';
  const icon=document.createElement('i');icon.dataset.lucide='table-2';icon.setAttribute('aria-hidden','true');heading.append(icon);
  if(best){const badge=document.createElement('span');badge.className='walkinCardBadge';badge.textContent='★ Recommandée';heading.append(badge)}
  const name=document.createElement('strong');name.className='walkinCardName';name.textContent=title(numbers);
  const seats=document.createElement('span');seats.className='walkinCardDetail';
  const seatsIcon=document.createElement('i');seatsIcon.dataset.lucide='users';seatsIcon.setAttribute('aria-hidden','true');
  seats.append(seatsIcon,document.createTextNode(capacity+' place'+(capacity!==1?'s':'')));
  const room=document.createElement('span');room.className='walkinCardDetail';
  const roomIcon=document.createElement('i');roomIcon.dataset.lucide='map-pin';roomIcon.setAttribute('aria-hidden','true');
  room.append(roomIcon,document.createTextNode('Salle principale'));
  const choice=document.createElement('span');choice.className='walkinCardIndicator';choice.textContent=select.value===option.value?'✓':'';
  card.append(heading,name,seats,room,choice);
  card.addEventListener('click',()=>{
   if(card.disabled)return;
   select.value=option.value;
   select.dispatchEvent(new Event('change',{bubbles:true}));
   render();
  });
  return card;
 }
 function render(){
  const options=Array.from(select.options).filter(option=>option.value&&!option.disabled);
  const pax=Number($('walkinGuests')?.value)||0;
  const sorted=options.map(option=>{
   const numbers=option.value.split(',').map(Number).filter(Number.isFinite);
   return {option,numbers,capacity:tableCapacity(numbers)||Number(option.textContent.match(/(\d+) places/)?.[1])||0};
  }).sort((a,b)=>a.capacity-b.capacity||a.numbers.length-b.numbers.length||a.option.value.localeCompare(b.option.value,'fr',{numeric:true}));
  const minimum=sorted[0]?.capacity;
  // Show up to three excellent fits, not an arbitrary large table.
  const recommended=sorted.filter(entry=>entry.capacity===minimum).slice(0,3);
  const recommendationValues=new Set(recommended.map(entry=>entry.option.value));
  const allOthers=sorted.filter(entry=>!recommendationValues.has(entry.option.value));
  const others=allOthers.slice(0,2);
  const bestGrid=$('walkinRecommendedCards'),otherGrid=$('walkinOtherCards');
  bestGrid.replaceChildren(...recommended.map(entry=>createCard(entry.option,true)));
  otherGrid.replaceChildren(...others.map(entry=>createCard(entry.option,false)));
  $('walkinAvailableCount').textContent=options.length+' table'+(options.length!==1?'s':'');
  $('walkinRecommendedCount').textContent=String(recommended.length);
  $('walkinOtherCount').textContent=String(others.length);
  $('walkinOtherCount').setAttribute('aria-label',others.length+' autres tables affichées sur '+allOthers.length+' disponibles');
  $('walkinOtherHeading').hidden=!others.length;
  $('walkinGoOther').disabled=!others.length;
  $('walkinNoCards').hidden=options.length>0;
  if(options.length===0)$('walkinNoCards').textContent=$('walkinRecommendation')?.textContent||'Aucune table disponible pour le moment.';
  const chosen=sorted.find(entry=>entry.option.value===select.value);
  $('walkinSelectedText').textContent=chosen?'Table sélectionnée : '+title(chosen.numbers):'Aucune table sélectionnée';
  const manual=$('walkinManualTable');
  if(manual){
   manual.hidden=!options.length;
   manual.disabled=!options.length||select.disabled;
   manual.textContent=allOthers.length>2?'Choisir manuellement · '+options.length+' options':'Choisir manuellement';
  }
  $('walkinChangeTable').disabled=!options.length;
  deck.classList.toggle('walkinDeckEmpty',!options.length);
  const active=document.activeElement;
  if(active&&active.isConnected&&deck.contains(active))active.focus({preventScroll:true});
 }
 let scheduled=false;
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;render()})}
 new MutationObserver(schedule).observe(select,{childList:true});
 select.addEventListener('change',schedule);
 window.addEventListener('restomanager:v3-change',schedule);
 window.addEventListener('restomanager:connection-state',schedule);
 $('walkinGoRecommended').addEventListener('click',()=>{$('walkinRecommendedCards').scrollIntoView({behavior:'smooth',block:'nearest'});$('walkinGoRecommended').classList.add('isActive');$('walkinGoOther').classList.remove('isActive')});
 $('walkinGoOther').addEventListener('click',()=>{$('walkinOtherCards').scrollIntoView({behavior:'smooth',block:'nearest'});$('walkinGoOther').classList.add('isActive');$('walkinGoRecommended').classList.remove('isActive')});
 const manualButton=document.createElement('button');
 manualButton.id='walkinManualTable';
 manualButton.type='button';
 manualButton.className='walkinManualTable';
 manualButton.innerHTML='<i data-lucide="layout-grid" aria-hidden="true"></i><span>Choisir manuellement</span>';
 deck.append(manualButton);
 function openManual(){
  if(!Array.from(select.options).some(option=>option.value&&!option.disabled))return;
  window.RestoTableChoices?.open('walkinTable');
 }
 manualButton.addEventListener('click',openManual);
 $('walkinChangeTable').addEventListener('click',()=>{
  if(!select.options.length)return;
  // Keep the same table selector for keyboard and touch; no second data source.
  openManual();
 });
 window.RestoPassageCards={refresh:render};
 render();
 document.dispatchEvent(new Event('restomanager:icons-refresh'));
})();
