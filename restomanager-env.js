// RestoManager environment routing — public browser keys ONLY (never a service-role key).
// Each deployment stays permanently bound to its own Supabase project.
const hostname=location.hostname.toLowerCase();
const isDev=hostname.endsWith('.onrender.com')||hostname==='localhost'||hostname==='127.0.0.1';
const isProd=hostname.endsWith('.github.io');
if(!isDev&&!isProd)throw new Error('Hébergement RestoManager non reconnu : connexion désactivée par sécurité.');
export const supabaseEnvironment=Object.freeze(isDev
 ?{name:'DEV',url:'https://lykoybacslvmhtzftqsf.supabase.co',publishableKey:'sb_publishable_JVFRbinEtzT2sJIjdF2asA_6q0VEw4b'}
 :{name:'PROD',url:'https://tnsrkargogckgtsxipwd.supabase.co',publishableKey:'sb_publishable_7OHPvnA-iJWZAvVsg6tNwg_6YwtX7i7'});
