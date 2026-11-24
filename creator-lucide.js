// RM-020.1 — local Lucide outline icon paths. No CDN or tracking.
const icons=Object.freeze({
 'layout-dashboard':'<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
 'store':'<path d="m3 9 2-5h14l2 5M5 9v11h14V9M9 20v-7h6v7M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
 'life-buoy':'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24m5.66 5.66 4.24 4.24m0-14.14-4.24 4.24m-5.66 5.66-4.24 4.24"/>',
 'users-round':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 'clipboard-check':'<rect width="16" height="18" x="4" y="4" rx="2"/><rect width="8" height="4" x="8" y="2" rx="1"/><path d="m9 14 2 2 4-4"/>',
 'activity':'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
 'settings-2':'<path d="M20 7h-9m-6 0H4m2 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm14 10h-3m-6 0H4m9 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"/>',
 'menu':'<path d="M4 6h16M4 12h16M4 18h16"/>',
 'x':'<path d="M18 6 6 18M6 6l12 12"/>',
 'panel-left-close':'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18m5-7-2-2 2-2"/>',
 'panel-left-open':'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18m4-7 2-2-2-2"/>',
 'refresh-cw':'<path d="M3 12a9 9 0 0 1 15.36-6.36L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.36 6.36L3 16m0 5v-5h5"/>',
 'arrow-up-right':'<path d="M7 17 17 7M7 7h10v10"/>',
 'log-out':'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5m5 5H9"/>',
 'chevron-right':'<path d="m9 18 6-6-6-6"/>',
 'sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m4.93-17.07-1.42 1.42M6.49 17.51l-1.42 1.42M22 12h-2M4 12H2m17.07 7.07-1.42-1.42M6.49 6.49 5.07 5.07"/>',
 'moon':'<path d="M20.985 12.486A9 9 0 0 1 11.514 3.015a9 9 0 1 0 9.47 9.47Z"/>',
 'shield-check':'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
 'building-2':'<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
 'inbox':'<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M2 13h6l2 3h4l2-3h6"/>',
 'clock-3':'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
 'triangle-alert':'<path d="m10.29 3.86-8.47 14.3A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-2.84l-8.47-14.3a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4m0 4h.01"/>',
 'circle-check':'<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
 'calendar-days':'<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"/>',
 'search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
 'sparkles':'<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3ZM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/>',
 'external-link':'<path d="M15 3h6v6M10 14 21 3"/><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>',
 'lock-keyhole':'<rect width="16" height="11" x="4" y="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2"/>',
 'server':'<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
 'hotel':'<path d="M10 22v-6.5m4 0V22M4 22V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14M2 22h20"/><path d="M8 10h.01M16 10h.01M8 14h.01M16 14h.01M8 2v4m8-4v4"/>',
 'chef-hat':'<path d="M6 13.87A4 4 0 0 1 6.93 6 6 6 0 0 1 18.1 7.1 4 4 0 0 1 18 14v6H6Z"/><path d="M6 17h12"/>'
});
export function createLucideIcon(name,size=19){
 const markup=icons[name];if(!markup)return null;
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
  const icon=createLucideIcon(host.dataset.lucide,Number(host.dataset.iconSize)||19);
  if(icon)host.replaceChildren(icon);
 }
}
