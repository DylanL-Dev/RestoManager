'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'creator-recovery.js'),'utf8');
const html=fs.readFileSync(path.join(root,'creator-recovery.html'),'utf8');
const sourceToRun=source.replace(/^import .*;\r?$/gm,'');
const origin='https://restomanager-v3-supabase-integration.onrender.com/creator-recovery.html';
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function fixture({
 url=origin,
 session=true,
 root=true,
 confirmed=true,
 authError=false,
 otpError=false
}={}){
 const u=new URL(url),handlers=new Map(),elements={},state={
  session,root,confirmed,authError,otpError,scheduled:[],
  userReads:0,sessionReads:0,otpCalls:0,rootReads:0,updated:0,
  cleaned:false,lastPassword:null,callback:null,signedOut:false
 };
 for(const id of [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])){
  elements[id]={value:'',hidden:id==='creatorPasswordRecovery',disabled:false,textContent:'',
   addEventListener(type,fn){handlers.set(id+':'+type,fn)}};
 }
 const user=confirmed?{id:'test-user',email_confirmed_at:'2026-11-23T08:00:00Z',is_anonymous:false}:{id:'test-user',email_confirmed_at:null,is_anonymous:false};
 const client={
  auth:{
   async getSession(){state.sessionReads++;return {data:{session:state.session?{user}:null},error:state.authError?new Error('invalid'):null}},
   async getUser(){state.userReads++;return{data:{user:state.session?user:null},error:state.authError?new Error('invalid'):null}},
   onAuthStateChange(callback){state.callback=callback;return{data:{subscription:{unsubscribe(){}}}}},
   async verifyOtp({type,token_hash}){state.otpCalls++;assert.ok(['recovery','invite'].includes(type));assert.ok(token_hash);return{data:{session:(!state.otpError&&state.session)?{user}:null},error:state.otpError?new Error('invalid'):null}},
   async updateUser({password}){state.updated++;state.lastPassword=password;return{error:null}},
   async signOut(){state.signedOut=true;return{error:null}}
  },
  from(table){
   assert.equal(table,'platform_admins');
   const q={select(){return q},eq(){return q},async maybeSingle(){
    state.rootReads++;
    return{data:state.root?{user_id:'test-user',role:'platform_admin',active:true}:null,error:null};
   }};
   return q;
  }
 };
 const context={
  document:{getElementById(id){assert.ok(elements[id],id);return elements[id]}},
  location:{pathname:u.pathname,search:u.search,hash:u.hash},
  history:{replaceState(){state.cleaned=true}},
  URLSearchParams,URL,
  setTimeout(fn){state.scheduled.push(fn);return state.scheduled.length},
  supabaseEnvironment:{name:'DEV',url:'https://fake.supabase.co',publishableKey:'fake'},
  createClient(url,key,options){state.storageKey=options.auth.storageKey;return client}
 };
 vm.runInNewContext(sourceToRun,context,{filename:'creator-recovery.js',timeout:2000});
 return{
  state,elements,
  async emit(id,type='submit'){
   const fn=handlers.get(id+':'+type);assert.equal(typeof fn,'function',id+':'+type);
   await fn({preventDefault(){}});
  },
  async afterLoad(){await settle();await settle();await settle();},
  async authEvent(type){
   assert.equal(typeof state.callback,'function');
   const prior=state.userReads;
   state.callback(type,state.session?{user}:null);
   assert.equal(state.userReads,prior,'onAuthStateChange must defer Supabase Auth calls');
   for(const task of state.scheduled.splice(0))task();
   await settle();await settle();await settle();
  }
 };
}
test('RM-017.3.5 PKCE callback with ?code= handles a verified active Root',async()=>{
 const f=fixture({url:origin+'?code=dummy-opaque-auth-code'});
 await f.afterLoad();
 assert.equal(f.elements.creatorPasswordRecovery.hidden,false);
 assert.match(f.elements.creatorRecoveryMessage.textContent,/Lien vérifié/);
 assert.equal(f.state.cleaned,true);
 assert.ok(f.state.rootReads>=1);
});
test('RM-017.3.5 implicit recovery fragment works and URL credentials are removed',async()=>{
 const f=fixture({url:origin+'#access_token=fake-token&refresh_token=fake-refresh&type=recovery'});
 await f.afterLoad();
 assert.equal(f.elements.creatorPasswordRecovery.hidden,false);
 assert.equal(f.state.cleaned,true);
});
test('RM-017.3.5 token hash recovery is verified by Supabase before form is enabled',async()=>{
 const f=fixture({url:origin+'?token_hash=dummy-protected-hash&type=recovery'});
 await f.afterLoad();
 assert.equal(f.state.otpCalls,1);
 assert.equal(f.elements.creatorPasswordRecovery.hidden,false);
 const expired=fixture({url:origin+'?token_hash=expired&type=recovery',otpError:true});
 await expired.afterLoad();
 assert.equal(expired.elements.creatorPasswordRecovery.hidden,true);
 assert.match(expired.elements.creatorRecoveryMessage.textContent,/expiré/);
});
test('RM-017.3.5 invite link with access token and marker can set first password',async()=>{
 const f=fixture({url:origin+'?invitation=1#access_token=valid&refresh_token=valid&type=invite'});
 await f.afterLoad();
 assert.equal(f.elements.creatorPasswordRecovery.hidden,false);
});
test('RM-017.3.5 cached session without proof must never open the password form',async()=>{
 for(const url of [origin,origin+'?type=recovery',origin+'?invitation=1',origin+'#error=access_denied&error_code=otp_expired']){
  const f=fixture({url});
  await f.afterLoad();
  assert.equal(f.elements.creatorPasswordRecovery.hidden,true,url);
  assert.equal(f.state.updated,0);
  assert.match(f.elements.creatorRecoveryMessage.textContent,/expiré|invalide/);
 }
});
test('RM-017.3.5 non-root and unconfirmed identities never pass the server role check',async()=>{
 for(const overrides of [{root:false},{confirmed:false},{authError:true}]){
  const f=fixture({url:origin+'?code=opaque',...overrides});
  await f.afterLoad();
  assert.equal(f.elements.creatorPasswordRecovery.hidden,true);
  assert.equal(f.state.cleaned,false);
 }
});
test('RM-017.3.5 PASSWORD_RECOVERY callback is deferred to avoid Supabase deadlock',async()=>{
 const f=fixture({url:origin});
 await f.afterLoad();
 assert.equal(f.elements.creatorPasswordRecovery.hidden,true);
 await f.authEvent('PASSWORD_RECOVERY');
 assert.equal(f.elements.creatorPasswordRecovery.hidden,false);
});
test('RM-017.3.5 cannot change password after Root role is revoked on submission',async()=>{
 const f=fixture({url:origin+'?code=opaque'});
 await f.afterLoad();
 assert.equal(f.elements.creatorPasswordRecovery.hidden,false);
 // Simulate a role revocation after initial link acceptance.
 f.state.root=false;
 f.elements.creatorNewPassword.value='a-new-verified-password-2026';
 f.elements.creatorConfirmPassword.value='a-new-verified-password-2026';
 await f.emit('creatorPasswordRecovery');
 assert.equal(f.state.updated,0);
 assert.equal(f.elements.creatorPasswordRecovery.hidden,false);
 assert.match(f.elements.creatorRecoveryMessage.textContent,/pas pu être enregistré/);
});
test('RM-017.3.5 successfully updates only password and signs out',async()=>{
 const f=fixture({url:origin+'#access_token=token&refresh_token=refresh&type=recovery'});
 await f.afterLoad();
 f.elements.creatorNewPassword.value='a-good-new-password-2026';
 f.elements.creatorConfirmPassword.value='a-good-new-password-2026';
 await f.emit('creatorPasswordRecovery');
 assert.equal(f.state.updated,1);
 assert.equal(f.state.lastPassword,'a-good-new-password-2026');
 assert.equal(f.state.signedOut,true);
 assert.equal(f.elements.creatorPasswordRecovery.hidden,true);
 assert.match(f.elements.creatorRecoveryMessage.textContent,/Mot de passe DEV enregistré/);
});
test('RM-017.3.5 no password form for normal Root login, no secret logging or default access',()=>{
 assert.match(source,/hasLinkProof/);
 assert.match(source,/event==='PASSWORD_RECOVERY'/);
 assert.match(source,/setTimeout\(\(\)=>\{void acceptSession/);
 assert.match(source,/\.eq\('user_id',user\.id\)/);
 assert.match(source,/root\.role!=='platform_admin'/);
 assert.match(source,/root\.active/);
 assert.doesNotMatch(source,/\bconsole\.log|window\.alert|localStorage\.setItem|service_role|auth\.signUp/);
 assert.match(html,/creator-recovery\.js\?v=20261123-rm01735/);
});
test('RM-AUTH-01 recovery uses the Root-only storage key and the same SDK version',async()=>{
 const f=fixture({url:origin+'?code=opaque'});await f.afterLoad();
 assert.equal(f.state.storageKey,'restomanager-dev-creator-auth-v1');
 assert.match(source,/@supabase\/supabase-js@2\.119\.2\/\+esm/);
 assert.match(fs.readFileSync(path.join(root,'creator-auth.js'),'utf8'),/storageKey:'restomanager-dev-creator-auth-v1'/);
});
