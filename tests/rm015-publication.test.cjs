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

test('RM015 proposed privacy uses the current establishment without inventing contact or retention',()=>{
 const value=M.privacyDefault('Le Jardin fictif');assert.ok(value.startsWith('Le Jardin fictif'));assert.ok(M.hasDraftMarker(value));assert.ok(value.length<=3000);assert.ok(!/3 mois|90 jours|automatiquement supprim/i.test(value));assert.ok(M.privacyDefault().startsWith('L’établissement indiqué'));
});
test('RM015 an incomplete proposed policy can be prepared closed and blocks opening',()=>{
 const notice=M.privacyDefault('Restaurant fictif');assert.ok(M.validate({...good(),privacyNotice:notice}).privacyNotice);assert.deepEqual(M.validate({...good(),enabled:false,privacyNotice:notice}),{});
 const done=M.withRetention(notice,'90 jours après la venue, selon la politique fictive');assert.ok(!M.hasDraftMarker(done));assert.deepEqual(M.validate({...good(),privacyNotice:done}),{});
});
test('RM015 editing the retention line preserves every other policy paragraph',()=>{
 const text=M.privacyDefault('Restaurant fictif')+'\n\nParagraphe personnalisé à conserver.';const changed=M.withRetention(text,'  Durée fictive\nà vérifier  ');assert.equal(M.retentionFrom(changed),'Durée fictive à vérifier');assert.ok(changed.endsWith('Paragraphe personnalisé à conserver.'));assert.equal(M.withRetention('Texte personnalisé sans modèle','autre durée'),'Texte personnalisé sans modèle');assert.ok(M.hasDraftMarker(M.withRetention(changed,'')));
});
test('RM015 proposed cancellation text follows the actual configured cutoff',()=>{
 assert.match(M.cancellationDefault(0),/jusqu’à l’heure prévue/);assert.match(M.cancellationDefault(60),/1 heure avant/);assert.match(M.cancellationDefault(90),/90 minutes avant/);assert.match(M.cancellationDefault(120),/2 heures avant/);assert.ok(M.hasDraftMarker(M.cancellationDefault(NaN)));assert.ok(M.cancellationDefault(2880).length<=1500);assert.ok(!/frais|pénalité|paiement|automatiquement confirmée/i.test(M.cancellationDefault(0)));
});
test('RM015 template helper fields never enter the backend settings payload',()=>{
 const data=M.fromForm({...good(),_templateRetention:'Durée fictive'},true,4);assert.equal(Object.hasOwn(data,'_templateRetention'),false);assert.equal(data.version,4);
});

test('RM015 complete notices explain contract, optional data, anti-abuse, session recovery and private links',()=>{
 const text=M.privacyDefault('Restaurant fictif');for(const term of ['mesures précontractuelles','intérêt légitime','empreinte de l’adresse IP','session de l’onglet','ne contient pas vos coordonnées','Son expiration ne supprime pas','Google Maps','CNIL'])assert.ok(text.includes(term),term);assert.ok(M.privacyDefault('x'.repeat(180)).length<=3000);assert.ok(M.validate({...good(),privacyContact:'0000000'}).privacyContact);assert.deepEqual(M.validate({...good(),privacyContact:'Restaurant fictif\nEmail : privacy@example.test\nTéléphone : +33 2 00 00 00 00'}),{});
});
test('RM015 booking conditions distinguish a pending change from the preserved original reservation',()=>{
 const text=M.cancellationDefault(0);assert.match(text,/réservation initiale est conservée/);assert.match(text,/un repas au restaurant/);assert.match(text,/Aucun numéro de table précis/);assert.ok(text.length<=1500);
});
