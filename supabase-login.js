import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
// GitHub Pages may retain a stale browser-wide Supabase auth lock from an old PWA.
// Isolate its session from the legacy default key; Render keeps its working key.
const githubPages=location.hostname.endsWith('.github.io');
const authOptions=githubPages?{auth:{storageKey:'restomanager-ghpages-auth-v2',persistSession:true,autoRefreshToken:true}}:undefined;
const client=createClient('https://tnsrkargogckgtsxipwd.supabase.co','sb_publishable_7OHPvnA-iJWZAvVsg6tNwg_6YwtX7i7',authOptions);
// Public aliases only; staff credentials are validated by Supabase Auth.
const accounts=Object.freeze({
 'reception':{email:'reception@accounts.restomanager.example.com',role:'reception'},
 'admin-fb':{email:'admin-fb@accounts.restomanager.example.com',role:'fb_admin'}
});
const form=document.getElementById('login');
const button=document.getElementById('submit');
const message=document.getElementById('message');
const usernameInput=document.getElementById('username');
const passwordInput=document.getElementById('password');
let submitting=false;
const timeoutError=()=>Object.assign(new Error('Le service de connexion ne répond pas.'),{code:'AUTH_TIMEOUT'});
function withTimeout(promise,ms=15000){
 let timer;
 return Promise.race([
  Promise.resolve(promise),
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(timeoutError()),ms);})
 ]).finally(()=>clearTimeout(timer));
}
function showError(error){
 if(error?.code==='AUTH_TIMEOUT'||error?.name==='AbortError'||error?.message?.includes('fetch')){
  message.textContent='Le service de connexion ne répond pas. Vérifiez votre réseau et réessayez.';
 }else{
  message.textContent='Connexion impossible. Vérifiez vos identifiants ou contactez votre administrateur.';
 }
}
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(submitting)return;
 submitting=true;
 button.disabled=true;
 message.textContent='Connexion en cours…';
 const account=Object.hasOwn(accounts,usernameInput.value.trim().toLowerCase())?accounts[usernameInput.value.trim().toLowerCase()]:null;
 try{
  if(!account)throw new Error('Unknown username');
  // signInWithPassword already returns the authenticated user.
  // Avoid a second /user request that can stall on browser session locks.
  const {data:authData,error}=await withTimeout(client.auth.signInWithPassword({email:account.email,password:passwordInput.value}));
  if(error)throw error;
  const user=authData?.user;
  if(!user||!authData?.session)throw new Error('Invalid session');
  const {data,error:profileError}=await withTimeout(client.from('staff_profiles').select('role,display_name,active').eq('user_id',user.id).single());
  if(profileError||!data?.active||data.role!==account.role){
   message.textContent='Compte non autorisé. Contactez votre administrateur.';
   // Only revoke a validated but unauthorized account, without hanging the UI.
   void withTimeout(client.auth.signOut(),5000).catch(()=>{});
   return;
  }
  window.location.assign('v3-connected.html');
 }catch(error){
  showError(error);
 }finally{
  submitting=false;
  button.disabled=false;
 }
});
// Do not race an existing-session redirect against a manual login attempt.
async function resumeExistingSession(){
 try{
  const {data:{session},error:sessionError}=await withTimeout(client.auth.getSession(),7000);
  if(submitting||sessionError||!session?.user)return;
  const {data:profile,error:profileError}=await withTimeout(client.from('staff_profiles').select('role,active').eq('user_id',session.user.id).single(),7000);
  if(submitting)return;
  if(!profileError&&profile?.active&&['reception','fb_admin'].includes(profile.role)){
   window.location.replace('v3-connected.html');
  }
 }catch{
  // Keep login available when stored session cannot be checked.
 }
}
// Avoid an automatic getSession lock competing with a manual sign-in on GitHub Pages.
if(!githubPages)void resumeExistingSession();
