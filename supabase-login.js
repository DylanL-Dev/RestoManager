import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
const client=createClient('https://tnsrkargogckgtsxipwd.supabase.co','sb_publishable_7OHPvnA-iJWZAvVsg6tNwg_6YwtX7i7');
const form=document.getElementById('login'),button=document.getElementById('submit'),message=document.getElementById('message');
form.addEventListener('submit',async event=>{
 event.preventDefault();button.disabled=true;message.textContent='Connexion en cours…';
 try {
  const {error}=await client.auth.signInWithPassword({email:document.getElementById('email').value.trim(),password:document.getElementById('password').value});
  if(error) throw error;
  const {data, error:profileError}=await client.from('staff_profiles').select('role,display_name,active').single();
  if(profileError||!data?.active||!['reception','fb_admin'].includes(data.role)){
   await client.auth.signOut();message.textContent='Compte non autorisé. Contactez votre administrateur.';return;
  }
  message.textContent='Connexion validée ('+(data.role==='fb_admin'?'F&B':'Réception')+'). L’espace de service sera ouvert après intégration.';
 } catch(_error){message.textContent='Connexion impossible. Vérifiez vos identifiants ou contactez votre administrateur.';}
 finally{button.disabled=false;}
});