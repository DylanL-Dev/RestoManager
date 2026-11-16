/* RM-014: shell only; never cache Auth/REST, release checks, or a candidate update as published. */
const CACHE='restomanager-shell-20261116-prod-rm014.1';
const ROOT=new URL('./',self.registration.scope).pathname;
const SHELL=["asset/img/logo.png", "asset/img/restomanager-chef-white.svg", "booking-availability.js", "booking-draft.js", "index.html", "lucide-local.js", "manifest.json", "pwa-icon.svg", "reception-service-overview.js", "reservation-details.js", "reservation-edit.js", "reservation-engine.js", "resto-errors.js", "service-snapshot.js", "service-sync.js", "service-v3-add-choice.js", "service-v3-app-release.js", "service-v3-arrival-preview.css", "service-v3-arrival-preview.js", "service-v3-booking-director-choices.js", "service-v3-calendar-picker.css", "service-v3-calendar-picker.js", "service-v3-closure.js", "service-v3-confirm.js", "service-v3-dialogs.js", "service-v3-fb-alerts.js", "service-v3-feedback.js", "service-v3-fusion-builder.css", "service-v3-fusions.js", "service-v3-history.js", "service-v3-kpi-detail.js", "service-v3-lucide.js", "service-v3-management-categories.css", "service-v3-notification-model.js", "service-v3-notifications.css", "service-v3-passage-cards.css", "service-v3-passage-cards.js", "service-v3-quick-release.js", "service-v3-refresh.js", "service-v3-reminders.js", "service-v3-report-download.js", "service-v3-report-metrics.js", "service-v3-reservation-fields.css", "service-v3-reservation-list-rm005.css", "service-v3-reservations.js", "service-v3-room-choices.js", "service-v3-screens.js", "service-v3-select-picker.js", "service-v3-shared-closure.js", "service-v3-shifts.js", "service-v3-slot-capacity.js", "service-v3-table-admin.js", "service-v3-table-choices.js", "service-v3-table-pressure.js", "service-v3-table-store.js", "service-v3-theme.js", "service-v3-time-picker.js", "service-v3-tutorial.css", "service-v3-tutorial.js", "service-v3-walkin-fast.js", "service-v3-weekly-schedule.css", "service-v3-weekly-schedule.js", "service-v3.css", "service-v3.html", "service-v3.js", "smart-placement-engine.js", "supabase-service-bridge.js", "ui/booking-slot-cards.css", "v3-connected-auth.js", "v3-connected.html", "v3-supabase-booking.js"].map(path=>ROOT+path);
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(async cache=>{
  await Promise.all(SHELL.map(async url=>{const response=await fetch(url,{cache:'reload'});if(!response.ok)throw Error('PWA resource unavailable: '+url);await cache.put(url,response)}));
 }));
 // Deliberately no skipWaiting: installing a version must never reload or take over a draft.
});
self.addEventListener('activate',event=>{
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  // Existing tabs retain their versioned resources. Cleanup only when no window depends on them.
  if(!clients.length){const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('restomanager-shell-')&&key!==CACHE).map(key=>caches.delete(key)))}
 }));
});
async function checkClients(){
 const clients=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>new URL(client.url).pathname.startsWith(ROOT));
 const answers=await Promise.all(clients.map(client=>new Promise(resolve=>{
  const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(false)},2200);
  channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();const state=event.data;resolve(state?.type==='RESTO_UPDATE_STATE'&&!state.dirty&&!state.busy)};
  client.postMessage({type:'RESTO_UPDATE_CHECK'},[channel.port2]);
 })));
 return answers.every(Boolean);
}
self.addEventListener('message',event=>{
 if(!['RESTO_CAN_UPDATE','RESTO_APPLY_UPDATE'].includes(event.data?.type)||!event.ports[0])return;
 event.waitUntil((async()=>{
  const ok=await checkClients();
  if(ok&&event.data.type==='RESTO_APPLY_UPDATE')await self.skipWaiting();
  event.ports[0].postMessage({ok,message:ok?'':'Une autre fenêtre contient une saisie ou ne répond pas.'});
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||!url.pathname.startsWith(ROOT))return;
 if(url.pathname.endsWith('/app-release.json')||url.searchParams.has('release-check')||url.searchParams.has('check'))return;
 if(request.mode!=='navigate'&&!/\.(?:js|css|svg|png|webmanifest|json)$/.test(url.pathname))return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}return response;
 }).catch(async()=>await caches.match(request)||await caches.match(url.pathname)||(request.mode==='navigate'?await caches.match(ROOT+'v3-connected.html'):null)||Response.error()));
});
