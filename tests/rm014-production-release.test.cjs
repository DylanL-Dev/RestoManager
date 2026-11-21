'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync('docs/releases/RM01510_RELEASE_MANIFEST_20261121.json'));
test('RM-015.10 production: reviewed connection files and dependency lock stay immutable',()=>{
 for(const [file,expected] of Object.entries(manifest.protected_production_files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,file);
 const environment=fs.readFileSync('restomanager-env.js','utf8');
 assert.match(environment,/location\.origin!=="https:\/\/dylanl-dev\.github\.io"/);
 assert.match(environment,/https:\/\/tnsrkargogckgtsxipwd\.supabase\.co/);
 assert.match(environment,/sb_publishable_/);
 assert.doesNotMatch(environment,/lykoybacslvmhtzftqsf|sb_secret_|service_role/i);
 assert.equal(JSON.parse(fs.readFileSync('package.json')).devDependencies['@supabase/supabase-js'],'2.57.0');
});
test('RM-015.10 production: closed portal, version and all offline dependencies agree',()=>{
 const release=JSON.parse(fs.readFileSync('app-release.json')),html=fs.readFileSync('v3-connected.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.equal(release.channel,'main');assert.equal(release.currentVersion,manifest.version);
 assert.ok(html.includes('name="restomanager-channel" content="main"'));assert.ok(html.includes('name="restomanager-version" content="'+release.currentVersion+'"'));
 assert.equal(release.releases.some(r=>r.version==='2026.11.16-rm014'),false,'DEV-only release must not be invented in production history');
 const resources=JSON.parse(sw.match(/const SHELL=(\[.*?\])\.map/)[1]);assert.ok(resources.includes('restomanager-env.js'),'PROD environment must be cached for staff PWA');
 for(const file of resources)assert.ok(fs.existsSync(file),'Missing offline dependency: '+file);
 const portal=JSON.parse(fs.readFileSync('reservation/runtime.json','utf8'));
 assert.equal(portal.schema,1);assert.equal(portal.channel,'production');
 assert.equal(portal.projectRef,'tnsrkargogckgtsxipwd');
 assert.equal(portal.activated,false);assert.equal(portal.api,null);assert.equal(portal.allowedApiOrigin,null);
 assert.equal(portal.publicOrigin,'https://dylanl-dev.github.io');
 assert.match(html,/name="restomanager-public-portal" content="closed"/);
 for(const [file,expected] of Object.entries(manifest.runtime))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,file);
});
