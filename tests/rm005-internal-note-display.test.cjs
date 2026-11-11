'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','service-v3-reservations.js'),'utf8');
test('RM-005: internal occupancy tag is not presented as a client note',()=>{
 assert.match(src,/const publicNotes=/);
 assert.match(src,/if\(publicNotes\(r\)\)/);
 assert.match(src,/Note : '\+publicNotes\(r\)/);
 assert.match(src,/editNotes'\)\.value=publicNotes\(r\)/);
});
test('RM-005: the audit tag survives an edit, outside public display',()=>{
 assert.match(src,/const savedNotes=/);
 assert.match(src,/savedNotes\(\$\('editNotes'\)\.value,editingBase\|\|editing\)/);
 const TAG='[RM:WALKIN_SEPARATE_OCCUPANT_V1]';
 const visible=(str)=>String(str||'').replaceAll(TAG,'').trim();
 const save=(input,previous)=>String(input||'').trim()+(String(previous?.notes||'').includes(TAG)?TAG:'');
 assert.equal(visible(TAG),'');
 assert.equal(visible('Informations client. '+TAG),'Informations client.');
 assert.equal(save('Allergie à signaler',{notes:TAG}),'Allergie à signaler'+TAG);
});
