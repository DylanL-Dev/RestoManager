'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('creator.html'),auth=read('creator-auth.js'),reset=read('creator-recovery.js'),recovery=read('creator-recovery.html');
function fixture({isRoot=false,signed=false,factors=[],aal='aal1',cache=new Map()}={}){
 const state={signed,isRoot,factors:[...factors],aal,installed:0,resetRecipient:null,resetRedirect:null,password:null,challenges:0,lastAuthEmail:null};
 const elements={};const handlers=new Map();
 for(const name of [...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1])){
  elements[name]={
   value:'',hidden:false,disabled:false,textContent:'',src:'',
   addEventListener(type,fn){handlers.set(name+':'+type,fn)},
   removeAttribute(attr){if(attr==='src')this.src='';}
  };
 }
 const client={
  auth:{
   async getUser(){return {data:{user:state.signed?{id:'user-1',email:'root-dev@example.test',email_confirmed_at:'2026-11-23T08:00:00Z',is_anonymous:false}:null},error:null};},
   async signInWithPassword({email,password}){if(!email||!password)return {error:new Error('invalid credentials')};state.lastAuthEmail=email;state.signed=true;return{error:null}},
   async signOut(){state.signed=false;state.aal='aal1';return{error:null}},
   async resetPasswordForEmail(email,{redirectTo}){state.resetRecipient=email;state.resetRedirect=redirectTo;return{error:null}},
   mfa:{
    async getAuthenticatorAssuranceLevel(){return{data:{currentLevel:state.aal,nextLevel:state.factors.length?'aal2':'aal1'},error:null}},
    async listFactors(){return{data:{totp:state.factors},error:null}},
    async enroll(){state.factors.push({id:'factor-2',status:'unverified'});return{data:{id:'factor-2',totp:{secret:'DUMMY_TEST_SECRET',qr_code:'data:image/svg+xml;base64,PHN2Zy8+'}},error:null}},
    async challenge({factorId}){assert.ok(factorId);state.challenges++;return{data:{id:'challenge-1'},error:null}},
    async verify({factorId,challengeId,code}){
     assert.ok(factorId&&challengeId);if(code!=='123456')return{error:new Error('invalid code')};
     state.aal='aal2';state.factors=state.factors.map(x=>({...x,status:'verified'}));return{error:null};
    }
   }
  },
  from(name){
   assert.equal(name,'platform_admins');
   const q={select(){return q},eq(){return q},async maybeSingle(){return{data:state.isRoot?{user_id:'user-1',role:'platform_admin',active:true}:null,error:null}}};
   return q;
  }
 };
 const api={
  document:{getElementById(id){const found=elements[id];if(!found)throw Error('Missing '+id);return found;}},
  createClient(){return client},
  supabaseEnvironment:{name:'DEV',url:'https://mock.invalid',publishableKey:'mock'},
  installOwnerInbox(){},
  installCreatorConsole(){state.installed++},
  localStorage:{getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,String(value))},
  setTimeout,clearTimeout,
  URL,location:{href:'https://restomanager-v3-supabase-integration.onrender.com/creator.html'}
 };
 const safeSource=auth.replace(/^import .*;$/gm,'');
 vm.runInNewContext(safeSource,api,{filename:'creator-auth.js'});
 return{state,cache,el:elements,async emit(id,type='click',e={preventDefault(){}}){
  const handler=handlers.get(id+':'+type);assert.equal(typeof handler,'function',id+':'+type);
  return handler(e);
 }};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('RM-017.3.3 only DEV and no hardcoded credential or privilege grant',()=>{
 assert.match(auth,/supabaseEnvironment\.name!=='DEV'/);
 assert.match(auth,/signInWithPassword\(\{email,password\}\)/);
 assert.match(auth,/from\('platform_admins'\)/);
 assert.match(auth,/data\.role!=='platform_admin'/);
 assert.match(auth,/!data\.active/);
 assert.match(auth,/getAuthenticatorAssuranceLevel/);
 assert.match(auth,/@supabase\/supabase-js@2\.119\.2\/\+esm/);
 assert.match(auth,/clearTimeout\(watchdog\)/);
 assert.match(auth,/La vérification prend trop de temps/);
 assert.match(auth,/aal\.currentLevel==='aal2'/);
 assert.match(auth,/mfa\.enroll/);
 assert.match(auth,/mfa\.challenge/);
 assert.match(auth,/mfa\.verify/);
 assert.match(auth,/resetPasswordForEmail/);
 assert.doesNotMatch(auth,/ROOT_AUTH_EMAIL|accounts\.restomanager\.example\.com|auth\.signUp|auth\.admin|service_role|\.insert\(|\.update\(|\.upsert\(/);
 assert.doesNotMatch(auth,/value=['"][^'"]+@/);
 assert.match(html,/id="ownerUsername" type="text"/);
 assert.match(html,/placeholder="rootdev"/);
 assert.match(html,/id="creatorMfaStep"/);
 assert.match(html,/id="creatorMfaEnroll"/);
 assert.match(html,/id="creatorRecoverRequest"/);
 assert.match(recovery,/id="creatorPasswordRecovery"/);
 assert.match(reset,/auth\.updateUser\(\{password:p\}\)/);
 assert.match(reset,/hasLinkProof/);
 assert.match(reset,/hasAuthCode/);
 assert.match(reset,/hasImplicitTokens/);
 assert.match(reset,/event==='PASSWORD_RECOVERY'/);
 assert.match(reset,/getUser\(\)/);
 assert.doesNotMatch(reset,/signUp\(|auth\.admin|service_role|\.rpc\(|\.insert\(|\.upsert\(/);
});
test('RM-017.3.3 a valid password without Root membership never opens console',async()=>{
 const f=fixture();
 await tick();
 f.el.ownerUsername.value='not-admin@example.test';f.el.ownerPassword.value='a-fake-password';
 await f.emit('creatorLogin','submit');
 assert.equal(f.el.ownerPanel.hidden,true);
 assert.equal(f.el.creatorLogin.hidden,false);
 assert.match(f.el.message.textContent,/Connexion impossible/);
 assert.equal(f.state.installed,0);
 assert.equal(f.state.signed,false);
});
test('RM-017.3.3 an authorized Root remains blocked before verified MFA',async()=>{
 const f=fixture({isRoot:true,factors:[{id:'factor-1',status:'verified'}]});
 await tick();
 f.el.ownerUsername.value='root-dev@example.test';f.el.ownerPassword.value='a-fake-password';
 await f.emit('creatorLogin','submit');
 assert.equal(f.el.ownerPanel.hidden,true);
 assert.equal(f.el.creatorMfaStep.hidden,false);
 assert.equal(f.state.installed,0);
 f.el.ownerMfaCode.value='123456';
 await f.emit('creatorMfaForm','submit');
 assert.equal(f.el.ownerPanel.hidden,false);
 assert.equal(f.state.installed,1);
 assert.equal(f.state.aal,'aal2');
 assert.equal(f.state.challenges,1);
 await f.emit('ownerLogout');
 assert.equal(f.state.signed,false);
 assert.equal(f.el.ownerPanel.hidden,true);
});
test('RM-017.3.3 Root with no factor must enroll TOTP before console',async()=>{
 const f=fixture({isRoot:true});
 await tick();
 f.el.ownerUsername.value='root-dev@example.test';f.el.ownerPassword.value='test-password';
 await f.emit('creatorLogin','submit');
 assert.equal(f.el.creatorMfaEnroll.hidden,false);
 assert.equal(f.state.installed,0);
 await f.emit('ownerStartEnroll');
 assert.equal(f.el.ownerEnrollInstructions.hidden,false);
 assert.equal(f.el.ownerTotpSecret.textContent,'DUMMY_TEST_SECRET');
 f.el.ownerEnrollCode.value='123456';
 await f.emit('creatorMfaEnrollForm','submit');
 assert.equal(f.el.ownerPanel.hidden,false);
 assert.equal(f.state.aal,'aal2');
});
test('RM-017.3.3 password recovery selects an explicit DEV redirect and never touches prod',async()=>{
 const f=fixture();
 await tick();
 f.el.ownerUsername.value='root-dev@example.test';
 await f.emit('ownerForgotPassword');
 assert.equal(f.el.creatorRecoverRequest.hidden,false);
 f.el.ownerRecoverEmail.value='root-dev@example.test';
 await f.emit('creatorRecoverRequest','submit');
 assert.equal(f.state.resetRecipient,'root-dev@example.test');
 assert.equal(f.state.resetRedirect,'https://restomanager-v3-supabase-integration.onrender.com/creator-recovery.html');
 assert.equal(f.state.installed,0);
 assert.match(f.el.ownerAuthFeedback.textContent,/Si cette adresse dispose/);
});
test('RM-017.3.6 rootdev alias remains device-local and only remembers email after verified MFA',async()=>{
 const cache=new Map();
 const initial=fixture({isRoot:true,factors:[{id:'factor-1',status:'verified'}],cache});
 await tick();
 initial.el.ownerUsername.value='rootdev';
 initial.el.ownerPassword.value='fake-first-password';
 await initial.emit('creatorLogin','submit');
 assert.equal(initial.state.installed,0);
 assert.equal(initial.el.ownerPanel.hidden,true);
 assert.match(initial.el.message.textContent,/Première connexion/);
 assert.equal(cache.size,0);

 const setup=fixture({isRoot:true,factors:[{id:'factor-1',status:'verified'}],cache});
 await tick();
 setup.el.ownerUsername.value='root-dev@example.test';
 setup.el.ownerPassword.value='fake-login-password';
 await setup.emit('creatorLogin','submit');
 assert.equal(cache.size,0,'No email may be saved before MFA');
 setup.el.ownerMfaCode.value='123456';
 await setup.emit('creatorMfaForm','submit');
 assert.equal(setup.state.installed,1);
 assert.equal(cache.get('rm:rootdev:authorized-email-v1'),'root-dev@example.test');
 assert.equal([...cache.values()].some(x=>x.includes('password')),false);
 await setup.emit('ownerLogout');

 const later=fixture({isRoot:true,factors:[{id:'factor-1',status:'verified'}],cache});
 await tick();
 later.el.ownerUsername.value='rootdev';
 later.el.ownerPassword.value='not-stored-password';
 await later.emit('creatorLogin','submit');
 assert.equal(later.state.lastAuthEmail,'root-dev@example.test');
 assert.equal(later.el.creatorMfaStep.hidden,false);
 later.el.ownerMfaCode.value='123456';
 await later.emit('creatorMfaForm','submit');
 assert.equal(later.el.ownerPanel.hidden,false);
});
test('RM-017.3.6 reject MAIN-only root alias on DEV, even when the device remembers DEV email',async()=>{
 const cache=new Map([['rm:rootdev:authorized-email-v1','root-dev@example.test']]);
 const f=fixture({isRoot:true,factors:[{id:'factor-1',status:'verified'}],cache});
 await tick();
 f.el.ownerUsername.value='root';
 f.el.ownerPassword.value='fake-existing-password';
 await f.emit('creatorLogin','submit');
 assert.equal(f.state.lastAuthEmail,null,'MAIN alias must not be sent to Supabase DEV');
 assert.equal(f.el.ownerPanel.hidden,true);
 assert.equal(f.state.installed,0);
 assert.match(f.el.message.textContent,/root est réservé à MAIN/);
 assert.equal(cache.get('rm:rootdev:authorized-email-v1'),'root-dev@example.test');
});
test('RM-017.3.3 responsive style hooks and no saved password',()=>{
 const css=read('creator-console.css');
 assert.match(css,/\.rootDevNotice/);assert.match(css,/\.ownerTotpSecret/);assert.match(css,/@media\(max-width:560px\)/);
 assert.match(auth,/localStorage\.setItem\(aliasKey,email\)/);
 assert.doesNotMatch(auth+reset,/localStorage\.setItem\([^\n]*(?:password|token|secret)|sessionStorage\.setItem|indexedDB\.open/);
});
