import {supabaseEnvironment} from './restomanager-env.js?v=20261109-twins1';
// RM-017.3.3 — DEV-only Root access. No account creation, no privilege grant.
// Access is authorized exclusively by Supabase Auth + platform_admins RLS.
import {installOwnerInbox} from './creator-admin.js?v=20261114-rm006-root1';
import {installCreatorConsole} from './creator-console.js?v=20261123-rm01732';
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm';
if(supabaseEnvironment.name!=='DEV')throw new Error('Ce parcours Root est réservé à DEV.');
const client=createClient(
 supabaseEnvironment.url,
 supabaseEnvironment.publishableKey,
 {auth:{persistSession:true,autoRefreshToken:true}}
);
const $=id=>document.getElementById(id);
let verifying=false,installed=false;
const aliasKey='rm:rootdev:authorized-email-v1';
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Store only the Root email verified through password + active platform_admin membership.
// The local alias is a username hint; no passwords, roles or tokens are stored by this code.
function rememberedEmail(){
 try{
  const email=String(localStorage.getItem(aliasKey)||'').trim().toLowerCase();
  return emailPattern.test(email)?email:'';
 }catch{return ''}
}
async function rememberVerifiedRootEmail(){
 const {data:{user},error}=await client.auth.getUser();
 const email=String(user?.email||'').trim().toLowerCase();
 if(error||!emailPattern.test(email))return;
 try{localStorage.setItem(aliasKey,email)}catch{}
}
const recoveryRedirect=new URL('creator-recovery.html',location.href).href;
function feedback(message=''){
 $('ownerAuthFeedback').textContent=message;
}
function stages(stage){
 $('creatorLogin').hidden=stage!=='login';
 $('ownerForgotPassword').hidden=stage!=='login';
 $('creatorRecoverRequest').hidden=stage!=='recovery';
}
function showLogin(message=''){
 $('loginPanel').hidden=false;
 $('ownerPanel').hidden=true;
 stages('login');
 $('message').textContent=message;
 feedback();
}
function showOwner(){
 $('loginPanel').hidden=true;
 $('ownerPanel').hidden=false;
 $('message').textContent='';
 feedback();
 $('ownerPassword').value='';
 if(!installed){installCreatorConsole({client,installOwnerInbox});installed=true;}
}
async function verifyOwner(){
 const {data:{user},error:userError}=await client.auth.getUser();
 if(userError||!user||!user.email_confirmed_at||user.is_anonymous)return false;
 // Server-controlled and revocable membership, never user metadata or a UI flag.
 const {data,error}=await client.from('platform_admins')
  .select('user_id,role,active')
  .eq('user_id',user.id)
  .maybeSingle();
 if(error||!data||data.user_id!==user.id||data.role!=='platform_admin'||!data.active)return false;
 return true;
}
async function proceedIfAuthorized(){
 // DEV-only explicit choice: password + server-side Root membership, no MFA step.
 // Production host is rejected at module startup; never trust a browser-supplied role.
 if(!await verifyOwner())throw new Error('Accès Root non autorisé dans Supabase DEV.');
 await rememberVerifiedRootEmail();
 showOwner();
}
async function signOut(){
 await client.auth.signOut({scope:'local'}).catch(()=>{});
 installed=false;
 showLogin();
}
$('creatorLogin').addEventListener('submit',async event=>{
 event.preventDefault();
 if(verifying)return;
 verifying=true;
 $('ownerSubmit').disabled=true;
 feedback('Vérification de votre accès DEV…');
 // An orphaned browser auth lock can leave a successful server login pending in the old SDK.
 // Never grant access on a timeout: only display a useful recovery instruction.
 const watchdog=setTimeout(()=>{
  if(verifying)feedback('La vérification prend trop de temps. Fermez les autres onglets RestoManager, puis rechargez cette page et recommencez. Aucun accès administrateur n’est ouvert sans vérification complète.');
 },12000);
 try{
  const identifier=$('ownerUsername').value.trim().toLowerCase();
  const email=identifier==='rootdev'?rememberedEmail():identifier;
  const password=$('ownerPassword').value;
  if(identifier==='rootdev'&&!email){
   throw new Error('FIRST_DEVICE_LOGIN');
  }
  if(identifier==='root')throw new Error('PROD_ONLY_ALIAS');
  if(!emailPattern.test(email))throw new Error('Adresse email invalide.');
  const {error}=await client.auth.signInWithPassword({email,password});
  $('ownerPassword').value='';
  if(error)throw new Error('Identifiants incorrects ou compte DEV absent.');
  await proceedIfAuthorized();
 }catch(error){
  const firstDevice=error?.message==='FIRST_DEVICE_LOGIN';
  const oldAlias=error?.message==='PROD_ONLY_ALIAS';
  await signOut();
  showLogin(firstDevice
   ?'Première connexion sur cet appareil : utilisez votre email Root DEV et votre mot de passe une seule fois. Ensuite, vous pourrez vous connecter avec rootdev et ce même mot de passe.'
   :oldAlias
    ?'L’identifiant root est réservé à MAIN. Pour DEV, utilisez rootdev après une première connexion par email.'
    :'Connexion impossible. Vérifiez votre identifiant DEV et son autorisation Root. Le compte PROD est distinct.');
 }finally{
  clearTimeout(watchdog);
  verifying=false;
  $('ownerSubmit').disabled=false;
 }
});
$('ownerForgotPassword').addEventListener('click',()=>{
 const username=$('ownerUsername').value.trim().toLowerCase();
 $('ownerRecoverEmail').value=username==='rootdev'?rememberedEmail():(username==='root'?'':username);
 stages('recovery');
 feedback();
});
$('ownerBackToLogin').addEventListener('click',()=>showLogin());
$('creatorRecoverRequest').addEventListener('submit',async event=>{
 event.preventDefault();
 if(verifying)return;
 verifying=true;
 $('ownerRecoverSubmit').disabled=true;
 const email=$('ownerRecoverEmail').value.trim().toLowerCase();
 try{
  const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:recoveryRedirect});
  if(error)throw error;
  feedback('Si cette adresse dispose d’un compte DEV et que les emails sont configurés, un lien de récupération vous sera envoyé.');
 }catch{
  feedback('La récupération ne peut pas être envoyée pour le moment. Vérifiez la configuration SMTP et les URL autorisées dans Supabase DEV.');
 }finally{
  verifying=false;
  $('ownerRecoverSubmit').disabled=false;
 }
});
$('ownerLogout').addEventListener('click',async()=>{
 $('ownerLogout').disabled=true;
 try{
  await client.auth.signOut({scope:'local'});
  installed=false;
  showLogin('Vous êtes déconnecté.');
 }catch{
  $('message').textContent='Déconnexion momentanément impossible.';
 }finally{
  $('ownerLogout').disabled=false;
 }
});
(async()=>{
 try{
  if(await verifyOwner())await proceedIfAuthorized();
  else showLogin();
 }catch{
  await signOut();
  showLogin('Vérification de la session impossible. Réessayez.');
 }
})();
