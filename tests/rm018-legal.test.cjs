'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),get=p=>fs.readFileSync(path.join(root,p),'utf8');
const docs=['legal.html','mentions-legales.html','cgu.html','cgv.html','confidentialite.html','cookies.html','dpa.html'];
test('RM-018 legal pages are independent public draft resources, with one shared local CSS and no JavaScript',()=>{
 const css=get('legal.css');
 assert.match(css,/@media\(max-width:780px\)/);
 assert.match(css,/@media print/);
 assert.doesNotMatch(css,/@import|url\(https?:|googleapis|fonts\.gstatic/i);
 for(const filename of docs){
  const html=get(filename);
  assert.match(html,/<html lang="fr">/);
  assert.match(html,/name="viewport"/);
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.match(html,/Brouillon de travail — non contractuel/);
  assert.match(html,/legal\.css\?v=20261123-rm018/);
  assert.match(html,/<main id="legalContent"/);
  assert.match(html,/aria-label="Documents juridiques"/);
  assert.match(html,/href="confidentialite\.html"/);
  assert.match(html,/href="cookies\.html"/);
  assert.doesNotMatch(html,/<script\b|<iframe\b|tracking|googletagmanager|gtag\(/i,filename);
  for(const href of html.matchAll(/\bhref="([^"]+)"/g)){
   const target=href[1];
   if(/^(https?:|#)/.test(target))continue;
   assert.equal(fs.existsSync(path.join(root,target.split('?')[0])),true,`${filename} points to missing ${target}`);
  }
 }
});
test('RM-018 legal roles, legal identity, limitations and missing commercial terms are explicit',()=>{
 const mentions=get('mentions-legales.html'),privacy=get('confidentialite.html'),
  cgv=get('cgv.html'),cgu=get('cgu.html'),cookies=get('cookies.html'),dpa=get('dpa.html');
 for(const id of ['853 148 161','853 148 161 00039','Entrepreneur individuel','Saint-Aubin-lès-Elbeuf'])
  assert.ok(mentions.includes(id),id);
 assert.match(mentions,/Téléphone professionnel/);
 assert.match(mentions,/À compléter avant publication/);
 assert.match(mentions,/hébergeur concerné/);
 assert.match(cgu,/restaurant/);
 assert.match(cgu,/allergies ou informations de santé/);
 assert.match(cgv,/À définir/);
 assert.match(cgv,/aucune vente|Aucune vente/i);
 assert.match(cgv,/indemnité forfaitaire/);
 assert.match(privacy,/responsable du traitement/);
 assert.match(privacy,/sous-traitant technique/);
 assert.match(privacy,/potentiellement sensibles/);
 assert.match(privacy,/Durées de conservation/);
 assert.match(dpa,/article 28/);
 assert.match(dpa,/projet non signé/i);
 assert.match(cookies,/localStorage/);
 assert.match(cookies,/Turnstile/);
 assert.match(cookies,/aucun choix factice/i);
 assert.match(cookies,/l’intégralité de RestoManager/);
});
test('RM-018 legal links are integrated without authentication, payment or forced cookie banners',()=>{
 for(const page of ['inscription.html','login.html','creator.html']){
  const source=get(page);
  assert.match(source,/href="legal\.html"|href="mentions-legales\.html"/,page);
  assert.match(source,/href="confidentialite\.html"/,page);
  assert.match(source,/href="cookies\.html"/,page);
 }
 assert.match(get('v3-connected.html'),/class="sidebarLegalLink" href="legal\.html"/);
 assert.match(get('reservation/index.html'),/href="\.\.\/confidentialite\.html"/);
 assert.match(get('reservation/index.html'),/href="\.\.\/cookies\.html"/);
 assert.doesNotMatch(get('inscription.html'),/acceptAllCookies|mandatoryLegalAcceptance/i);
 assert.doesNotMatch(get('legal.html'),/cookieConsentModal|function acceptAll/i);
});
