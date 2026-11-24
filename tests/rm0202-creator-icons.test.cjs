'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
test('RM-020.2 official local Lucide version, all declared icons and licenses',()=>{
 const html=read('creator.html'),js=read('creator-lucide.js'),shell=read('creator-shell.js');
 const icons=read('lucide-local.js');
 assert.match(js,/LUCIDE_VERSION='1\.79\.0'/);
 for(const [,name] of html.matchAll(/data-lucide="([\w-]+)"/g))assert.ok(icons.includes("'"+name+"':"),name);
 assert.match(read('asset/licenses/lucide-1.79.0.txt'),/ISC License/);
 assert.match(read('asset/licenses/lucide-1.79.0.txt'),/MIT License/);
 assert.match(shell,/upgradeSupportIcons/);assert.match(shell,/filterDirectory/);
 assert.doesNotMatch(shell,/\bfetch\(|\.rpc\(|\.from\(/);
});
