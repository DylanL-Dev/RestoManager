const test=require('node:test'),assert=require('node:assert/strict');
const errors=require('../resto-errors.js');
test('known categories and explicit business errors stay understandable',()=>{
 assert.match(errors.message({code:'23P01',details:'ROOM_CONFLICT',message:'secret'}),/chambre/);
 assert.equal(errors.message(errors.business('Indiquez le numéro de chambre.')),'Indiquez le numéro de chambre.');
 assert.match(errors.message({code:'PGRST202'}),/responsable/);
});
test('unknown server messages and personal payloads are never exposed in UI or diagnostics',()=>{
 const error={code:'XX000',message:'guest PRIVATE room 401',details:'notes PRIVATE'};
 assert.equal(errors.message(error,'Réessayez.'),'Réessayez.');
 const previous=console.warn,logs=[];console.warn=(...args)=>logs.push(args.join(' '));
 try{errors.diagnostic('booking-confirm',error)}finally{console.warn=previous}
 assert.equal(logs.length,1);assert.doesNotMatch(logs[0],/PRIVATE|401|notes|guest/);
});
