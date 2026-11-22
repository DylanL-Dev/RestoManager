'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(base,p),'utf8');
const sql=read('supabase/migrations/20261122180000_rm01722_dev_siret_registry.sql');
const signup=read('rm017-register.js'),html=read('inscription.html');
const upstreamURL='https://recherche-entreprises.api.gouv.fr/search?q=13002526500013';
const validFixture={resultats:[{siren:'130025265',etat_administratif:'A',nom_complet:'ENTREPRISE OFFICIELLE EXEMPLE',siege:{siret:'13002526500013',etat_administratif:'A',libelle_commune:'Rouen'}}]};
const load=()=>import('../supabase/functions/_shared/rm017-siret-gateway.mjs');
test('SIRET format and checksum reject fictitious and mismatched identifiers',async()=>{
 const {validSiret}=await load();
 assert.equal(validSiret('13002526500013'),true);
 assert.equal(validSiret('13002526500014'),false);
 assert.equal(validSiret('130025265'),false);
 assert.equal(validSiret('1300252650001A'),false);
 assert.equal(validSiret(''),false);
 assert.equal(validSiret(null),false);
});
test('Government lookup must prove the exact active establishment, not only the company SIREN',async()=>{
 const {inspectRegistryRecord}=await load();
 assert.deepEqual(inspectRegistryRecord(validFixture,'13002526500013'),{siret:'13002526500013',siren:'130025265',legalName:'ENTREPRISE OFFICIELLE EXEMPLE',city:'Rouen'});
 assert.equal(inspectRegistryRecord({...validFixture,resultats:[{...validFixture.resultats[0],siege:{...validFixture.resultats[0].siege,siret:'13002526500021'}}]},'13002526500013'),null);
 assert.equal(inspectRegistryRecord({...validFixture,resultats:[{...validFixture.resultats[0],etat_administratif:'C'}]},'13002526500013'),null);
 assert.equal(inspectRegistryRecord({...validFixture,resultats:[{...validFixture.resultats[0],siege:{...validFixture.resultats[0].siege,etat_administratif:'F'}}]},'13002526500013'),null);
 assert.equal(inspectRegistryRecord(validFixture,'13002526500014'),null);
});
test('SIRET lookup gateway only calls the government host after private invitation and rate-limit approval',async()=>{
 const {createSiretHandler}=await load();
 const called=[];
 const env=name=>({
  SUPABASE_URL:'https://lykoybacslvmhtzftqsf.supabase.co',
  SUPABASE_SECRET_KEYS:'{"default":"fake-secret-value"}'
 })[name]||'';
 const fetcher=async(url,opts={})=>{
  called.push(url);
  if(url.includes('/rest/v1/rpc/rm017_siret_allow_lookup_v1'))return Response.json(true);
  if(url.includes('/rest/v1/rpc/rm017_record_siret_v1'))return Response.json(true);
  if(url===upstreamURL)return Response.json(validFixture);
  throw Error('Unapproved outbound request '+url);
 };
 const handler=createSiretHandler({env,fetcher});
 const req=(origin='https://restomanager-v3-supabase-integration.onrender.com')=>new Request('https://lykoybacslvmhtzftqsf.supabase.co/functions/v1/rm017-siret',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({email:'pilot@example.test',type:'independent',siret:'13002526500013'})
 });
 const forbidden=await handler(req('https://other.example'));
 assert.equal(forbidden.status,403);assert.equal(called.length,0);
 const okay=await handler(req());
 assert.equal(okay.status,200);
 assert.equal((await okay.json()).verified,true);
 assert.deepEqual(called,[
  'https://lykoybacslvmhtzftqsf.supabase.co/rest/v1/rpc/rm017_siret_allow_lookup_v1',
  upstreamURL,
  'https://lykoybacslvmhtzftqsf.supabase.co/rest/v1/rpc/rm017_record_siret_v1'
 ]);
});
test('Origin spoofing, invalid checksums and non-invited callers never trigger external API',async()=>{
 const {createSiretHandler}=await load();
 const arr=[];
 const handler=createSiretHandler({env:n=>({SUPABASE_URL:'https://lykoybacslvmhtzftqsf.supabase.co',SUPABASE_SECRET_KEY:'x'})[n]||'',fetcher:async(url)=>{arr.push(url);return Response.json(false)}});
 const base='https://lykoybacslvmhtzftqsf.supabase.co/functions/v1/rm017-siret';
 const request=new Request(base,{method:'POST',headers:{Origin:'https://restomanager-v3-supabase-integration.onrender.com'},body:JSON.stringify({email:'pilot@example.test',type:'hotel',siret:'13002526500014'})});
 assert.equal((await handler(request)).status,400);
 assert.equal(arr.length,0);
 const denied=new Request(base,{method:'POST',headers:{Origin:'https://restomanager-v3-supabase-integration.onrender.com'},body:JSON.stringify({email:'not-invited@example.test',type:'hotel',siret:'13002526500013'})});
 assert.equal((await handler(denied)).status,403);
 assert.equal(arr.length,1);
});
test('UI requires a verifiable SIRET before Auth and maintains registration and database gates',()=>{
 assert.match(html,/id="businessSiret"/);
 assert.match(html,/id="siretError"/);
 assert.match(html,/id="siretVerificationStatus"/);
 assert.match(html,/id="reviewSiret"/);
 assert.match(signup,/if\(!validSiret\(siret\)\)/);
 assert.match(signup,/await verifyProfessionalSiret\(profile,siret\)/);
 assert.match(signup,/rm017_siret:siret/);
 assert.match(signup,/runtime\?\.enabled!==true/);
 assert.match(sql,/CREATE UNIQUE INDEX rm01722_registered_siret_unique/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.rm017_record_siret_v1.*TO service_role/s);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.rm017_siret_allow_lookup_v1.*TO service_role/s);
 assert.match(sql,/u\.email_confirmed_at IS NOT NULL/);
 assert.match(sql,/i\.consumed_at IS NULL/);
 assert.match(sql,/p\.consumed_at IS NULL/);
 assert.match(sql,/e\.siret=v_siret/);
 assert.match(sql,/rm017_siret_prechecks/);
 assert.doesNotMatch(signup,/service_role|sb_secret_|tnsrkargogckgtsxipwd/);
 assert.doesNotMatch(sql,/tnsrkargogckgtsxipwd/);
});
