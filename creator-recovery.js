// RM-017.3.5 DEV: handle Supabase implicit, PKCE and token-hash recovery links.
// Snapshot the incoming URL BEFORE Supabase Auth consumes/clears its credentials.
const query=new URLSearchParams(location.search);
const fragment=new URLSearchParams(location.hash.replace(/^#/,''));
const linkType=query.get('type')||fragment.get('type')||'';
const hasImplicitTokens=fragment.has('access_token')&&fragment.has('refresh_token');
const hasAuthCode=Boolean(query.get('code'));
const tokenHash=query.get('token_hash');
const tokenHashType=(linkType==='recovery'||linkType==='invite')?linkType:null;
const hasTokenHash=Boolean(tokenHash&&tokenHashType);
const invitationMarker=query.get('invitation')==='1';
const invitationLink=linkType==='invite'||invitationMarker;
const recoveryLink=linkType==='recovery';
const hasLinkProof=!query.has('error')&&!fragment.has('error')&&(
 hasAuthCode||hasTokenHash||
 (hasImplicitTokens&&(recoveryLink||invitationLink))
);

import {supabaseEnvironment} from './restomanager-env.js?v=20261109-twins1';
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
if(supabaseEnvironment.name!=='DEV')throw new Error('Récupération réservée à DEV.');
const client=createClient(supabaseEnvironment.url,supabaseEnvironment.publishableKey,
 {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let authorized=false,submitting=false,accepting=false;
function setStatus(message){$('creatorRecoveryMessage').textContent=message;}
function linkInvalid(){
 if(authorized)return;
 setStatus('Ce lien est expiré, déjà utilisé ou invalide. Retournez à la connexion et demandez un nouveau lien de récupération DEV.');
}
async function acceptSession(){
 if(authorized||accepting)return authorized;
 accepting=true;
 try{
  // Both identity and admin authorization are validated by the Supabase server.
  // Having a cached authenticated session alone never authorizes a password reset.
  const {data:{user},error:userError}=await client.auth.getUser();
  if(userError||!user||!user.email_confirmed_at||user.is_anonymous)return false;
  const {data:root,error:rootError}=await client.from('platform_admins')
   .select('user_id,role,active').eq('user_id',user.id).maybeSingle();
  if(rootError||!root||root.user_id!==user.id||root.role!=='platform_admin'||!root.active)return false;
  authorized=true;
  $('creatorPasswordRecovery').hidden=false;
  setStatus('Lien vérifié. Choisissez un mot de passe DEV de 12 caractères minimum.');
  // Remove access credentials from the address bar only AFTER Auth processed them.
  history.replaceState(null,'',location.pathname);
  return true;
 }finally{accepting=false}
}
// Supabase docs: defer calls to other auth methods outside onAuthStateChange,
// otherwise a recovery callback may deadlock the auth initialization lock.
client.auth.onAuthStateChange((event,session)=>{
 if(!session)return;
 if(event==='PASSWORD_RECOVERY'||(hasLinkProof&&(event==='SIGNED_IN'||event==='INITIAL_SESSION'))){
  setTimeout(()=>{void acceptSession().catch(linkInvalid)},0);
 }
});
(async()=>{
 if(query.has('error')||fragment.has('error'))return linkInvalid();
 if(!hasLinkProof)return linkInvalid();
 try{
  if(hasTokenHash&&!hasAuthCode&&!hasImplicitTokens){
   // For a custom Supabase email template with token_hash.
   const {data,error}=await client.auth.verifyOtp({type:tokenHashType,token_hash:tokenHash});
   if(error||!data?.session)return linkInvalid();
  }else{
   // Supabase JS exchanges PKCE ?code= or detects implicit #access_token.
   const {data,error}=await client.auth.getSession();
   if(error||!data?.session)return linkInvalid();
  }
  if(!await acceptSession())linkInvalid();
 }catch{linkInvalid()}
})();
$('creatorPasswordRecovery').addEventListener('submit',async event=>{
 event.preventDefault();
 if(submitting||!authorized)return;
 const p=$('creatorNewPassword').value,c=$('creatorConfirmPassword').value;
 if(p.length<12||p.length>128||p!==c){
  setStatus('Choisissez au moins 12 caractères et saisissez deux fois le même mot de passe.');
  return;
 }
 submitting=true;$('creatorRecoverySubmit').disabled=true;
 try{
  const {data:{user},error:userError}=await client.auth.getUser();
  if(userError||!user||!user.email_confirmed_at)throw Error('Session absente');
  const {data:root,error:rootError}=await client.from('platform_admins')
   .select('user_id,role,active').eq('user_id',user.id).maybeSingle();
  if(rootError||!root||root.user_id!==user.id||root.role!=='platform_admin'||!root.active)
   throw Error('Autorisation Root révoquée');
  const {error}=await client.auth.updateUser({password:p});
  if(error)throw error;
  $('creatorNewPassword').value='';$('creatorConfirmPassword').value='';
  $('creatorPasswordRecovery').hidden=true;authorized=false;
  await client.auth.signOut({scope:'local'});
  setStatus('Mot de passe DEV enregistré. Reconnectez-vous avec votre email Root puis configurez la double authentification.');
 }catch{
  setStatus('Le nouveau mot de passe n’a pas pu être enregistré. Demandez un nouveau lien de récupération DEV.');
 }finally{
  submitting=false;$('creatorRecoverySubmit').disabled=false;
 }
});