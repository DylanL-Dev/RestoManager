'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('login.html','utf8');
test('RM-UX-03.1 keeps staff auth entry points and accessible controls',()=>{
 for(const id of ['login','username','password','submit','forgot','recovery','message'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/type="password" autocomplete="current-password"/);
 assert.match(html,/autocomplete="username"/);
 assert.match(html,/type="module" src="supabase-login.js\?v=20261109-twins1"/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/aria-controls="password" aria-pressed="false"/);
 assert.match(html,/import \{supabaseEnvironment\} from '\.\/restomanager-env\.js/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/href="creator.html" target="_blank" rel="noopener noreferrer"/);
 assert.match(html,/href="inscription.html"/);
});
