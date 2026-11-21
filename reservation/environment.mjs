// Public deployment contract: each hosting environment stays bound to its own API.
export const projects=Object.freeze({dev:'lykoybacslvmhtzftqsf',production:'tnsrkargogckgtsxipwd'});
export function publicRuntime(value,href){
 const page=new URL(href),local=['127.0.0.1','localhost'].includes(page.hostname);
 if(!value||value.schema!==1||!['dev','production'].includes(value.channel)||typeof value.activated!=='boolean')throw Error('Configuration du portail indisponible.');
 if(!value.activated)return {...value,activated:false};
 const api=new URL(value.api,page),origin=value.allowedApiOrigin;
 if(value.channel==='dev'){
  if(!local&&!page.hostname.endsWith('.onrender.com'))throw Error('Cette page ne peut pas utiliser le service de développement.');
  if(!(local&&api.origin===page.origin)&&api.href!=='https://'+projects.dev+'.supabase.co/functions/v1/rm015-public')throw Error('Service de développement non autorisé.');
 }else{
  if(value.projectRef!==projects.production||api.href!=='https://'+projects.production+'.supabase.co/functions/v1/rm015-public'||page.origin!==value.publicOrigin||!page.pathname.startsWith(value.publicBasePath)||!value.publicBasePath?.startsWith('/')||!value.publicBasePath.endsWith('/'))throw Error('Cette page ne correspond pas au service de réservation officiel.');
  if(!/^[A-Za-z0-9_-]{10,100}$/.test(value.turnstileSiteKey||'')||/^[123]x0+/.test(value.turnstileSiteKey))throw Error('La vérification de réservation n’est pas configurée.');
 }
 if(origin!==api.origin||api.username||api.password||api.search||api.hash)throw Error('Adresse du service non autorisée.');
 return value;
}
