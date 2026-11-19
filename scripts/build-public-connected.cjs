'use strict';
// Explicit allowlist: neither employee dashboards nor backend source/secrets.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist/public-connected');
const assets=['index.html','model.js','demo.js','portal.js','portal.css','dining.svg','live.html','live.mjs','client.mjs','dates.mjs','runtime.json'];
const runtime=JSON.parse(fs.readFileSync(path.join(root,'reservation/runtime.json'),'utf8'));
const mode=require('./public-connected-config.cjs').validateRuntime(runtime);
if(mode==='dev'){
 const html=fs.readFileSync(path.join(root,'reservation/live.html'),'utf8');
 if(!html.includes("connect-src 'self' "+runtime.allowedApiOrigin+';'))throw Error('DEV CSP must match the approved backend');
}
fs.rmSync(out,{force:true,recursive:true});fs.mkdirSync(path.join(out,'reservation'),{recursive:true});
for(const file of assets)fs.copyFileSync(path.join(root,'reservation',file),path.join(out,'reservation',file));
for(const file of ['lucide-local.js','pwa-icon.svg'])fs.copyFileSync(path.join(root,file),path.join(out,file));
console.log('Public connected DEV artifact: 13 static assets, API '+mode+', emails off.');
