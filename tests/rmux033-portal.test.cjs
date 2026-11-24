'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('RM-UX-03.3 selection summary only reflects available selected slot',()=>{
 const live=read('reservation/live.mjs'),demo=read('reservation/portal.js');
 assert.match(live,/if\(loading\|\|!slots.some\(s=>s.available&&s.time===draft.time\)\)return ''/);
 assert.match(demo,/if\(!a.slots.some\(s=>s.available&&s.time===draft.time\)\)return ''/);
 assert.match(live,/Disponibilité à revérifier avant validation/);
 assert.match(demo,/Exemple fictif, sans réservation réelle/);
 assert.match(live,/await api.hold\(draft\)/);
 assert.match(live,/rmPortalSkeleton" aria-hidden="true"/);
 assert.match(read('reservation/portal.css'),/\.rmPortalSkeleton span\{animation:none!important\}/);
 assert.match(read('reservation/index.html'),/connect-src 'none'/);
});
