'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const M=require('../service-v3-publication-model.js');

const venue=(slug,privacyNotice,hotelGuestsEnabled=false)=>({
 slug,enabled:true,maxParty:6,pendingMinutes:60,horizonDays:60,leadMinutes:30,cancellationMinutes:0,
 privacyContact:'Contact RGPD : privacy@example.test',privacyNotice,
 cancellationNotice:M.cancellationDefault(0),hotelGuestsEnabled
});

test('RM-015.12: le modèle d’un restaurant indépendant ne mentionne jamais un hôtel',()=>{
 for(const options of [undefined,{}, {hotelGuestsEnabled:false},{hotelGuestsEnabled:0}]){
  const text=M.privacyDefault('Le Bistrot fictif',options);
  assert.ok(text.startsWith('Le Bistrot fictif est responsable'));
  assert.doesNotMatch(text,/hôtel|chambre|séjour|Hôtel\/Extérieur/i);
  assert.match(text,/CNIL/);
  assert.match(text,/empreinte de l’adresse IP/);
  assert.ok(text.length<=3000);
 }
});

test('RM-015.12: seul le parcours hôtel activé produit le texte spécifique',()=>{
 const name='Restaurant hôtel fictif';
 const hotel=M.privacyDefault(name,{hotelGuestsEnabled:true});
 const independent=M.privacyDefault(name,{hotelGuestsEnabled:false});
 assert.match(hotel,/parcours Client de l’hôtel/);
 assert.match(hotel,/numéro de chambre/);
 assert.match(hotel,/peut être vérifiée/);
 assert.doesNotMatch(independent,/parcours Client de l’hôtel|numéro de chambre/);
 assert.notEqual(hotel,independent);
 assert.ok(hotel.length<=3000);
});

test('RM-015.12: aucune durée de conservation ou contact RGPD n’est inventé',()=>{
 for(const hotelGuestsEnabled of [true,false]){
  const draft=M.privacyDefault('Restaurant fictif',{hotelGuestsEnabled});
  assert.ok(M.hasDraftMarker(draft));
  assert.equal(M.retentionFrom(draft),'');
  assert.ok(M.validate(venue('restaurant-fictif',draft,hotelGuestsEnabled)).privacyNotice);
  const finished=M.withRetention(draft,'Durée propre à l’établissement, validée avant ouverture');
  assert.equal(M.retentionFrom(finished),'Durée propre à l’établissement, validée avant ouverture');
  assert.deepEqual(M.validate(venue('restaurant-fictif',finished,hotelGuestsEnabled)),{});
 }
});

test('RM-015.12: chaque établissement et ses modifications restent isolés',()=>{
 const neutral=M.privacyDefault('La Table indépendante');
 const hotel=M.privacyDefault('Restaurant Hôtel des Pins',{hotelGuestsEnabled:true});
 const custom='Notre restaurant applique ses propres conditions, rédigées et vérifiées par son responsable.';
 const independent=M.fromForm({
  slug:'table-independante',maxParty:'6',pendingMinutes:'60',horizonDays:'60',
  leadMinutes:'30',cancellationMinutes:'0',privacyContact:'table@example.test',
  privacyNotice:custom,cancellationNotice:'Annulation acceptée dans les conditions indiquées.'
 },false,2);
 const hotelSettings=M.fromForm({
  slug:'hotel-des-pins',maxParty:'8',pendingMinutes:'90',horizonDays:'30',
  leadMinutes:'60',cancellationMinutes:'60',privacyContact:'hotel@example.test',
  privacyNotice:M.withRetention(hotel,'Durée interne validée'),
  cancellationNotice:M.cancellationDefault(60),hotelGuestsEnabled:'on'
 },false,7);
 assert.equal(independent.privacyNotice,custom);
 assert.equal(independent.hotelGuestsEnabled,undefined);
 assert.equal(hotelSettings.hotelGuestsEnabled,true);
 assert.equal(hotelSettings.version,7);
 assert.notEqual(independent.privacyNotice,hotelSettings.privacyNotice);
 assert.doesNotMatch(neutral,/hôtel|chambre/i);
 assert.match(hotelSettings.privacyNotice,/chambre/);
 assert.deepEqual(M.validate(independent),{});
});

test('RM-015.12: le formulaire préserve les textes enregistrés et ne remplace que les modèles non modifiés',()=>{
 const source=fs.readFileSync(require.resolve('../service-v3-public-booking.js'),'utf8');
 assert.match(source,/t\.value=c\[key\]\|\|/);
 assert.match(source,/hotelGuestsEnabled:c\.hotelGuestsEnabled===true/);
 assert.match(source,/model\.privacyDefault\(establishmentName\(\),\{hotelGuestsEnabled:form\.elements\.hotelGuestsEnabled\?\.checked===true\}\)/);
 assert.match(source,/current===oldProposal\|\|current===model\.withRetention\(oldProposal,retention\)/);
 assert.match(source,/else status\.textContent='Le parcours client a changé/);
 assert.match(source,/model\.withRetention\(proposalFor\(form\),model\.retentionFrom/);
 assert.ok(!source.includes('c.privacyNotice=model.privacyDefault('),'Aucun écrasement en arrière-plan');
 assert.ok(!source.includes('À l’Épicerie — Rouen'),'Aucun exemple réservé à l’établissement historique dans Gestion');
 assert.ok(source.includes('Ex. Nom de votre restaurant'));
});
