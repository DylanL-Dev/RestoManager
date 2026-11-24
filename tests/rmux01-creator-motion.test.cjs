'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('RM-UX-01.1: local finite motion, accessible real values and no network',()=>{
 const css=read('creator-motion.css'),js=read('creator-shell.js'),html=read('creator.html');
 assert.match(html,/creator-motion\.css\?v=20261124-rmux01\.1/);
 assert.match(html,/creator-shell\.js\?v=20261124-rm0201-rm0202-rm0203-rmux01\.1/);
 for(const key of ['rmMotionEnter','rmMotionValue','rmMotionSpin','rmMotionSkeleton','rmMotionIcon'])assert.ok(css.includes('@keyframes '+key),key);
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/animation:none!important;transition:none!important/);
 assert.doesNotMatch(css,/\binfinite\b|@import|url\(\s*https?:/);
 const motion=js.slice(js.indexOf('// RM-UX-01.1'));
 assert.match(motion,/node\.textContent\.trim\(\)/);assert.match(motion,/motionReduced\.matches/);
 assert.doesNotMatch(motion,/\.textContent\s*=|\.innerHTML\s*=|fetch\(|\.from\(|\.rpc\(|preventDefault\(/);
 assert.match(css,/data-rm-motion-loading="true"/);
});
