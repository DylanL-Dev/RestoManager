import {supabaseEnvironment} from './restomanager-env.js?v=20261109-twins1';
// Creator authentication shell. Never grants admin rights; Supabase RLS does.
import {installOwnerInbox} from './creator-admin.js?v=20261114-rm006-root1';
import {installCreatorConsole} from './creator-console.js?v=20261114-rm006-root1';
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
const client=createClient(
 supabaseEnvironment.url,
 supabaseEnvironment.publishableKey,
 {auth:{persistSession:true,autoRefreshToken:true}}
);
const $=id=>document.getElementById(id);
// Temporary username alias. Auth still requires a pre-provisioned user and an
// independently set secret, NEVER a plaintext password in the repository.
const ROOT_AUTH_EMAIL='root@accounts.restomanager.example.com';
let verifying=false;
function showOwner(){
 $('loginPanel').hidden=true;
 $('ownerPanel').hidden=false;
 $('message').textContent='';
 installCreatorConsole({client,installOwnerInbox});
}
function showLogin(message=''){
 $('loginPanel').hidden=false;
 $('ownerPanel').hidden=true;
 $('message').textContent=message;
}
async function verifyOwner(){
 const {data:{user},error:userError}=await client.auth.getUser();
 if(userError||!user)return false;
 // Only this signed-in, active administrator's own row is visible via RLS.
 // This check gates the UI, but future report reads ALSO need database-level
 // admin authorization, not trust in a JavaScript boolean.
 const {data,error}=await client.from('platform_admins')
  .select('user_id,role,active')
  .eq('user_id',user.id)
  .maybeSingle();
 if(error||!data||data.user_id!==user.id||data.role!=='platform_admin'||!data.active)return false;
 return true;
}
$('creatorLogin').addEventListener('submit',async event=>{
 event.preventDefault();
 if(verifying)return;
 verifying=true;
 const button=$('ownerSubmit');button.disabled=true;
 $('message').textContent='Vérification de votre accès…';
 try{
  if($('ownerUsername').value.trim().toLowerCase()!=='root')throw new Error('Compte non autorisé');
  const email=ROOT_AUTH_EMAIL;
  const password=$('ownerPassword').value;
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error||!await verifyOwner())throw new Error('Accès refusé');
  $('ownerPassword').value='';
  showOwner();
 }catch{
  await client.auth.signOut({scope:'local'}).catch(()=>{});
  $('ownerPassword').value='';
  showLogin('Connexion impossible. Vérifiez vos identifiants ou contactez l’administration de la plateforme.');
 }finally{
  verifying=false;button.disabled=false;
 }
});
$('ownerLogout').addEventListener('click',async()=>{
 $('ownerLogout').disabled=true;
 try{
  const {error}=await client.auth.signOut({scope:'local'});
  if(error)throw error;
  showLogin('Vous êtes déconnecté.');
 }catch{
  $('message').textContent='Déconnexion impossible. Vérifiez la connexion.';
 }finally{$('ownerLogout').disabled=false}
});
(async()=>{
 try{
  if(await verifyOwner())showOwner();
  else showLogin();
 }catch{showLogin('Vérification momentanément indisponible.')}
})();
