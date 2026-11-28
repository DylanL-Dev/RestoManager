'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

const path=require('node:path');
const login=fs.readFileSync(path.resolve(__dirname,'../supabase-login.js'),'utf8').replace(/^import .*$/gm,'');
const reception='qa.reception@example.com';
const dashboard='v3-connected.html';

async function signIn({env='DEV',username=reception,role='reception',active=true,authError=false,profileError=false}={}){
 const elements=Object.fromEntries(['login','submit','message','username','password'].map(id=>[id,{}]));
 elements.username.value=username;
 elements.password.value='synthetic-local-test-value';
 let submit;
 elements.login.addEventListener=(event,listener)=>{assert.equal(event,'submit');submit=listener;};
 const result={email:null,redirect:null,signOuts:0,message:''};
 const client={
  auth:{
   getSession:async()=>({data:{session:null}}),
   signInWithPassword:async({email})=>{
    result.email=email;
    return authError?{error:new Error('Invalid credentials')}:{data:{user:{id:'test-user'},session:{}}};
   },
   signOut:async()=>{result.signOuts++;},
  },
  from(table){
   assert.equal(table,'staff_profiles');
   return {select:()=>({eq:(column,id)=>{
    assert.equal(column,'user_id');
    assert.equal(id,'test-user');
    return {single:async()=>profileError?{error:new Error('Profile unavailable')}:{data:{role,active}}};
   }})};
  },
 };
 vm.runInNewContext(login,{
  supabaseEnvironment:{name:env},
  createClient:()=>client,
  location:{hostname:'127.0.0.1'},
  document:{getElementById:id=>elements[id]},
  window:{location:{assign:url=>{result.redirect=url;}}},
  setTimeout,clearTimeout,
 });
 await submit({preventDefault(){}});
 result.message=elements.message.textContent;
 return result;
}
const rejected=/^Compte non autorisé/;
test('DEV accepts an active Reception profile by its own email',async()=>{
 assert.equal((await signIn()).redirect,dashboard);
});
test('DEV preserves active Restaurant email login',async()=>{
 assert.equal((await signIn({username:'qa.restaurant.a@example.com',role:'fb_admin'})).redirect,dashboard);
});
test('Current aliases still map to fixed identities and roles',async()=>{
 for(const env of ['DEV','PROD']){
  for(const [username,role] of [['reception','reception'],['admin-fb','fb_admin']]){
   const result=await signIn({env,username,role});
   assert.equal(result.email,username+'@accounts.restomanager.example.com');
   assert.equal(result.redirect,dashboard);
   const mismatch=await signIn({env,username,role:role==='reception'?'fb_admin':'reception'});
   assert.equal(mismatch.redirect,null);
   assert.equal(mismatch.signOuts,1);
  }
 }
});
test('Inactive, unknown-role and inaccessible profiles remain denied',async()=>{
 for(const options of [{active:false},{role:'owner'},{profileError:true}]){
  const result=await signIn(options);
  assert.equal(result.redirect,null);
  assert.equal(result.signOuts,1);
  assert.match(result.message,rejected);
 }
});
test('Password validation precedes profile checks and redirect',async()=>{
 const result=await signIn({authError:true});
 assert.equal(result.redirect,null);
 assert.equal(result.signOuts,0);
 assert.match(result.message,/^Connexion impossible/);
});
test('Full staff email remains disabled outside DEV',async()=>{
 for(const env of ['PROD','V3']){
  const result=await signIn({env});
  assert.equal(result.email,null);
  assert.equal(result.redirect,null);
  assert.match(result.message,/^Identifiant non reconnu/);
 }
});
