'use strict';
/* Icônes Lucide : initialisation et mise à jour des éléments ajoutés dynamiquement. */
(function(){
 let busy=false;
 function render(){
  if(!window.lucide||typeof window.lucide.createIcons!=='function')return;
  window.lucide.createIcons({attrs:{'stroke-width':1.9}});
 }
 function schedule(){
  if(busy)return;busy=true;
  requestAnimationFrame(function(){busy=false;render()});
 }
 document.addEventListener('DOMContentLoaded',function(){
  render();
  const observer=new MutationObserver(function(records){
   if(records.some(function(record){return Array.from(record.addedNodes).some(function(node){return node.nodeType===1&&(node.matches?.('[data-lucide]')||node.querySelector?.('[data-lucide]'))})}))schedule();
  });
  observer.observe(document.body,{childList:true,subtree:true});
 });
})();