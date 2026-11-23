import {supabaseEnvironment} from './restomanager-env.js?v=20261109-twins1';
// RM-017.3.3 — DEV-only Root access. No account creation, no privilege grant.
// Access is authorized exclusively by Supabase Auth + platform_admins RLS.
import {installOwnerInbox} from './creator-admin.js?v=20261114-rm006-root1';
import {installCreatorConsole} from './creator-console.js?v=20261123-rm01732';
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
if(supabaseEnvironment.name!=='DEV')throw new Error('Ce parcours Root est réservé à DEV.');
const client=createClient(
 supabaseEnvironment.url,
 supabaseEnvironment.publishableKey,
 {auth:{persistSession:true,autoRefreshToken:true}}
);
const $=id=>document.getElementById(id);
let verifying=false,installed=false,factorId=null,unverifiedFactorId=null;
const aliasKey='rm:rootdev:authorized-email-v1';
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Store only the verified Root email as a local username hint, never a password,
// factor, token, or role. On a new device, email login remains necessary.
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
 $('creatorMfaStep').hidden=stage!=='mfa';
 $('creatorMfaEnroll').hidden=stage!=='enroll';
 $('ownerMfaCancel').hidden=stage==='login'||stage==='recovery';
}
function showLogin(message=''){
 $('loginPanel').hidden=false;
 $('ownerPanel').hidden=true;
 stages('login');
 $('message').textContent=message;
 feedback();
 factorId=null;unverifiedFactorId=null;
 $('ownerTotpSecret').textContent='';
 $('ownerTotpQr').removeAttribute('src');
 $('ownerTotpQr').hidden=true;
 $('ownerEnrollInstructions').hidden=true;
}
function showOwner(){
 $('loginPanel').hidden=true;
 $('ownerPanel').hidden=false;
 $('message').textContent='';
 feedback();
 $('ownerPassword').value='';
 $('ownerMfaCode').value='';
 $('ownerEnrollCode').value='';
 $('ownerTotpSecret').textContent='';
 $('ownerTotpQr').removeAttribute('src');
 $('ownerTotpQr').hidden=true;
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
 if(!await verifyOwner())throw new Error('Accès Root non autorisé dans Supabase DEV.');
 const {data:aal,error:aalError}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
 if(aalError||!aal)throw new Error('Contrôle MFA indisponible.');
 if(aal.currentLevel==='aal2'){
  await rememberVerifiedRootEmail();
  showOwner();
  return;
 }
 const {data:factors,error:listError}=await client.auth.mfa.listFactors();
 if(listError)throw new Error('Impossible de consulter les facteurs MFA.');
 const verified=(factors?.totp||[]).find(item=>item.status==='verified');
 $('loginPanel').hidden=false;
 $('ownerPanel').hidden=true;
 if(verified){
  factorId=verified.id;
  stages('mfa');
  feedback('Entrez le code affiché par votre application d’authentification.');
 }else{
  stages('enroll');
  feedback('Votre compte Root DEV doit activer la double authentification.');
 }
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
   ?'Première connexion sur cet appareil : utilisez votre email Root DEV une fois, puis configurez la double authentification. Ensuite vous pourrez saisir rootdev.'
   :oldAlias
    ?'L’identifiant root est réservé à MAIN. Pour DEV, utilisez rootdev après une première connexion par email.'
    :'Connexion impossible. Vérifiez votre identifiant DEV et son autorisation Root. Le compte PROD est distinct.');
 }finally{
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
async function verifyFactor(id,code){
 if(!id||!/^\d{6}$/.test(code))throw new Error('Code MFA invalide.');
 const {data:challenge,error:challengeError}=await client.auth.mfa.challenge({factorId:id});
 if(challengeError||!challenge?.id)throw new Error('Challenge MFA impossible.');
 const {error}=await client.auth.mfa.verify({factorId:id,challengeId:challenge.id,code});
 if(error)throw new Error('Le code MFA n’a pas été validé.');
 const {data:aal,error:aalError}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
 if(aalError||aal?.currentLevel!=='aal2')throw new Error('MFA non vérifié.');
 if(!await verifyOwner())throw new Error('L’autorisation Root a changé.');
 await rememberVerifiedRootEmail();
 showOwner();
}
$('creatorMfaForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(verifying)return;
 verifying=true;
 $('ownerMfaSubmit').disabled=true;
 try{
  await verifyFactor(factorId,$('ownerMfaCode').value.trim());
 }catch{
  feedback('Le code de sécurité est incorrect ou a expiré. Réessayez.');
 }finally{
  verifying=false;
  $('ownerMfaSubmit').disabled=false;
 }
});
$('ownerStartEnroll').addEventListener('click',async()=>{
 if(verifying)return;
 verifying=true;
 $('ownerStartEnroll').disabled=true;
 try{
  if(!await verifyOwner())throw new Error('Accès refusé');
  const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'RestoManager Root DEV'});
  if(error||!data?.id||!data?.totp?.secret)throw new Error('Activation impossible');
  unverifiedFactorId=data.id;
  $('ownerTotpSecret').textContent=data.totp.secret;
  // QR is returned by Supabase Auth after a verified Root password and role check.
  const qr=String(data.totp.qr_code||'');
  if(/^data:image\/svg\+xml[;,]/.test(qr)||/^data:image\/png;base64,/.test(qr)){
   $('ownerTotpQr').src=qr;
   $('ownerTotpQr').hidden=false;
  }
  $('ownerEnrollInstructions').hidden=false;
  feedback('Ajoutez la clé dans votre application, puis saisissez son code à 6 chiffres.');
 }catch{
  feedback('La configuration MFA a échoué. Vérifiez les paramètres Supabase Auth DEV.');
  $('ownerStartEnroll').disabled=false;
 }finally{verifying=false;}
});
$('creatorMfaEnrollForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(verifying)return;
 verifying=true;
 $('ownerEnrollSubmit').disabled=true;
 try{
  await verifyFactor(unverifiedFactorId,$('ownerEnrollCode').value.trim());
 }catch{
  feedback('Activation MFA non confirmée. Vérifiez le code et réessayez.');
 }finally{
  verifying=false;
  $('ownerEnrollSubmit').disabled=false;
 }
});
$('ownerMfaCancel').addEventListener('click',()=>void signOut());
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
