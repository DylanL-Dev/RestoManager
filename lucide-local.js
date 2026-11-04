'use strict';
/* Lucide-compatible local SVG icon set. No network dependency. */
(function(){
const shapes={
'layout-grid':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
'calendar-days':'<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
'plus':'<path d="M12 5v14M5 12h14"/>',
'clock-3':'<circle cx="12" cy="12" r="10"/><path d="M12 6v6h4"/>',
'settings':'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.92 1.92-.06-.06A1.65 1.65 0 0 0 16 18.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.05V21h-5v-.95A1.65 1.65 0 0 0 8 18.4a1.65 1.65 0 0 0-1.82.33l-.06.06-1.92-1.92.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.6-1.6H2v-2.8h1A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06L6.13 5.2l.06.06A1.65 1.65 0 0 0 8 5.6a1.65 1.65 0 0 0 1.6-1.6V3h5v1A1.65 1.65 0 0 0 16 5.6a1.65 1.65 0 0 0 1.82-.33l.06-.06 1.92 1.92-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.6 1.6h1v2.8h-1a1.65 1.65 0 0 0-1.6 1.6Z"/>',
'search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
'check-check':'<path d="m18 6-7 7-3-3"/><path d="m22 10-7 7-3-3M2 12l5 5"/>',
'chart-no-axes-column':'<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>',
'chevron-down':'<path d="m6 9 6 6 6-6"/>',
'x':'<path d="M18 6 6 18M6 6l12 12"/>',
'check':'<path d="m20 6-11 11-5-5"/>',
'alert-circle':'<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
'alarm-clock':'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M19 3l3 3M6 21l2-2M18 21l-2-2"/>',
'file-down':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 11v7m-3-3 3 3 3-3"/>',
'bell':'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'
};
function createIcons(){
 document.querySelectorAll('[data-lucide]').forEach(el=>{
  const name=el.getAttribute('data-lucide');if(!shapes[name])return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.9');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
  svg.setAttribute('class',el.getAttribute('class')||'lucide-icon');svg.innerHTML=shapes[name];el.replaceWith(svg);
 });
}
window.lucide={createIcons};
})();