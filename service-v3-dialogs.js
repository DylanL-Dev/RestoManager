'use strict';
(function(){
 const style=document.createElement('style');
 style.textContent=`.rmNoticeOverlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,35,29,.56);backdrop-filter:blur(5px)}.rmNoticeOverlay[hidden]{display:none!important}.rmNoticeCard{box-sizing:border-box;width:min(100%,440px);max-height:calc(100dvh - 40px);overflow:auto;border-radius:24px;padding:26px;background:#fff;color:#193e33;box-shadow:0 20px 70px #08281d50;font-family:inherit}.rmNoticeIcon{display:grid;place-items:center;width:52px;height:52px;border-radius:15px;background:#e8f6ef;color:#087f5b}.rmNoticeIcon svg{width:28px;height:28px}.rmNoticeEyebrow{margin:20px 0 8px;color:#087f5b;font-size:12px;font-weight:800;letter-spacing:.12em}.rmNoticeCard h2{font-size:clamp(23px,6vw,29px);line-height:1.18;margin:0 0 13px}.rmNoticeCard p.rmNoticeMessage{font-size:16px;line-height:1.55;color:#5b7068;white-space:pre-line;overflow-wrap:anywhere}.rmNoticeActions{display:flex;gap:10px;margin-top:24px}.rmNoticeActions button{min-height:52px;flex:1;border-radius:13px;border:1px solid #cbdcd2;background:#f6faf7;color:#19513d;font:700 15px inherit;cursor:pointer;padding:12px}.rmNoticeActions .rmNoticePrimary{background:#087f5b;color:white;border-color:#087f5b}.rmNoticeActions .rmNoticeDanger{background:#9e3434;border-color:#9e3434;color:white}@media(max-width:360px){.rmNoticeActions{flex-direction:column}}`;
 document.head.append(style);
 let queue=Promise.resolve(),sequence=0;
 function show(message,options={}){
  const run=()=>new Promise(resolve=>{
   const previous=document.activeElement,scroll={x:window.scrollX,y:window.scrollY},overflow=document.body.style.overflow;
   const overlay=document.createElement('div');overlay.className='rmNoticeOverlay';
   const card=document.createElement('section');card.className='rmNoticeCard';card.setAttribute('role','alertdialog');card.setAttribute('aria-modal','true');
   const id='restoNotice-'+(++sequence);card.setAttribute('aria-labelledby',id+'-title');card.setAttribute('aria-describedby',id+'-message');
   const symbol=document.createElement('div');symbol.className='rmNoticeIcon';
   const icon=document.createElement('i');icon.setAttribute('data-lucide',options.danger?'alert-triangle':options.confirm?'circle-help':'info');symbol.append(icon);
   const eyebrow=document.createElement('div');eyebrow.className='rmNoticeEyebrow';eyebrow.textContent='RESTOMANAGER';
   const title=document.createElement('h2');title.id=id+'-title';title.textContent=options.title||(options.confirm?'Confirmer cette action':'Information');
   const desc=document.createElement('p');desc.id=id+'-message';desc.className='rmNoticeMessage';desc.textContent=String(message);
   const actions=document.createElement('div');actions.className='rmNoticeActions';
   const cancel=document.createElement('button');cancel.type='button';cancel.textContent=options.confirm?'Annuler':'Fermer';
   const accept=document.createElement('button');accept.type='button';accept.className='rmNoticePrimary'+(options.danger?' rmNoticeDanger':'');accept.textContent=options.acceptLabel||'Confirmer';
   let finished=false;
   const done=value=>{if(finished)return;finished=true;document.removeEventListener('keydown',keys,true);overlay.remove();document.body.style.overflow=overflow;previous?.focus?.({preventScroll:true});window.scrollTo(scroll.x,scroll.y);resolve(value)};
   cancel.addEventListener('click',()=>done(false));accept.addEventListener('click',()=>done(true));
   actions.append(cancel);if(options.confirm)actions.append(accept);
   card.append(symbol,eyebrow,title,desc,actions);overlay.append(card);document.body.append(overlay);document.body.style.overflow='hidden';
   if(window.lucide?.createIcons)window.lucide.createIcons({nodes:[symbol]});
   const keys=e=>{if(!overlay.isConnected)return;if(e.key==='Escape'){e.preventDefault();done(false)}if(e.key==='Tab'){const buttons=[...actions.querySelectorAll('button')],idx=buttons.indexOf(document.activeElement);if(e.shiftKey&&idx===0){e.preventDefault();buttons[buttons.length-1].focus()}else if(!e.shiftKey&&idx===buttons.length-1){e.preventDefault();buttons[0].focus()}}};
   document.addEventListener('keydown',keys,true);(options.confirm?cancel:cancel).focus();
  });
  const result=queue.then(run,run);queue=result.then(()=>{},()=>{});return result;
 }
 window.RestoDialog={confirm:(message,options={})=>show(message,{...options,confirm:true}),alert:(message,options={})=>show(message,options)};
})();
