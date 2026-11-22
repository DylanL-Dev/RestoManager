'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const crypto=require('node:crypto').webcrypto;
const M=require('../service-v3-publication-model.js');
const Demo=require('../reservation/model.js');
const Adapter=require('../reservation/demo.js');

const read=rel=>fs.readFileSync(path.resolve(__dirname,'..',rel),'utf8');
const validContact={firstName:'Camille',lastName:'Exemple',email:'',phone:'',notes:'',accepted:true};

test('RM-015.13: les URLs de démonstration ne transmettent aucun slug, token ou fragment privé',async()=>{
 const {restaurantSlug,demoURL}=await import(pathToFileURL(path.resolve(__dirname,'../reservation/tenant-links.mjs')).href);
 const sample='https://dev.example.test/reservation/live.html?restaurant=restaurant-ville#manage=secret-absolument-prive';
 assert.equal(restaurantSlug(sample),'restaurant-ville');
 assert.equal(demoURL(sample),'https://dev.example.test/reservation/index.html');
 assert.equal(restaurantSlug('https://dev.example.test/reservation/live.html?restaurant=restaurant-ville&restaurant=autre-ville'),null);
 for(const slug of ['','..%2Fadmin','A-Ville','x','a--b','a<script>','a'.repeat(81)]){
  assert.equal(restaurantSlug('https://dev.example.test/reservation/live.html?restaurant='+slug),null,slug);
 }
 assert.equal(demoURL('https://dev.example.test/app/reservation/live.html?restaurant=restaurant-b&token=private#manage=abc'),'https://dev.example.test/app/reservation/index.html');
});

test('RM-015.13: page de démonstration avec deux établissements fictifs sans redirection Mercure',()=>{
 const examples=Demo.examples();
 assert.equal(examples.length,2);
 assert.deepEqual(examples.map(x=>x.type),['independent','hotel']);
 assert.equal(new Set(examples.map(x=>x.slug)).size,2);
 assert.ok(examples.every(x=>x.slug.includes('demo')&&/fictif|démonstration/i.test(x.subtitle)));
 assert.ok(!examples.some(x=>/epicerie|mercure|rouen/i.test(x.name+' '+x.slug+' '+x.subtitle)));
 for(const e of examples)assert.equal(Demo.venue(e.slug).name,e.name);
 assert.equal(Demo.venue('restaurant-inconnu'),null);
 const html=read('reservation/index.html'),portal=read('reservation/portal.js'),live=read('reservation/live.html'),liveCode=read('reservation/live.mjs');
 for(const file of [html,portal,live,liveCode])assert.doesNotMatch(file,/\?restaurant=a-lepicerie-rouen/);
 assert.match(portal,/M\.examples\(\)/);
 assert.match(live,/id="demoLink"/);
 assert.match(liveCode,/demoURL\(location.href\)/);
});

test('RM-015.13: les réservations fictives de deux restaurants ne peuvent pas se lire entre elles',()=>{
 const values=new Map(),storage={
  setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)||null,removeItem:k=>values.delete(k)
 };
 const now=()=>Date.parse('2026-11-23T10:00:00Z');
 const a=Adapter.createAdapter({slug:'le-jardin-demo',storage,crypto,now});
 const b=Adapter.createAdapter({slug:'hotel-des-rives-demo',storage,crypto,now});
 const aRecord=a.create({party:2,date:'2026-11-26',service:'dinner',time:'18:30'},validContact);
 assert.equal(aRecord.slug,'le-jardin-demo');
 assert.throws(()=>b.read(aRecord.token),{code:'not_found'});
 const bRecord=b.create({party:2,date:'2026-11-26',service:'dinner',time:'19:00'},{...validContact,guestType:'hotel',hotelRoom:'204'});
 assert.equal(b.read(bRecord.token).contact.hotelRoom,'204');
 assert.equal(bRecord.slug,'hotel-des-rives-demo');
 assert.throws(()=>a.read(bRecord.token),{code:'not_found'});
 assert.equal(a.read(aRecord.token).reference,aRecord.reference);
 assert.equal(b.read(bRecord.token).reference,bRecord.reference);
 assert.equal([...values.keys()].filter(k=>k.startsWith('rm0151:demo:')).length,2);
});

test('RM-015.13: configuration indépendante et hôtel sans écraser les textes ni activer le portail',()=>{
 const independent=M.setupDraft({type:'independent',restaurantName:'Le Bistrot fictif'});
 assert.equal(independent.hotelGuestsEnabled,false);
 assert.doesNotMatch(independent.privacyNotice,/hôtel|chambre/i);
 assert.match(independent.privacyNotice,/\[À COMPLÉTER/);
 assert.ok(!Object.hasOwn(independent,'enabled')&&!Object.hasOwn(independent,'restaurantId'));
 const hotel=M.setupDraft({type:'hotel',hotelGuestsCapability:true,restaurantName:'Hôtel fictif'});
 assert.equal(hotel.hotelGuestsEnabled,true);
 assert.match(hotel.privacyNotice,/numéro de chambre/);
 assert.throws(()=>M.setupDraft({type:'hotel',hotelGuestsCapability:false}),/autorisé/);
 assert.throws(()=>M.setupDraft({type:'unknown',hotelGuestsCapability:true}),/inconnu/);
 const mine='Texte personnel du restaurateur non remplacé.';
 const saved=M.setupDraft({type:'independent',restaurantName:'Autre établissement',privacyNotice:mine,cancellationNotice:'Conditions personnalisées.',cancellationMinutes:90});
 assert.equal(saved.privacyNotice,mine);
 assert.equal(saved.cancellationNotice,'Conditions personnalisées.');
 const fake={enabled:false,slug:null,maxParty:null,pendingMinutes:60,horizonDays:60,leadMinutes:30,cancellationMinutes:0,privacyContact:'',privacyNotice:independent.privacyNotice,cancellationNotice:independent.cancellationNotice};
 assert.deepEqual(M.validate(fake),{}); // A proposed draft does not open the booking portal.
 assert.equal(M.validate({...fake,enabled:true,maxParty:4}).privacyNotice!==undefined,true);
});

test('RM-015.13: le guide Hôtel reste soumis à la capacité du restaurant et aux actions explicites',()=>{
 const ui=read('service-v3-public-booking.js');
 for(const text of ['function renderSetupGuide(form,c)','function applyTypeSetup(form,type)','model.setupDraft({type,hotelGuestsCapability:data.hotelGuestsCapability===true','hotel.disabled=data.hotelGuestsCapability!==true','if(c.slug){','renderSetupGuide(form,c);','form.elements.hotelGuestsEnabled','Rien n’a été enregistré'])assert.ok(ui.includes(text),text);
 assert.match(ui,/profile\.restaurant_id!==context\(\)\?\.restaurantId/);
 assert.match(ui,/value\.data\.restaurantId!==context\(\)\.restaurantId/);
 assert.match(ui,/owner!==identity\(\)/);
 assert.doesNotMatch(ui,/\.from\('public\.restaurants'\).*select\('\*'\)/);
});

test('RM-015.13: hotel demo requires guest status and fictional room, unlike independent restaurants',()=>{
 const hotel=Demo.venue('hotel-des-rives-demo'),independent=Demo.venue('le-jardin-demo');
 const now=new Date('2026-11-23T10:00:00Z');
 const visit={party:2,date:'2026-11-26',service:'dinner',time:'19:00'};
 const errors=contact=>Demo.validate(hotel,visit,{...validContact,...contact},now);
 assert.match(errors({}).guestType,/séjournez/);
 assert.match(errors({guestType:'hotel',hotelRoom:''}).hotelRoom,/chambre/);
 assert.match(errors({guestType:'hotel',hotelRoom:'<script>'}).hotelRoom,/chambre/);
 assert.match(errors({guestType:'hotel',hotelRoom:'a'.repeat(21)}).hotelRoom,/chambre/);
 assert.deepEqual(errors({guestType:'hotel',hotelRoom:'204'}),{});
 assert.deepEqual(errors({guestType:'external',hotelRoom:''}),{});
 assert.match(errors({guestType:'external',hotelRoom:'204'}).hotelRoom,/extérieur/);
 const independentVisit={party:2,date:'2026-11-26',service:'dinner',time:'20:00'};
 assert.deepEqual(Demo.validate(independent,independentVisit,{...validContact,guestType:'external',hotelRoom:''},now),{});
 assert.match(Demo.validate(independent,independentVisit,{...validContact,guestType:'hotel',hotelRoom:'204'},now).guestType,/hôtel/);
 const portal=read('reservation/portal.js'),css=read('reservation/portal.css'),html=read('reservation/index.html');
 for(const expected of ['function hotelChoice()', 'function roomFields()', 'function hotelRecap()', 'guestType', 'hotelRoom', 'blankContact()']) assert.ok(portal.includes(expected),expected);
 assert.match(css,/guest-choice.*choice-row/);
 assert.match(css,/site-footer>div.*flex-wrap:wrap/);
 assert.match(html,/portal\.js\?v=20261122-rm01513-hotel/);
});
