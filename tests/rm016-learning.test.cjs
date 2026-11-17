'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const m=require('../service-v3-tutorial-model.js'),training=require('../service-v3-tutorial-training.js');
test('RM-016 role and actual-release contracts hide every unauthorized/future guide',()=>{
 const reception=m.available('reception',{closeout:true,'online-booking':true}).map(g=>g.id);
 for(const id of ['seat','release','walkin','changes','management','closeout','online-booking'])assert.ok(!reception.includes(id),id);
 const restaurant=m.available('restaurant',{closeout:true,'online-booking':true}).map(g=>g.id);
 for(const id of ['seat','release','walkin','changes','management','closeout'])assert.ok(restaurant.includes(id),id);
 assert.ok(!restaurant.includes('online-booking'));assert.ok(!m.available('restaurant').some(g=>g.id==='closeout'));assert.deepEqual(m.available('creator'),[]);
});
test('RM-016 versioned registry has stable, unique targets and at least one action/concept per step',()=>{
 const ids=new Set();for(const g of m.guides){assert.ok(!ids.has(g.id));ids.add(g.id);assert.ok(Number.isInteger(g.version));if(g.released===false)continue;
 const steps=new Set();for(const s of g.steps){assert.ok(!steps.has(s.id));steps.add(s.id);assert.ok(s.title&&s.text&&s.result);assert.ok(Array.isArray(s.target)&&s.target.length);assert.ok(s.target.every(t=>typeof t==='string'&&t.length<180));assert.ok(!s.basics||m.basics[s.basics]);}
 assert.ok(m.stepsFor(g,'quick').length>0);assert.ok(m.stepsFor(g,'quick').length<=m.stepsFor(g,'beginner').length);
 }
});
test('RM-016 progress cannot leak between identities, venues, roles, levels or course versions',()=>{
 const a={userId:'a',restaurantId:'one',role:'restaurant'},key=m.scope(a);assert.ok(key);
 for(const changes of [{userId:'b'},{restaurantId:'two'},{role:'reception'}])assert.notEqual(key,m.scope({...a,...changes}));assert.equal(m.scope({...a,userId:''}),null);
 const course=m.guides[0];assert.notEqual(m.progressKey(course,'beginner'),m.progressKey(course,'quick'));assert.notEqual(m.progressKey(course,'beginner'),m.progressKey({...course,version:2},'beginner'));
 assert.deepEqual(m.readProgress(null,course,'beginner'),{index:0,complete:false,total:4});assert.equal(m.readProgress({index:999,complete:'true'},course,'beginner').complete,false);assert.equal(m.readProgress({index:-10},course,'beginner').index,0);
});
test('RM-016 human search handles accents and does not broaden role access',()=>{
 assert.ok(m.search(m.faq,'CONFIRME').length);assert.ok(m.search(m.faq,'créneau').length===0);assert.deepEqual(m.search(m.faq,'xyz-not-a-question'),[]);
 const questions=m.faq.filter(q=>q.roles.includes('reception'));assert.ok(!m.search(questions,'Faut-il confirmer avant').length);
});
test('RM-016 training generates an opaque sandbox document with no network/forms permission',()=>{
 const doc=training.documentFor({role:'reception',scenario:'booking',token:'test-token'});
 assert.match(doc,/default-src 'none'/);assert.match(doc,/form-action 'none'/);assert.match(doc,/base-uri 'none'/);
 assert.doesNotMatch(doc,/fetch\(|XMLHttpRequest|WebSocket|supabase|localStorage|<form|https?:\/\//);
 assert.ok(!training.documentFor({role:'<script>bad</script>',token:'<\/script>'}).includes('<script>bad'));
});
