// Creator authentication shell. Never grants admin rights; Supabase RLS does.
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
const client=createClient(
 'https://tnsrkargogckgtsxipwd.supabase.co',
 'sb_publishable_7OHPvnA-iJWZAvVsg6tNwg_6YwtX7i7',
 {auth:{persistSession:true,autoRefreshToken:true}}
);
const $=id=>document.getElementById(id);
let verifying=false;
function showOwner(){
 $('loginPanel').hidden=true;
 $('ownerPanel').hidden=false;
 $('message').textContent='';
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
  const email=$('ownerEmail').value.trim();
  const password=$('ownerPassword').value;
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error||!await verifyOwner())throw new Error('Accès refusé');
  $('ownerPassword').value='';
  showOwner();
 }catch{
  await client.auth.signOut({scope:'local'}).catch(()=>{});
  $('ownerPassword').value='';
  showLogin('Connexion impossible ou compte Créateur non activé. Vérifiez vos identifiants.');
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
