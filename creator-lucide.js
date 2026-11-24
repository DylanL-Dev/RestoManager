// RM-020.2 — official Lucide 1.79.0 SVG subset; ISC/MIT notices: asset/licenses/lucide-1.79.0.txt.
import nav from './creator-lucide-nav.js?v=1.79.0';
import indicators from './creator-lucide-indicators.js?v=1.79.0';
import actions from './creator-lucide-actions.js?v=1.79.0';
export const LUCIDE_VERSION='1.79.0';
const icons=Object.freeze({...nav,...indicators,...actions});
export function createLucideIcon(name,size=19){
 const markup=Object.hasOwn(icons,name)?icons[name]:null;if(!markup)return null;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');
 svg.setAttribute('width',String(size));svg.setAttribute('height',String(size));
 svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
 svg.setAttribute('stroke-width','1.85');svg.setAttribute('stroke-linecap','round');
 svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
 svg.classList.add('lucide','lucide-'+name);
 // Hard-coded, allowlisted icon markup; no user-controlled input.
 svg.innerHTML=markup;return svg;
}
export function mountLucideIcons(root=document){
 for(const host of root.querySelectorAll('[data-lucide]')){
  if(host.firstElementChild?.classList.contains('lucide-'+host.dataset.lucide))continue;
  const icon=createLucideIcon(host.dataset.lucide,Number(host.dataset.iconSize)||19);
  if(icon)host.replaceChildren(icon);
 }
}
