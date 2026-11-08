'use strict';
const assert=require('node:assert/strict');
module.exports=async({ok,ctx,fails,test,user,lit})=>{
 const A="'10000000-0000-4000-8000-000000000001'";
 const B="'10000000-0000-4000-8000-000000000002'";
 const insert=(who,restaurant,role,title='Erreur dans le service')=>
  `insert into public.platform_reports (restaurant_id,submitted_by,submitted_role,kind,severity,title,description,screen)
   values (${restaurant},${lit(user(who))},${lit(role)},'bug','normal',${lit(title)},'Le bouton ne répond plus lorsque je clique.', 'reservations')`;
 const count="select count(*) from public.platform_reports";
 const number=async(who,query=count,role='authenticated')=>(await ok(ctx(who,query,role))).split('\n').at(-1);

 await test('BUG-01: active Restaurant and Reception can submit but cannot read messages',async()=>{
  await ok(ctx(1,insert(1,A,'fb_admin')));
  await ok(ctx(3,insert(3,A,'reception','Problème de réception')));
  await ok(ctx(4,insert(4,B,'fb_admin','Problème second restaurant')));
  for(const who of [1,3,4])assert.equal(await number(who),'0');
  await fails(1,insert(1,B,'fb_admin'),'42501'); // cannot spoof restaurant
  await fails(1,insert(3,A,'fb_admin'),'42501'); // cannot spoof employee
  await fails(3,insert(3,A,'fb_admin'),'42501'); // cannot spoof role
  await fails(5,insert(5,A,'reception'),'42501'); // inactive staff
  await fails(6,insert(6,A,'fb_admin'),'42501'); // admin isn't staff
  await fails(1,count,'42501','anon');
  assert.equal(await number(6),'0'); // owner has not been activated
 });
 await test('BUG-01: only active platform owner can read cross-establishment reports',async()=>{
  await ok(ctx(1,insert(1,A,'fb_admin')));
  await ok(ctx(4,insert(4,B,'fb_admin','Autre restaurant')));
  await ok(`insert into public.platform_admins(user_id,active) values(${lit(user(6))},true)`);
  assert.equal(await number(6),'2');
  assert.equal(await number(6,'select count(*) from public.restaurants'),'2');
  for(const who of [1,3,4])assert.equal(await number(who),'0');
  const record=await ok(ctx(6,"select title from public.platform_reports where title='Autre restaurant'"));
  assert.match(record,/Autre restaurant/);
  await ok(`update public.platform_admins set active=false where user_id=${lit(user(6))}`);
  assert.equal(await number(6),'0');
  assert.equal(await number(6,'select count(*) from public.restaurants'),'0');
 });
 await test('BUG-01: only owner may update status; immutable report data cannot be changed',async()=>{
  await ok(ctx(1,insert(1,A,'fb_admin')));
  await ok(`insert into public.platform_admins(user_id,active) values(${lit(user(6))},true)`);
  await ok(ctx(1,"update public.platform_reports set status='resolved'"));
  assert.equal((await ok(ctx(6,"select status from public.platform_reports limit 1"))).split('\n').at(-1),'new',
   'Staff UPDATE must affect zero rows under the owner-only SELECT/UPDATE policies');
  await fails(6,"update public.platform_reports set title='Falsifié'",'42501');
  await ok(ctx(6,"update public.platform_reports set status='reviewing' where status='new'"));
  assert.equal((await ok(ctx(6,"select status from public.platform_reports limit 1"))).split('\n').at(-1),'reviewing');
  assert.equal(await ok("select has_table_privilege('authenticated','public.platform_reports','delete')"),'f');
 });
};
