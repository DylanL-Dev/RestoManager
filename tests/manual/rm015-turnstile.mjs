import {publicRuntime} from '../../reservation/environment.mjs';
import {createVerification} from '../../reservation/turnstile.mjs';

const status=document.getElementById('checkStatus'),button=document.getElementById('checkProtection');
async function start(){
 try{
  if(location.origin!=='https://restomanager-v3-supabase-integration.onrender.com')throw Error('Ce contrôle est réservé au clone DEV.');
  const response=await fetch('../../reservation/runtime.json',{cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('La configuration DEV est indisponible.');
  const runtime=publicRuntime(await response.json(),location.href);if(runtime.channel!=='dev'||!runtime.activated||!runtime.turnstileSiteKey)throw Error('La vérification n’est pas encore configurée sur DEV.');
  const verify=createVerification({dialog:document.getElementById('verificationDialog'),siteKey:runtime.turnstileSiteKey});
  status.textContent='Vous pouvez lancer le contrôle. Aucune réservation ne sera envoyée.';button.disabled=false;
  button.addEventListener('click',async()=>{
   button.disabled=true;status.textContent='Terminez la vérification Cloudflare pour continuer.';
   try{
    const challenge=await verify();
    const checked=await fetch(runtime.api,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify-widget',restaurant:'verification-widget',challenge})});
    const result=await checked.json();
    if(!checked.ok||result.environment!=='dev'||result.data?.verified!==true)throw Error(result.error?.code==='RATE'?'Plusieurs contrôles ont été lancés. Patientez quelques minutes avant de réessayer.':'La vérification n’a pas abouti. Réessayez ou signalez ce résultat.');
    status.textContent='La protection Cloudflare fonctionne. Le serveur a confirmé la vérification. Aucune réservation n’a été créée.';button.textContent='Vérifier à nouveau';
   }catch(error){status.textContent=/annulée/.test(error.message||'')?'Le contrôle a été annulé. Vous pouvez le relancer.':error.message||'Le contrôle est indisponible. Réessayez dans quelques instants.';}
   finally{button.disabled=false;}
  });
 }catch(error){status.textContent=error.message||'Ce contrôle est indisponible.';button.disabled=true;}
}
void start();
