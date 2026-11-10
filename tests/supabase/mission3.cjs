'use strict';
// Disposable local integration stack. No remote URL, project ref or DB URL accepted.
const {spawn}=require('node:child_process');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const http=require('node:http');const net=require('node:net');const crypto=require('node:crypto');
const assert=require('node:assert/strict');const {createClient}=require('@supabase/supabase-js');
const root=path.resolve(__dirname,'../..');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'restomanager-mission3-local-'));
const name='restomanager-mission3-'+process.pid;const network=name+'-net';
const images={db:process.env.MISSION3_POSTGRES_IMAGE||'postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994',auth:'docker.io/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',rest:'docker.io/postgrest/postgrest:v16.5@sha256:1347d7552b88f17832912c06afbf7c43209af6eeeb60834b04aae12c9bd9d5cc',realtime:process.env.MISSION3_REALTIME_IMAGE||'docker.io/supabase/realtime:v2.151.3@sha256:dac44c958d0776144f0046ff0c0f8d51e0ff4f8a86c4a5e25287dd2f79fffa1e'};
const env={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const secret=crypto.randomBytes(40).toString('hex'),password=crypto.randomBytes(24).toString('hex');
function jwt(role){const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const value=b({alg:'HS256',typ:'JWT'})+'.'+b({role,iss:'supabase-demo',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400});return value+'.'+crypto.createHmac('sha256',secret).update(value).digest('base64url');}
const anonKey=jwt('anon'),serviceKey=jwt('service_role');
function safe(value){return String(value).replaceAll(secret,'[redacted]').replaceAll(password,'[redacted]').replaceAll(anonKey,'[redacted]').replaceAll(serviceKey,'[redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[token]');}
function command(exe,args,input='',timeout=120000){return new Promise((resolve,reject)=>{const p=spawn(exe,args,{env});let stdout='',stderr='';const timer=setTimeout(()=>{p.kill('SIGTERM');reject(Error(exe+' timeout'));},timeout);p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})});p.stdin.end(input);});}
const docker=(args,input='',timeout)=>command('docker',['--host=unix:///var/run/docker.sock',...args],input,timeout);
async function checked(args,input='',timeout){const r=await docker(args,input,timeout);assert.equal(r.code,0,safe(r.stderr));return r.stdout.trim();}
async function sql(query){return checked(['exec','-i',name+'-db','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],query);}
const created=[];let gateway;
async function runContainer(kind,values,extra=[],command=[]){const file=path.join(work,kind+'.env');fs.writeFileSync(file,Object.entries(values).map(([k,v])=>k+'='+v).join('\n'),{mode:0o600});const container=name+'-'+kind;await checked(['run','-d','--name',container,'--label','restomanager.mission=3-isolated','--network',network,'--env-file',file,...extra,images[kind],...command]);created.push(container);}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,label){let last;for(let i=0;i<160;i++){try{if(await fn())return;}catch(e){last=e;}await delay(250);}throw Error(label+' not ready'+(last?': '+safe(last.message):''));}
async function freePort(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
async function main(){
 const pluginResult=await command('bash',[path.join(__dirname,'prepare-wal2json.sh'),path.join(work,'wal2json')]);
 assert.equal(pluginResult.code,0,safe(pluginResult.stderr));const plugin=pluginResult.stdout.trim();
 assert.ok(path.isAbsolute(plugin)&&fs.existsSync(plugin),'Verified local wal2json library required');
 await checked(['network','create','-o','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',network]);
 await runContainer('db',{POSTGRES_PASSWORD:password},['--mount',`type=bind,src=${plugin},dst=/usr/lib/postgresql/17/lib/wal2json.so,readonly`,'--tmpfs','/var/lib/postgresql/data:rw','--health-cmd','pg_isready -U postgres','--health-interval','1s'],['postgres','-c','wal_level=logical','-c','output_plugin_libraries=wal2json']);
 await waitFor(async()=>{const r=await docker(['inspect','--format','{{.State.Health.Status}}',name+'-db']);const logs=await docker(['logs',name+'-db']);return r.stdout.trim()==='healthy'&&(logs.stdout+logs.stderr).includes('PostgreSQL init process complete; ready for start up.');},'PostgreSQL');
 // Configure the real self-hosted Auth/PostgREST roles; GoTrue creates its real schema.
 await sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create role authenticator login noinherit password '${password}';grant anon,authenticated,service_role to authenticator;
 create role supabase_auth_admin login noinherit createrole password '${password}';
 alter role supabase_auth_admin set search_path=auth,public,extensions;
 create role supabase_admin login superuser password '${password}';
 create role dashboard_user nologin;
 create schema auth authorization supabase_auth_admin;create schema extensions;create extension if not exists pgcrypto with schema extensions;
 create schema _realtime authorization supabase_admin;
 create schema realtime authorization supabase_admin;
 grant usage on schema public,auth to anon,authenticated,service_role;grant all on schema public to supabase_auth_admin;
`);
 const ports={auth:await freePort(),rest:await freePort(),realtime:await freePort()};const gatewayPort=await freePort();const url='http://127.0.0.1:'+gatewayPort;
 await runContainer('auth',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:9999,API_EXTERNAL_URL:url+'/auth/v1',GOTRUE_SITE_URL:url,GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${password}@${name}-db:5432/postgres`,GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:3600,GOTRUE_EXTERNAL_EMAIL_ENABLED:true,GOTRUE_MAILER_AUTOCONFIRM:true,GOTRUE_DISABLE_SIGNUP:true,GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:1025},['-p',`127.0.0.1:${ports.auth}:9999`]);
 await waitFor(async()=>{const r=await fetch(`http://127.0.0.1:${ports.auth}/health`);return r.ok;},'Auth');
 // Standard self-hosted bootstrap: retain real GoTrue Auth objects and support
 // both current PostgREST JWT claims and older per-claim GUCs (no user stub).
 await sql("create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid$$;grant execute on function auth.uid() to public;");
 let fixture=fs.readFileSync(path.join(root,'tests/postgres/fixture.sql'),'utf8');
 fixture=fixture.replace('create role anon nologin;create role authenticated nologin;create role resto_service_writer nologin nobypassrls;','create role resto_service_writer nologin nobypassrls;')
  .replace('create schema auth;create schema private;','create schema private;')
  .replace('create table auth.users(id uuid primary key);','')
  .replace(/create function auth\.uid\(\) returns uuid language sql stable as \$\$[\s\S]*?\$\$;/,'');
 await sql(fixture);
 await runContainer('rest',{PGRST_DB_URI:`postgres://authenticator:${password}@${name}-db:5432/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_MAX_ROWS:100,PGRST_DB_EXTRA_SEARCH_PATH:'public,extensions'},['-p',`127.0.0.1:${ports.rest}:3000`]);
 await runContainer('realtime',{PORT:4000,DB_HOST:name+'-db',DB_PORT:5432,DB_USER:'supabase_admin',DB_PASSWORD:password,DB_NAME:'postgres',DB_AFTER_CONNECT_QUERY:'SET search_path TO _realtime',DB_ENC_KEY:'supabaserealtime',API_JWT_SECRET:secret,METRICS_JWT_SECRET:secret,SECRET_KEY_BASE:crypto.randomBytes(64).toString('hex'),ERL_AFLAGS:'-proto_dist inet_tcp +S 2:2',ECTO_IPV6:false,DNS_NODES:"''",APP_NAME:'realtime',SEED_SELF_HOST:true,RUN_JANITOR:true,DISABLE_HEALTHCHECK_LOGGING:true},['-p',`127.0.0.1:${ports.realtime}:4000`]);
 const targetFor=pathname=>pathname.startsWith('/auth/v1')?{port:ports.auth,path:pathname.slice(8)||'/'}:pathname.startsWith('/rest/v1')?{port:ports.rest,path:pathname.slice(8)||'/'}:pathname.startsWith('/realtime/v1')?{port:ports.realtime,path:pathname.replace('/realtime/v1','/socket'),realtime:true}:null;
 gateway=http.createServer((req,res)=>{const target=targetFor(req.url);if(!target){res.writeHead(404);res.end();return;}const headers={...req.headers,host:target.realtime?'realtime-dev.localhost':`127.0.0.1:${target.port}`};const upstream=http.request({host:'127.0.0.1',port:target.port,path:target.path,method:req.method,headers},answer=>{res.writeHead(answer.statusCode,answer.headers);answer.pipe(res)});upstream.on('error',()=>{res.writeHead(503);res.end()});req.pipe(upstream);});
 gateway.on('upgrade',(req,socket,head)=>{const target=targetFor(req.url);if(!target?.realtime){socket.destroy();return;}const upstream=net.connect(target.port,'127.0.0.1',()=>{const headers={...req.headers,host:'realtime-dev.localhost'};upstream.write(`${req.method} ${target.path} HTTP/${req.httpVersion}\r\n`+Object.entries(headers).map(([k,v])=>k+': '+v).join('\r\n')+'\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());});
 await new Promise(resolve=>gateway.listen(gatewayPort,'127.0.0.1',resolve));
 await waitFor(async()=>{const r=await fetch(url+'/rest/v1/',{headers:{apikey:anonKey,Authorization:'Bearer '+anonKey}});return r.ok;},'PostgREST');
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});const accounts=[];
 const specs=[['fb_admin',1,'admin-fb@accounts.restomanager.example.com'],['fb_admin',1,'admin-two@accounts.restomanager.example.com'],['reception',1,'reception@accounts.restomanager.example.com'],['fb_admin',2,'admin-b@accounts.restomanager.example.com'],['reception',1,'inactive@accounts.restomanager.example.com'],['reception',2,'reception-b@accounts.restomanager.example.com']];
 for(const [role,tenant,email] of specs){const password=crypto.randomBytes(18).toString('hex');const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(error);accounts.push({userId:data.user.id,email,password,role,restaurantId:'10000000-0000-4000-8000-'+String(tenant).padStart(12,'0'),tenant});}
 let seed=fs.readFileSync(path.join(root,'tests/postgres/seed.sql'),'utf8').replace('truncate public.restaurants,auth.users cascade;','truncate public.restaurants cascade;').replace(/insert into auth\.users\(id\) select[^;]+;/,'');
 accounts.forEach((a,i)=>seed=seed.replaceAll('20000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),a.userId));await sql(seed);
 const bReception=accounts[5];await sql(`insert into public.staff_profiles(user_id,role,display_name,restaurant_id,active) values('${bReception.userId}','reception','Réception fictive B','${bReception.restaurantId}',true);`);
 for(const account of accounts.filter((a,i)=>i!==4)){account.client=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});const {error}=await account.client.auth.signInWithPassword({email:account.email,password:account.password});assert.ifError(error);}
 await sql('create publication supabase_realtime;alter publication supabase_realtime add table public.reservations,public.reservation_tables,public.restaurant_rooms,public.restaurant_tables,public.table_holds,public.table_fusion_links,public.restaurant_hours,public.restaurant_service_changes;');
 const day=await sql("select ((now() at time zone 'Europe/Paris')::date+1)::text;");
 const devSnapshot=process.argv.includes('--dev-snapshot');
 const context={url,anonKey,accounts,sql,day,assert,ports,root,devSnapshot};
 console.log('INFO isolated components started; real Auth sessions established for two fictional restaurants');
 const legacy=await require('./browser-tests.cjs')({...context,readOnlyPhase:true});
 await sql(fs.readFileSync(path.join(root,'supabase/scripts/mission2_reservation_edits.sql'),'utf8'));
 await sql(fs.readFileSync(path.join(root,'supabase/scripts/mission3_validation_integration.sql'),'utf8'));
 if(devSnapshot){
  await sql(fs.readFileSync(path.join(root,'supabase/scripts/platform_owner_foundation.sql'),'utf8'));
  await sql(fs.readFileSync(path.join(root,'supabase/scripts/bug01_private_reports.sql'),'utf8'));
 }
 await waitFor(async()=>{const {data,error}=await accounts[0].client.rpc('service_sync_state_v1');return !error&&data?.capabilities?.reservation_edits===4;},'Mission 3 schema cache');
 const api=await require('./api-tests.cjs').run(context);
 const browser=await require('./browser-tests.cjs')(context);
 const result={status:'Réussi',backend:'real self-hosted Supabase components; loopback only',images,legacy,api,browser};
 if(process.env.MISSION3_ARTIFACTS){fs.mkdirSync(process.env.MISSION3_ARTIFACTS,{recursive:true});fs.writeFileSync(path.join(process.env.MISSION3_ARTIFACTS,'supabase-results.json'),JSON.stringify(result,null,2));}
 console.log(JSON.stringify(result));
 for(const a of accounts)if(a.client){await a.client.removeAllChannels();await a.client.auth.signOut();}
}
main().catch(async error=>{console.error(safe(error.stack||error));for(const container of created){const r=await docker(['logs','--tail','25',container]);fs.writeFileSync(path.join(work,container+'.log'),safe(r.stdout+r.stderr),{mode:0o600});}console.error('Sanitized local diagnostics: '+work);process.exitCode=1;}).finally(async()=>{gateway?.closeAllConnections();gateway?.close();for(const container of created.reverse())await docker(['rm','-f','-v',container]);await docker(['network','rm',network]);for(const file of fs.readdirSync(work))if(file.endsWith('.env'))fs.unlinkSync(path.join(work,file));});
