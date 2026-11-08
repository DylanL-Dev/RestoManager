'use strict';
/* Lucide-compatible local SVG icon set. No network dependency. */
(function(){
const shapes={
'building-2':'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
'wifi':'<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>',
'refresh-cw':'<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>',
'layout-grid':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
'calendar-plus':'<path d="M8 2v4M16 2v4M3 10h18"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"/><path d="M16 19h6m-3-3v6"/>',
'chevron-left':'<path d="m15 18-6-6 6-6"/>',
'chevron-right':'<path d="m9 18 6-6-6-6"/>',
'calendar-days':'<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
'plus':'<path d="M12 5v14M5 12h14"/>',
'clock-3':'<circle cx="12" cy="12" r="10"/><path d="M12 6v6h4"/>',
'settings':'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.92 1.92-.06-.06A1.65 1.65 0 0 0 16 18.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.05V21h-5v-.95A1.65 1.65 0 0 0 8 18.4a1.65 1.65 0 0 0-1.82.33l-.06.06-1.92-1.92.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.6-1.6H2v-2.8h1A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06L6.13 5.2l.06.06A1.65 1.65 0 0 0 8 5.6a1.65 1.65 0 0 0 1.6-1.6V3h5v1A1.65 1.65 0 0 0 16 5.6a1.65 1.65 0 0 0 1.82-.33l.06-.06 1.92 1.92-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.6 1.6h1v2.8h-1a1.65 1.65 0 0 0-1.6 1.6Z"/>',
'search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
'check-check':'<path d="m18 6-7 7-3-3"/><path d="m22 10-7 7-3-3M2 12l5 5"/>',
'chart-no-axes-column':'<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>',
'chevron-down':'<path d="m6 9 6 6 6-6"/>',
'ellipsis':'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', 'arrow-up-down':'<path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16"/>', 'sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>', 'moon':'<path d="M20.985 12.486A9 9 0 0 1 11.514 3.015 9 9 0 1 0 20.985 12.486Z"/>', 'monitor':'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
'check-circle-2':'<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
'trash-2':'<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/>',
'user-x':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 8l5 5m0-5-5 5"/>',
'x':'<path d="M18 6 6 18M6 6l12 12"/>',
'check':'<path d="m20 6-11 11-5-5"/>',
'alert-triangle':'<path d="m10.3 3.9-8.2 14.2A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
'circle-help':'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 17h.01"/>',
'info':'<circle cx="12" cy="12" r="10"/><path d="M12 11v5M12 8h.01"/>',
'alert-circle':'<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
'alarm-clock':'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M19 3l3 3M6 21l2-2M18 21l-2-2"/>',
'file-down':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 11v7m-3-3 3 3 3-3"/>',
'bell':'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
'utensils-crossed':'<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v19"/><path d="M20 3c-4 3-5 7-5 11h5V3Zm0 11v8"/>',
'user-plus':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6m3-3h-6"/>',
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