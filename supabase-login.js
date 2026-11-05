import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
const client=createClient('https://tnsrkargogckgtsxipwd.supabase.co','sb_publishable_7OHPvnA-iJWZAvVsg6tNwg_6YwtX7i7');
// Public technical aliases only. No real employee emails or passwords are embedded.
// Accounts must be created and confirmed by an admin in Supabase Auth.
const accounts=Object.freeze({
 'reception':{email:'reception@accounts.restomanager.example.com',role:'reception'},
 'admin-fb':{email:'admin-fb@accounts.restomanager.example.com',role:'fb_admin'}
});
const form=document.getElementById('login'),button=document.getElementById('submit'),message=document.getElementById('message');
form.addEventListener('submit',async event=>{
 event.preventDefault();button.disabled=true;message.textContent='Connexion en cours…';
 const username=document.getElementById('username').value.trim().toLowerCase();
 const account=Object.hasOwn(accounts,username)?accounts[username]:null;
 try {
  if(!account) throw new Error('Unknown username');
  const {error}=await client.auth.signInWithPassword({email:account.email,password:document.getElementById('password').value});
  if(error) throw error;
  const {data:{user},error:userError}=await client.auth.getUser();
  if(userError||!user) throw new Error('Invalid session');
  const {data,error:profileError}=await client.from('staff_profiles').select('role,display_name,active').eq('user_id',user.id).single();
  if(profileError||!data?.active||data.role!==account.role){
   await client.auth.signOut();
   message.textContent='Compte non autorisé. Contactez votre administrateur.';return;
  }
  // Navigate only after the server-authorized profile matches the login role.
  window.location.assign('reservations-preview.html');

 } catch(_error){
  await client.auth.signOut();
  message.textContent='Connexion impossible. Vérifiez vos identifiants ou contactez votre administrateur.';
 } finally{button.disabled=false;}
});
 // Skip the login form only when an existing session still has an active staff role.
async function resumeExistingSession(){
 try{
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)return;
  const {data:profile,error:profileError}=await client.from('staff_profiles')
   .select('role,active').eq('user_id',user.id).single();
  if(!profileError&&profile?.active&&['reception','fb_admin'].includes(profile.role)){
   window.location.replace('reservations-preview.html');
  }
 }catch{
  // Leave the login form available if session validation fails.
 }
}
void resumeExistingSession();
