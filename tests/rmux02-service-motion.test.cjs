'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {classify}=require('../service-v3-motion.js');
test('RM-UX-02.1: only first visible cards and actual changes animate',()=>{
 assert.equal(classify(undefined,'2','metric',true),'enter');
 assert.equal(classify(undefined,'reserved','reservation',true),'enter');
 assert.equal(classify(undefined,'Libre','table',true),'');
 assert.equal(classify('2','2','metric',false),'');
 assert.equal(classify('reserved','reserved','reservation',false),'');
 assert.equal(classify('Libre','Occupée','table',false),'change');
 assert.equal(classify('2','3','metric',false),'change');
 assert.equal(classify(undefined,'reserved','reservation',false),'');
});
test('RM-UX-02.1: local assets, preserved actual text, reduced motion and no data operations',()=>{
 const js=fs.readFileSync('service-v3-motion.js','utf8'),css=fs.readFileSync('service-v3.css','utf8'),html=fs.readFileSync('v3-connected.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.match(html,/service-v3-motion\.js\?v=20261124-rmux02\.2d/);
 assert.match(sw,/"service-v3-motion.js"/);
 assert.match(css,/\.reservationItem,\.tableAdminItem\{animation:none\}/);
 assert.match(css,/\.tableCard:active,\.tableCard:hover\{transform:none\}/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(js,/\bfetch\(|\.from\(|\.rpc\(|\.textContent\s*=|\.innerHTML\s*=|preventDefault\(|localStorage/);
 assert.match(js,/restomanager:screen/);
});

test('RM-UX-02.1: operational screens retain normal stacking and readable text',()=>{const css=fs.readFileSync('service-v3.css','utf8').split('/* RM-UX-02.1 — operational motion')[1];assert.doesNotMatch(css,/\.appScreenActive/);assert.doesNotMatch(css, /opacity:|translateY\(|scale\(/);});

test('RM-UX-03.4: service screen transitions never lower text contrast',()=>{const css=fs.readFileSync('service-v3.css','utf8');assert.match(css,/@keyframes restoScreenEnter\{from\{transform:translateY\(4px\)\}to\{transform:none\}\}/);assert.match(fs.readFileSync('service-v3-management-categories.css','utf8'),/\.roomManager \.roomManagerActions button\{[^}]*min-height:46px;min-width:44px/);});
