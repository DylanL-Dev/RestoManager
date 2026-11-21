'use strict';
// Pure local preparation. No network, deploy, database query or secret generation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const git=args=>{const result=spawnSync('git',args,{cwd:__dirname+'/..',encoding:'utf8',maxBuffer:8*1024*1024});if(result.status!==0)throw Error('Git metadata unavailable');return result.stdout;};
const root=path.resolve(__dirname,'..'),production='tnsrkargogckgtsxipwd',development='lykoybacslvmhtzftqsf';
const migrations=['20261118190351_rm015_secure_public_booking.sql','20261119084919_rm015_dev_runtime_vault.sql','20261119085721_rm015_backend_auth_permissions.sql','20261119182041_rm015_portal_cover_media.sql','20261120074140_rm015_public_restaurant_profile.sql','20261120173728_rm015_public_hotel_guests.sql'];
function validate(config){
 const fields=['schema','projectRef','publicBaseUrl','activated','turnstileSiteKey','mainBaseSha','v3BaseSha'];
 if(!config||Object.keys(config).some(key=>!fields.includes(key))||config.schema!==1||config.projectRef!==production||typeof config.activated!=='boolean'||!['mainBaseSha','v3BaseSha'].every(key=>/^[a-f0-9]{40}$/.test(config[key])))throw Error('Invalid reviewed production configuration');
 const page=new URL(config.publicBaseUrl);if(page.protocol!=='https:'||page.username||page.password||page.search||page.hash||!page.pathname.endsWith('/')||page.hostname.endsWith('.onrender.com')||['localhost','127.0.0.1'].includes(page.hostname))throw Error('Production hosting must be explicit HTTPS, outside DEV');
 if(config.activated&&(!/^[A-Za-z0-9_-]{10,100}$/.test(config.turnstileSiteKey||'')||/^[123]x0+/.test(config.turnstileSiteKey)))throw Error('Production opening requires a real public Turnstile site key');
 if(config.turnstileSiteKey!==null&&typeof config.turnstileSiteKey!=='string')throw Error('Invalid public site key');return page;
}
function prepare(config,output=path.join(root,'dist/rm015-production')){
 const page=validate(config),out=path.resolve(output);if(!(out.startsWith(path.join(root,'dist')+path.sep)||out.startsWith('/tmp/')))throw Error('Output must be a task build directory');
 fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
 const write=(name,body)=>{const p=path.join(out,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,body);};
 const files=JSON.parse(fs.readFileSync(path.join(root,'deployment/rm015-site-files.json'),'utf8'));
 if(!Array.isArray(files)||new Set(files).size!==files.length)throw Error('Invalid public asset manifest');
 for(const file of files){if(typeof file!=='string'||file.startsWith('/')||file.split('/').some(part=>part==='..'||part.startsWith('.'))||/^(supabase|scripts|tests|docs|deployment|node_modules)\//.test(file)||fs.lstatSync(path.join(root,file)).isSymbolicLink())throw Error('Unsafe public asset');write('site/'+file,fs.readFileSync(path.join(root,file)));}
 for(const file of require('./public-connected-assets.cjs').reservation)if(!files.includes('reservation/'+file))throw Error('Public portal asset missing from production manifest');
 const shell=fs.readFileSync(path.join(root,'sw.js'),'utf8').match(/const SHELL=(\[[^;]+?\])\.map/)?.[1];if(!shell)throw Error('Shell cache manifest not found');for(const file of JSON.parse(shell))if(!files.includes(file))throw Error('Staff asset missing from production manifest: '+file);
 const version=JSON.parse(fs.readFileSync(path.join(root,'app-release.json'),'utf8')).currentVersion.replace(/-dev$/,'-main');
 const history=JSON.parse(fs.readFileSync(path.join(root,'deployment/rm015-main-release-base.json'),'utf8'));
 if(history.channel!=='main'||history.releases[0]?.version!==history.currentVersion)throw Error('Invalid reviewed MAIN release history');
 const release={version,date:version.slice(0,10).replaceAll('.','-'),title:'Réservations en ligne et suivi partagé',changes:['Un portail client par restaurant, ouvert seulement après configuration et validation.','Les réservations Web rejoignent les vues Restaurant et Réception, avec leurs droits habituels.','Les dates, horaires indisponibles et délais sont expliqués.'],impact:'Le portail reste fermé tant que son ouverture n’est pas validée. Les emails restent désactivés.',requiresReload:true};
 write('site/app-release.json',JSON.stringify({...history,currentVersion:version,releases:[release,...history.releases]},null,2)+'\n');
 for(const file of ['v3-connected.html']){let source=fs.readFileSync(path.join(out,'site',file),'utf8').replace(/name="restomanager-version" content="[^"]+"/,'name="restomanager-version" content="'+version+'"').replace('name="restomanager-channel" content="dev"','name="restomanager-channel" content="main"');source=source.replace('</head>','<meta name="restomanager-public-portal" content="'+(config.activated?'open':'closed')+'"></head>');write('site/'+file,source);}
 for(const file of files.filter(file=>/\.(?:m?js)$/.test(file))){const source=fs.readFileSync(path.join(out,'site',file),'utf8');if(source.includes('restomanager-env.js?v='))write('site/'+file,source.replace(/restomanager-env\.js\?v=[^'"]+/g,'restomanager-env.js?v='+version));}
 write('site/sw.js',fs.readFileSync(path.join(root,'sw.js'),'utf8').replace(/restomanager-shell-[^'\s]+/,'restomanager-shell-'+version));
 const environment=fs.readFileSync(path.join(root,'restomanager-env.js'),'utf8'),key=environment.match(/name:'PROD',url:'https:\/\/tnsrkargogckgtsxipwd\.supabase\.co',publishableKey:'(sb_publishable_[A-Za-z0-9_-]+)'/)?.[1];if(!key)throw Error('Reviewed public production key missing');
 write('site/restomanager-env.js',"if(location.origin!=="+JSON.stringify(page.origin)+")throw Error('Hébergement de production non reconnu.');\nexport const supabaseEnvironment=Object.freeze("+JSON.stringify({name:'PROD',url:'https://'+production+'.supabase.co',publishableKey:key})+");\n");
 const runtime={schema:1,channel:'production',projectRef:production,publicOrigin:page.origin,publicBasePath:page.pathname,activated:config.activated,api:config.activated?'https://'+production+'.supabase.co/functions/v1/rm015-public':null,allowedApiOrigin:config.activated?'https://'+production+'.supabase.co':null,turnstileSiteKey:config.turnstileSiteKey};write('site/reservation/runtime.json',JSON.stringify(runtime,null,2)+'\n');
 let html=fs.readFileSync(path.join(root,'reservation/live.html'),'utf8').replaceAll(development,production).replace('RestoManager · Recette connectée','RestoManager').replace('<strong>Recette DEV</strong>','<strong>Réservation en ligne</strong>').replace('<span>Données de l’établissement · Emails désactivés</span>','<span>Votre lien personnel de réservation</span>').replace('Environnement de recette · Emails désactivés','Conservez votre lien personnel de réservation.');write('site/reservation/live.html',html);
 for(const file of ['rm015-runtime.mjs','rm015-gateway.mjs','rm015-crypto.mjs','rm015-turnstile.mjs'])write('supabase/functions/_shared/'+file,fs.readFileSync(path.join(root,'supabase/functions/_shared',file)));
 write('supabase/functions/rm015-public/index.ts',fs.readFileSync(path.join(root,'supabase/functions/rm015-public/index.ts'),'utf8').replace("expectedProjectRef:'"+development+"'","expectedProjectRef:'"+production+"',expectedEnvironment:'production'"));
 write('supabase/config.toml','project_id = "restomanager-rm015-production-prepared"\n[functions.rm015-public]\nverify_jwt = false\n');
 for(const file of migrations)write('migrations/'+file,fs.readFileSync(path.join(root,'supabase/migrations',file)));
 write('preflight.sql',fs.readFileSync(path.join(root,'supabase/production/rm015-preflight.sql')));
 for(const file of ['site/restomanager-env.js','site/reservation/runtime.json','site/reservation/live.html','supabase/functions/rm015-public/index.ts'])if(fs.readFileSync(path.join(out,file),'utf8').includes(development))throw Error('DEV endpoint leaked into production routing');
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
 const hashes=walk(out).map(file=>({file:path.relative(out,file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
 const receipt={schema:1,preparedOnly:true,sourceCommit:git(['rev-parse','HEAD']).trim(),workingTreeDirty:Boolean(git(['status','--porcelain']).trim()),reviewedBases:{main:config.mainBaseSha,v3:config.v3BaseSha},version,projectRef:production,publicBaseUrl:page.href,portalActivated:config.activated,emailDeliveryEnabled:false,functionConfig:{name:'rm015-public',verifyJwt:false},requiredMigrations:migrations,hashes};write('release.json',JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(require.main===module){const input=process.argv[2]||path.join(root,'deployment/rm015-production.json');const receipt=prepare(JSON.parse(fs.readFileSync(input,'utf8')),process.argv[3]);console.log(JSON.stringify({preparedOnly:true,files:receipt.hashes.length,portalActivated:receipt.portalActivated,emailDeliveryEnabled:false}));}
module.exports={validate,prepare,migrations};
