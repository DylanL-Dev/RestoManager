import {supabaseEnvironment} from './restomanager-env.js?v=20261109-twins1';
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
if(supabaseEnvironment.name!=='DEV')throw new Error('Récupération réservée à DEV.');
const client=createClient(
 supabaseEnvironment.url,supabaseEnvironment.publishableKey,
 {auth:{persistSession:true,autoRefreshToken:true}}
);
const $=id=>document.getElementById(id);
const initialSearch=new URLSearchParams(location.search);
const initialHash=new URLSearchParams(location.hash.replace(/^#/,''));
const markedRecovery=initialSearch.get('type')==='recovery'||initialHash.get('type')==='recovery';
const markedInvite=initialSearch.get('invitation')==='1'||initialHash.get('type')==='invite';
let authorized=false,submitting=false;
function setStatus(message){$('creatorRecoveryMessage').textContent=message;}
async function acceptSession(){
 const {data:{user},error}=await client.auth.getUser();
 if(error||!user||!user.email_confirmed_at)return false;
 authorized=true;
 $('creatorPasswordRecovery').hidden=false;
 setStatus('Lien vérifié. Choisissez un mot de passe de 12 caractères minimum.');
 // Remove any temporary Auth credentials from the address bar after processing.
 history.replaceState(null,'',location.pathname);
 return true;
}
client.auth.onAuthStateChange((event,session)=>{
 if(session&&(event==='PASSWORD_RECOVERY'||(markedInvite&&event==='SIGNED_IN'))){
  // Verify the Auth user server-side before enabling any password update.
  void acceptSession();
 }
});
(async()=>{
 try{
  const {data:{session}}=await client.auth.getSession();
  if(session&&(markedRecovery||markedInvite)){
   if(await acceptSession())return;
  }
  setStatus('Ce lien n’est pas valide ou a expiré. Retournez à la connexion pour demander un nouveau lien.');
 }catch{
  setStatus('Vérification indisponible. Réessayez avec un lien de récupération DEV récent.');
 }
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
  const {error}=await client.auth.updateUser({password:p});
  if(error)throw error;
  $('creatorNewPassword').value='';$('creatorConfirmPassword').value='';
  $('creatorPasswordRecovery').hidden=true;authorized=false;
  await client.auth.signOut({scope:'local'});
  setStatus('Mot de passe DEV enregistré. Reconnectez-vous avec votre email Root puis configurez la double authentification.');
 }catch{
  setStatus('Le nouveau mot de passe n’a pas pu être enregistré. Demandez un nouveau lien de récupération.');
 }finally{
  submitting=false;$('creatorRecoverySubmit').disabled=false;
 }
});