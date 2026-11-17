'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=file=>fs.readFileSync(file,'utf8');
const tutorial=read('service-v3-tutorial.js'),auth=read('v3-connected-auth.js'),html=read('v3-connected.html');
test('RM-016 integrates only into the authenticated staff flow and preserves form guards',()=>{
 assert.match(auth,/installTutorial\(\{user:authUser,profile,management\}\)/);
 assert.match(tutorial,/\['reception', 'fb_admin'\]\.includes\(profile.role\)/);
 assert.match(tutorial,/RestoScreens\?\.request\?\./);
 assert.doesNotMatch(tutorial,/\.from\(['"]reservations|\.insert\(|\.update\(|\.delete\(|\.rpc\(|\.submit\(|\.requestSubmit\(/);
 assert.match(auth,/const permittedCloseout=/);assert.match(auth,/document.addEventListener\('submit',forbidden,true\)/);
 for(const asset of ['service-v3-tutorial.css','service-v3-tutorial-model.js','service-v3-tutorial-training.js'])assert.ok(html.includes(asset+'?v=20261117-rm016'),asset);
 assert.match(tutorial,/setAttribute\('sandbox', 'allow-scripts'\)/);
 assert.match(tutorial,/event.source !== trainingFrame.contentWindow/);
});
test('RM-016 learning, practice and help are available in the cached application shell',()=>{
 const shell=read('sw.js');for(const file of ['service-v3-tutorial.js','service-v3-tutorial-model.js','service-v3-tutorial-training.js','service-v3-tutorial.css'])assert.ok(shell.includes('"'+file+'"'));
 assert.match(read('service-v3-tutorial.css'),/prefers-reduced-motion/);
 assert.match(read('service-v3-app-release.js'),/Comprendre cette nouveauté/);
});
