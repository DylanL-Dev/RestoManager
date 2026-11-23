'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const model=require('../rm017-signup-model.js');
const html=read('inscription.html'),draft=read('rm017-signup.js');
const register=read('rm017-register.js'),runtime=JSON.parse(read('rm017-runtime.json'));
test('RM-017.5 early SIRET checks match the authoritative gateway format check',async()=>{
 const {validSiret:serverValid}=await import('../supabase/functions/_shared/rm017-siret-gateway.mjs');
 const examples=[
  '13002526500013','55210055400013','13002526500014','55210055400014',
  '00000000000000','35600000000000','123456789','1234567890123A','',' 13002526500013 ',null,undefined,
 ];
 for(const example of examples)
  assert.equal(model.validSiret(example),serverValid(example),
   'Client vs server SIRET format mismatch for '+String(example));
 assert.equal(model.validSiret('13002526500013'),true);
 assert.equal(model.validSiret('13002526500014'),false);
});
test('RM-017.5 checksum is checked on stage 2, with accessible inline error, no new network calls',()=>{
 assert.match(html,/id="businessSiret"[^>]*required/);
 assert.match(draft,/if\(!M\.validSiret\(\$\('businessSiret'\)\.value\.trim\(\)\)\)/);
 assert.match(draft,/errors\.siret=/);
 assert.match(draft,/first==='siret'\?\$\('businessSiret'\)/);
 assert.match(draft,/aria-invalid/);
 assert.match(draft,/\$\('businessSiret'\)\.addEventListener\('input'/);
 assert.doesNotMatch(draft,/fetch\s*\(|\.rpc\s*\(|auth\.signUp|localStorage|sessionStorage/);
});
test('RM-017.5 final signup still requires official server verification, CAPTCHA and closed DEV gates',()=>{
 assert.match(register,/const validSiret=value=>window\.RestoSignupDraft\?\.validSiret\(value\)===true/);
 assert.match(register,/if\(!validSiret\(siret\)\)/);
 assert.match(register,/await verifyProfessionalSiret\(profile,siret\)/);
 assert.match(register,/const \{data,error\}=await api\.auth\.signUp\(/);
 assert.ok(register.indexOf('await verifyProfessionalSiret(profile,siret)')<register.indexOf('await api.auth.signUp('));
 assert.match(register,/captchaToken:token/);
 assert.match(register,/runtime\?\.enabled!==true/);
 assert.equal(runtime.enabled,false);
 assert.equal(runtime.turnstileSiteKey,null);
 assert.equal(runtime.channel,'dev');
 assert.doesNotMatch(register,/sb_secret_|service_role|SUPABASE_SECRET/i);
});
