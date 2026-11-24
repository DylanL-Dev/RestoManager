'use strict';
// RM-UX-02.1 — a purely visual snapshot comparison. No network, no writes, no business actions.
(function(){
 const roots=[
  {id:'kpis',selector:'.kpi',kind:'metric'},
  {id:'receptionServiceOverview',selector:'.receptionServiceMetric',kind:'metric'},
  {id:'tableGrid',selector:'.tableCard',kind:'table'},
  {id:'reservationList',selector:'.reservationItem[data-rm-motion-key]',kind:'reservation'}
 ];
 function classify(previous,current,kind,firstVisible){
  if(firstVisible)return kind==='table'?'':'enter';
  if(previous===undefined)return '';
  return previous!==current?'change':'';
 }
 if(typeof module==='object'&&module.exports){module.exports={classify};return;}
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const memory=new WeakMap(),gaugeMemory=new WeakMap(),barMemory=new WeakMap();
 let scheduled=false;
 function visible(root){
  return !root.closest('[hidden]')&&root.getClientRects().length>0&&getComputedStyle(root).visibility!=='hidden'&&getComputedStyle(document.body).visibility!=='hidden';
 }
 function item(node,kind){
  if(kind==='metric')return [node.getAttribute('aria-label')||'',node.querySelector('strong')?.textContent.trim()||''];
  if(kind==='table')return [node.querySelector('.num')?.textContent.trim()||'',node.querySelector('.status')?.textContent.trim()||''];
  return [node.dataset.rmMotionKey||'',node.dataset.status||''];
 }
 function scanGauges(){
  for(const id of ['currentOccupancy','receptionServiceOverview']){
   const root=document.getElementById(id);
   if(!root||!visible(root))continue;
   const gauge=root.querySelector('[data-rm-gauge-key="tables"]');
   if(!gauge){gaugeMemory.delete(root);continue;}
   const value=Number(gauge.dataset.rmGaugeValue);
   if(!Number.isFinite(value)||value<0||value>100)continue;
   const previous=gaugeMemory.get(root);
   if(!reduced.matches&&previous?.value!==value){
    const from=previous?.value??0;
    if(from!==value){
     gauge.style.setProperty('--rm-gauge-from',from+'%');
     gauge.dataset.rmGaugeAnimate='true';
     window.setTimeout(()=>{delete gauge.dataset.rmGaugeAnimate;gauge.style.removeProperty('--rm-gauge-from');},650);
    }
   }
   gaugeMemory.set(root,{value});
  }
 }
 function scanBars(){
  for(const id of ['rushDashboard','receptionServiceOverview']){
   const root=document.getElementById(id);if(!root||!visible(root))continue;
   const previous=barMemory.get(root),next=new Map();
   for(const bar of root.querySelectorAll('[data-rm-bar-key]')){
    const key=bar.dataset.rmBarKey,value=Number(bar.dataset.rmBarValue);
    if(!key||!Number.isFinite(value)||value<0||value>100)continue;
    const old=previous?.get(key)??0;
    if(!reduced.matches&&old!==value){
     bar.style.setProperty('--rm-bar-from',old+'%');bar.dataset.rmBarAnimate='true';
     window.setTimeout(()=>{delete bar.dataset.rmBarAnimate;bar.style.removeProperty('--rm-bar-from');},650);
    }
    next.set(key,value);
   }
   barMemory.set(root,next);
  }
 }
 function scan(){
  scheduled=false;
  scanGauges();scanBars();
  for(const config of roots){
   const root=document.getElementById(config.id);
   if(!root||!visible(root))continue;
   const nodes=[...root.querySelectorAll(config.selector)];
   if(!nodes.length)continue;
   const previous=memory.get(root);
   const first=!previous;
   const next=new Map();
   let enters=0;
   for(const node of nodes){
    const [key,value]=item(node,config.kind);
    if(!key||!value)continue;
    const action=classify(previous?.get(key)?.value,value,config.kind,first);
    const sameNode=previous?.get(key)?.node===node;
    if(!reduced.matches&&action&&(!sameNode||previous?.get(key)?.value!==value)&&
       (action!=='enter'||enters<4)){
     node.dataset.rmMotion=action;
     if(action==='enter'){node.style.setProperty('--rm-service-delay',(enters++*65)+'ms');}
     else node.style.removeProperty('--rm-service-delay');
     const clear=()=>{delete node.dataset.rmMotion;node.style.removeProperty('--rm-service-delay');};
     // Bounded cleanup even when reduced motion is toggled during an animation.
     window.setTimeout(clear,750);
    }
    next.set(key,{value,node});
   }
   memory.set(root,next);
  }
 }
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(scan);}
 function install(){
  const observer=new MutationObserver(records=>{
   if(records.some(r=>[...roots,{id:'currentOccupancy'},{id:'rushDashboard'}].some(c=>{
    const root=document.getElementById(c.id);
    return root&&(root===r.target||root.contains(r.target));
   })))schedule();
  });
  observer.observe(document.body,{childList:true,characterData:true,subtree:true});
  window.addEventListener('restomanager:screen',schedule);
  // Role/data visibility may be restored by the existing auth gate after initial render.
  const gate=new MutationObserver(schedule);
  gate.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});
  gate.observe(document.body,{attributes:true,attributeFilter:['class','style']});
  schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
