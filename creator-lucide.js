// RM-020.3 — adapter for Creator's nested icon hosts; one local shared SVG registry.
import './lucide-local.js?v=20261124-rm0203';
export const LUCIDE_VERSION='1.79.0';
export function createLucideIcon(name,size=19){
 return window.lucide.createIcon(name,{size,strokeWidth:1.85,className:'lucide lucide-'+name});
}
export function mountLucideIcons(root=document){
 for(const host of root.querySelectorAll('[data-lucide]')){
  if(host.firstElementChild?.classList.contains('lucide-'+host.dataset.lucide))continue;
  const icon=createLucideIcon(host.dataset.lucide,Number(host.dataset.iconSize)||19);
  if(icon)host.replaceChildren(icon);
 }
}
