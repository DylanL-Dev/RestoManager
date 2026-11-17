'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync('docs/releases/RM012_RELEASE_MANIFEST_20261117.json'));
test('RM-012 production: protected connection files and dependency lock remain unchanged',()=>{
 for(const [file,expected] of Object.entries(manifest.protected_production_files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,file);
 assert.equal(fs.existsSync('restomanager-env.js'),false);
 assert.equal(JSON.parse(fs.readFileSync('package.json')).devDependencies['@supabase/supabase-js'],'2.57.0');
});
test('RM-012 production: published channel/version agree and every offline dependency exists',()=>{
 const release=JSON.parse(fs.readFileSync('app-release.json')),html=fs.readFileSync('v3-connected.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.equal(release.channel,'main');assert.equal(release.currentVersion,manifest.version);
 assert.ok(html.includes('name="restomanager-channel" content="main"'));assert.ok(html.includes('name="restomanager-version" content="'+release.currentVersion+'"'));
 assert.equal(release.releases.some(r=>r.version==='2026.11.16-rm014'),false,'DEV-only release must not be invented in production history');
 const resources=JSON.parse(sw.match(/const SHELL=(\[.*?\])\.map/)[1]);assert.ok(!resources.includes('restomanager-env.js'));
 for(const file of resources)assert.ok(fs.existsSync(file),'Missing offline dependency: '+file);
 for(const [file,expected] of Object.entries(manifest.runtime))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,file);
});
