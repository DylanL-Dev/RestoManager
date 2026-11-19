'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const M=require('../service-v3-publication-model.js'),qr=require('../vendor/qrcode-generator-1.4.4.js'),decode=require('jsqr');
const base='https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html?private=ignored#manage=never-share';
const good=()=>({slug:'restaurant-a',enabled:true,maxParty:12,pendingMinutes:60,horizonDays:60,leadMinutes:30,cancellationMinutes:0,privacyContact:'privacy@example.test',privacyNotice:'Politique fictive de recette, sans donnée réelle et sans envoi.',cancellationNotice:'Annulation fictive avant la venue uniquement.'});
test('RM015 publication enforces the actual server ranges and opening requirements',()=>{
 assert.deepEqual(M.validate(good()),{});for(const [key,value]of Object.entries({slug:'ab',maxParty:51,pendingMinutes:181,horizonDays:0,leadMinutes:1441,cancellationMinutes:2881,privacyContact:'  ',privacyNotice:' '.repeat(30),cancellationNotice:'Court'}))assert.ok(M.validate({...good(),[key]:value})[key],key);
 assert.deepEqual(M.validate({...good(),enabled:false,slug:null,maxParty:null,privacyNotice:'',privacyContact:'',cancellationNotice:''}),{});
 assert.ok(M.validate({...good(),enabled:false,privacyContact:'x'.repeat(501)}).privacyContact);
});
test('RM015 draft preparation preserves values and does not invent legal text or silently open',()=>{
 const entries={...good(),maxParty:'',pendingMinutes:'75',horizonDays:'1',leadMinutes:'0',cancellationMinutes:'2880',slug:'  ',privacyNotice:'',privacyContact:'',cancellationNotice:''};const data=M.fromForm(entries,false,7);
 assert.equal(data.slug,null);assert.equal(data.maxParty,null);assert.equal(data.enabled,false);assert.equal(data.pendingMinutes,75);assert.equal(data.version,7);assert.equal(data.privacyNotice,'');assert.deepEqual(M.validate(data),{});
 assert.equal(M.readiness(data).filter(c=>c.ready).length,1);assert.ok(M.readiness(good()).every(c=>c.ready));
 assert.ok(M.validate(M.fromForm({...entries,leadMinutes:''},false,7)).leadMinutes);
});
test('RM015 public link is canonical, tenant-specific and never contains a management token',()=>{
 assert.equal(M.publicURL(base,'restaurant-a'),'https://restomanager-v3-supabase-integration.onrender.com/reservation/live.html?restaurant=restaurant-a');
 assert.equal(M.publicURL('https://example.test/app/v3-connected.html','restaurant-b'),'https://example.test/app/reservation/live.html?restaurant=restaurant-b');
 assert.notEqual(M.publicURL(base,'restaurant-a'),M.publicURL(base,'restaurant-b'));
 for(const slug of ['../../admin','x','A-test','resto--test','resto<script>','x'.repeat(81)])assert.throws(()=>M.publicURL(base,slug));
 for(const url of ['javascript:alert(1)','https://user:pass@example.test/app','http://foreign.example/'])assert.throws(()=>M.publicURL(url,'restaurant-a'));
});
test('RM015 QR generator refuses personal capabilities, dashboards and extra query parameters',()=>{
 const url=M.publicURL(base,'restaurant-a');for(const value of [url+'#manage='+'a'.repeat(64),url+'&token=private','https://example.test/v3-connected.html?restaurant=restaurant-a',url.replace('https:','http:')])assert.throws(()=>M.qrMatrix(value,qr));
 assert.throws(()=>M.qrMatrix(url,undefined));
});
test('RM015 real QR decoding recovers the exact canonical link for two restaurants',()=>{
 for(const slug of ['restaurant-a','restaurant-b']){
  const url=M.publicURL(base,slug),matrix=M.qrMatrix(url,qr),scale=8,side=(matrix.length+8)*scale,pixels=new Uint8ClampedArray(side*side*4).fill(255);
  matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=(((y+4)*scale+dy)*side+(x+4)*scale+dx)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}}));
  assert.equal(decode(pixels,side,side)?.data,url);
 }
});
test('RM015 vendored QR generator matches its pinned upstream checksum',()=>{
 assert.equal(createHash('sha256').update(fs.readFileSync(require.resolve('../vendor/qrcode-generator-1.4.4.js'))).digest('hex'),'18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780');
});
