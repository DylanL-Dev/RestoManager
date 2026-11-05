import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
const client=createClient('https://tnsrkargogckgtsxipwd.supabase.co','sb_publishable_7OHPvnA-iJWZAvVsg6tNwg_6YwtX7i7');
const status=document.getElementById('status'),panel=document.getElementById('panel');
async function checkAccess(){
 try{
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user){status.textContent='Connexion nécessaire. Utilisez le compte administrateur F&B.';return;}
  const {data,error:profileError}=await client.from('staff_profiles').select('role,active').eq('user_id',user.id).single();
  if(profileError||data?.role!=='fb_admin'||data.active!==true){
   status.textContent='Accès refusé : compte administrateur F&B requis.';return;
  }
  status.textContent='Administrateur F&B identifié.';
  panel.hidden=false;
 }catch{status.textContent='Impossible de vérifier vos autorisations.';}
}
document.getElementById('resetForm').addEventListener('submit',e=>{
 e.preventDefault();
 // No password is sent until the protected server endpoint is deployed and tested.
 status.textContent='Réinitialisation non activée : contactez l’administrateur Supabase.';
});
document.getElementById('logout').addEventListener('click',async()=>{
 await client.auth.signOut();location.replace('login.html');
});
checkAccess();