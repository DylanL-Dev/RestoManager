'use strict';
/* RM-017.2.1: mock-only browser exercise. Never contacts any external network. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),mimes={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{
 let url;try{url=new URL(req.url,'http://localhost')}catch{res.writeHead(400);res.end();return}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 fs.readFile(file,(err,buf)=>{
  if(err){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':mimes[path.extname(file)]||'application/octet-stream'});res.end(buf);
 });
});
const fakeTurnstile="window.turnstile={render:function(el,options){window.__captchaOptions=options;window.setTimeout(function(){options.callback('mock-turnstile-token')},15);return 42;},reset:function(id){window.__captchaResets=(window.__captchaResets||0)+1;}};";
const fakeSupabase="export function createClient(url,key,options){window.__clientOrigin=url;return {auth:{signUp:async function(payload){window.__signupPayload=payload;return {data:{session:null},error:null};},signOut:async function(){window.__signedOut=true;return {error:null};},getUser:async function(){return {data:{user:window.__mockVerifiedUser||null},error:null};}},rpc:async function(name,payload){window.__rpcCalled={name,payload};return {data:{restaurant_id:'50000000-0000-4000-8000-000000000123',status:'configuration_required'},error:null};}};}";
async function setup(browser,{active=true,verified=false,verifiedType='hotel',width=390}={}){
 const ctx=await browser.newContext({viewport:{width,height:900},locale:'fr-FR',serviceWorkers:'block'});
 const page=await ctx.newPage(),origin='http://127.0.0.1:'+server.address().port;
 const pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 await page.addInitScript(({verified,verifiedType})=>{
  if(verified)window.__mockVerifiedUser={
   email:'pilot@example.test',email_confirmed_at:'2026-11-22T16:00:00Z',
   user_metadata:{rm017_name:'Restaurant pilote',rm017_city:'Rouen',rm017_type:verifiedType,rm017_siret:'13002526500013'}
  };
 },{verified,verifiedType});
 const unexpected=[];
 await page.route('**/*',route=>{
  const url=route.request().url();
  if(url===origin+'/rm017-runtime.json'){
   return route.fulfill({contentType:'application/json',body:JSON.stringify({
    schema:2,channel:'dev',enabled:active,pilotOnly:true,captchaRequired:true,
    confirmationEmailRequired:true,redirectOrigin:origin,turnstileSiteKey:'0x4AAAAAAGLm9RaVvyWg-GtY'
   })});
  }
  if(url==='https://lykoybacslvmhtzftqsf.supabase.co/functions/v1/rm017-siret'){
   const requested=route.request().postDataJSON();
   return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({verified:true,siret:requested.siret,siren:requested.siret.slice(0,9),legalName:'RESTAURANT PILOTE OFFICIEL',city:'Rouen'})});
  }
  if(url.startsWith('https://challenges.cloudflare.com/turnstile/v0/api.js')){
   return route.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:fakeTurnstile});
  }
  if(url.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@')){
   return route.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:fakeSupabase});
  }
  if(url.startsWith(origin))return route.continue();
  unexpected.push(url);return route.abort();
 });
 return {ctx,page,origin,unexpected,pageErrors};
}
async function fillWizard(page,type='hotel'){
 await page.locator(type==='hotel'?'#typeHotel':'#typeIndependent').click();await page.locator('#nextStep').click();
 await page.locator('#businessName').fill('Restaurant pilote');
 await page.locator('#businessCity').fill('Rouen');
 await page.locator('#businessSiret').fill('13002526500013');
 await page.locator('#businessEmail').fill('pilot@example.test');
 await page.locator('#nextStep').click();
 await page.locator('#registrationPassword').fill('Longue phrase de passe DEV 2026');
 await page.locator('#registrationPasswordConfirm').fill('Longue phrase de passe DEV 2026');
}
(async()=>{
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({args:['--no-sandbox']});
  const closed=await setup(browser,{active:false});
  await closed.page.goto(closed.origin+'/inscription.html');
  assert.equal(await closed.page.locator('#submitRegistration').isDisabled(),true);
  assert.match(await closed.page.locator('#registrationStatus').textContent(),/Pilote privé fermé/);
  assert.equal(closed.unexpected.length,0);
  assert.deepEqual(closed.pageErrors,[]);
  await closed.ctx.close();console.log('PASS closed DEV runtime never initializes Auth or CAPTCHA');
  const active=await setup(browser,{active:true});
  await active.page.goto(active.origin+'/inscription.html');
  await fillWizard(active.page);
  await active.page.waitForFunction(()=>!!window.__captchaOptions);
  await active.page.waitForFunction(()=>document.getElementById('submitRegistration').disabled===false);
  await active.page.locator('#submitRegistration').click();
  await active.page.waitForFunction(()=>!!window.__signupPayload);
  const p=await active.page.evaluate(()=>window.__signupPayload);
  assert.equal(p.email,'pilot@example.test');
  assert.equal(p.options.captchaToken,'mock-turnstile-token');
  assert.equal(p.options.data.rm017_type,'hotel');
  assert.equal(p.options.data.rm017_siret,'13002526500013');
  assert.match(await active.page.locator('#siretVerificationStatus').innerText(),/SIRET vérifié/);
  assert.equal(p.options.emailRedirectTo,active.origin+'/inscription.html?verified=1');
  assert.equal(await active.page.locator('#submitRegistration').isDisabled(),true);
  assert.match(await active.page.locator('#registrationStatus').innerText(),/email de confirmation/);
  assert.deepEqual(active.pageErrors,[]);
  assert.equal(active.unexpected.length,0);await active.ctx.close();
  console.log('PASS pilot signup requires captcha and requests email confirmation');
  // The second venue type exercises the complete browser preflight too.
  const independent=await setup(browser,{active:true,width:390});
  await independent.page.goto(independent.origin+'/inscription.html');
  await fillWizard(independent.page,'independent');
  await independent.page.waitForFunction(()=>!!window.__captchaOptions);
  await independent.page.waitForFunction(()=>!document.getElementById('submitRegistration').disabled);
  await independent.page.locator('#submitRegistration').click();
  await independent.page.waitForFunction(()=>!!window.__signupPayload);
  const independentPayload=await independent.page.evaluate(()=>window.__signupPayload);
  assert.equal(independentPayload.options.data.rm017_type,'independent');
  assert.equal(independentPayload.options.data.rm017_siret,'13002526500013');
  assert.equal(independentPayload.options.captchaToken,'mock-turnstile-token');
  assert.equal(independent.unexpected.length,0);
  assert.deepEqual(independent.pageErrors,[]);
  await independent.ctx.close();
  console.log('PASS independent restaurant simulated signup, SIRET and CAPTCHA');

  // A rejected official SIRET check must not reach Supabase Auth signup.
  const rejected=await setup(browser,{active:true,width:390});
  await rejected.page.goto(rejected.origin+'/inscription.html');
  await fillWizard(rejected.page,'independent');
  await rejected.page.route('**/functions/v1/rm017-siret',route=>route.fulfill({status:403,
   contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'{"verified":false}'}));
  await rejected.page.waitForFunction(()=>!!window.__captchaOptions);
  await rejected.page.waitForFunction(()=>!document.getElementById('submitRegistration').disabled);
  await rejected.page.locator('#submitRegistration').click();
  await rejected.page.waitForFunction(()=>document.getElementById('registrationStatus').textContent.includes('ne peut pas'));
  assert.equal(await rejected.page.evaluate(()=>!!window.__signupPayload),false,'No Auth user before official SIRET success');
  assert.equal(rejected.unexpected.length,0);
  assert.deepEqual(rejected.pageErrors,[]);
  await rejected.ctx.close();
  console.log('PASS server-rejected SIRET cannot reach Supabase Auth');

  const validIndependent=await setup(browser,{active:true,verified:true,verifiedType:'independent',width:390});
  await validIndependent.page.goto(validIndependent.origin+'/inscription.html?verified=1');
  await validIndependent.page.locator('#registrationDone').waitFor({state:'visible'});
  const independentRpc=await validIndependent.page.evaluate(()=>window.__rpcCalled);
  assert.equal(independentRpc.name,'rm017_complete_signup_v1');
  assert.equal(independentRpc.payload.p_type,'independent');
  assert.equal(validIndependent.unexpected.length,0);
  assert.deepEqual(validIndependent.pageErrors,[]);
  await validIndependent.ctx.close();
  console.log('PASS independent verified callback provisions through same gated RPC');

  const valid=await setup(browser,{active:true,verified:true,width:1440});
  await valid.page.goto(valid.origin+'/inscription.html?verified=1');
  await valid.page.locator('#registrationDone').waitFor({state:'visible'});
  const action=await valid.page.evaluate(()=>window.__rpcCalled);
  assert.equal(action.name,'rm017_complete_signup_v1');
  assert.deepEqual(action.payload,{p_name:'Restaurant pilote',p_city:'Rouen',p_type:'hotel'});
  assert.equal(await valid.page.locator('#registrationVerification').isHidden(),true);
  assert.equal(await valid.page.locator('#signupDraft').isHidden(),true);
  assert.equal(new URL(valid.page.url()).search,'');
  assert.deepEqual(valid.pageErrors,[]);
  assert.equal(valid.unexpected.length,0);await valid.ctx.close();
  console.log('PASS confirmed callback creates tenant once and clears callback URL');
  const expired=await setup(browser,{active:true});
  await expired.page.goto(expired.origin+'/inscription.html?verified=1&error_code=otp_expired');
  await expired.page.locator('#registrationVerification').waitFor({state:'visible'});
  assert.match(await expired.page.locator('#verificationTitle').textContent(),/invalide ou expiré/);
  assert.equal(await expired.page.locator('#signupDraft').isHidden(),true);
  assert.equal(await expired.page.evaluate(()=>!!window.__rpcCalled),false);
  assert.deepEqual(expired.pageErrors,[]);
  assert.equal(expired.unexpected.length,0);await expired.ctx.close();
  console.log('PASS expired link is explained without provisioning');
 }catch(e){console.error(e.stack||e);process.exitCode=1}
 finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})();
