'use strict';
/* RM-017.2.1: invitation-only DEV pilot, with fail-closed browser and DB gates. */
import {supabaseEnvironment} from './restomanager-env.js?v=20261109-twins1';
const $=id=>document.getElementById(id);
const button=$('submitRegistration'),notice=$('registrationStatus'),done=$('registrationDone');
const verification=$('registrationVerification');
const isDev=(location.hostname.endsWith('.onrender.com')||location.hostname==='localhost'||location.hostname==='127.0.0.1')&&supabaseEnvironment.name==='DEV';
let client=null,busy=false,challengeToken='',captchaWidget=null;
const runtimeURL='rm017-runtime.json';
const captchaScript='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const message=text=>{if(notice)notice.textContent=text;};
function safeUrl(){
 // Never keep an OTP fragment or callback error in the address bar.
 if(location.hash||location.search)history.replaceState(null,'',location.pathname);
}
function isConfirmationReturn(){
 const query=new URLSearchParams(location.search);
 const fragment=new URLSearchParams(location.hash.slice(1));
 return query.get('verified')==='1'||query.has('error_code')||
   fragment.has('access_token')||fragment.has('error_code');
}
function showVerification(title,details){
 if(!verification)return;
 $('signupDraft').hidden=true;
 verification.hidden=false;done.hidden=true;
 $('verificationTitle').textContent=title;
 $('verificationText').textContent=details;
 verification.focus({preventScroll:true});
}
async function connect(){
 if(client)return client;
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm');
 client=createClient(supabaseEnvironment.url,supabaseEnvironment.publishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
 });
 return client;
}
function details(){
 const Model=window.RestoSignupDraft;
 const type=document.querySelector('input[name="businessType"]:checked')?.value||'';
 const draft={name:$('businessName').value,city:$('businessCity').value,email:$('businessEmail').value};
 if(!Model||Model.validateType(type)||Object.keys(Model.validateDetails(draft)).length)throw Error('Vérifiez les informations de votre établissement.');
 return Model.preview(type,draft);
}
function checkPassword(){
 const pass=$('registrationPassword').value,confirmed=$('registrationPasswordConfirm').value;
 if(pass.length<12||pass.length>128)throw Error('Choisissez au moins 12 caractères pour votre mot de passe.');
 if(pass!==confirmed)throw Error('Les mots de passe ne correspondent pas.');
 return pass;
}
function validSiret(value){
 if(!/^[0-9]{14}$/.test(value))return false;
 const digits=[...value].map(Number);
 const sum=digits.reduce((total,d,i)=>{
   const v=i%2===0?d*2:d;
   return total+(v>9?v-9:v);
 },0);
 return sum%10===0||(value.startsWith('356000000')&&digits.reduce((x,y)=>x+y,0)%5===0);
}
async function verifyProfessionalSiret(profile,siret){
 const state=$('siretVerificationStatus');
 state.dataset.status='';
 state.textContent='Vérification de votre SIRET auprès du registre officiel…';
 const response=await fetch(supabaseEnvironment.url+'/functions/v1/rm017-siret',{
  method:'POST',
  headers:{'Content-Type':'application/json','apikey':supabaseEnvironment.publishableKey},
  body:JSON.stringify({email:profile.email,type:profile.type,siret}),
  cache:'no-store',credentials:'omit'
 });
 let body={};
 try{body=await response.json()}catch{}
 if(!response.ok||body?.verified!==true||body?.siret!==siret){
  state.dataset.status='error';
  state.textContent=(response.status===422?'Ce SIRET n’a pas pu être confirmé automatiquement. ':
   'Cette inscription ne peut pas être validée pour le moment. ')+
   'Contactez l’assistance du pilote si nécessaire.';
  throw Error(state.textContent);
 }
 state.dataset.status='verified';
 state.textContent='SIRET vérifié : '+String(body.legalName||'Établissement').slice(0,160)+
   ' · '+String(body.city||'').slice(0,80)+
   '. L’autorisation du responsable reste soumise à validation.';
 return body;
}
function resetCaptcha(){
 challengeToken='';
 button.disabled=true;
 try{if(captchaWidget!==null)window.turnstile?.reset(captchaWidget);}catch{
  message('La vérification anti-robot doit être rechargée pour réessayer.');
 }
}
async function loadCaptcha(siteKey){
 const container=$('registrationCaptcha');
 if(!container)return false;
 container.hidden=false;
 await new Promise((resolve,reject)=>{
  if(window.turnstile?.render){resolve();return;}
  const script=document.createElement('script');
  script.src=captchaScript;script.async=true;
  script.onload=resolve;script.onerror=()=>reject(Error('captcha unavailable'));
  document.head.append(script);
 });
 if(!window.turnstile?.render)throw Error('captcha unavailable');
 captchaWidget=window.turnstile.render(container,{
  sitekey:siteKey,theme:'light',language:'fr',
  callback:token=>{
   challengeToken=typeof token==='string'?token:'';
   button.disabled=!challengeToken||busy;
   if(challengeToken)message('Contrôle anti-robot validé. Réservé aux comptes de test invités.');
  },
  'expired-callback':()=>{challengeToken='';button.disabled=true;message('Vérification expirée : recommencez le contrôle anti-robot.');},
  'error-callback':()=>{challengeToken='';button.disabled=true;message('Vérification anti-robot indisponible. Réessayez.');}
 });
 return captchaWidget!==null&&captchaWidget!==undefined;
}
async function finishVerifiedAccount(api,user){
 if(!user?.email_confirmed_at){
  showVerification('Confirmation nécessaire','Ce lien n’a pas confirmé votre adresse. Vérifiez le message reçu, puis réessayez.');return;
 }
 const m=user.user_metadata||{};
 const name=typeof m.rm017_name==='string'?m.rm017_name:'';
 const city=typeof m.rm017_city==='string'?m.rm017_city:'';
 const type=typeof m.rm017_type==='string'?m.rm017_type:'';
 const Model=window.RestoSignupDraft;
 if(!Model||Model.validateType(type)||Object.keys(Model.validateDetails({name,city,email:user.email||''})).length){
  showVerification('Profil incomplet','Compte confirmé, mais informations insuffisantes. Contactez l’assistance avant la configuration.');return;
 }
 showVerification('Confirmation reçue','Adresse vérifiée. Création sécurisée de votre établissement de test…');
 // Server verifies JWT identity, confirmed email and an unconsumed pilot invite.
 const {data,error}=await api.rpc('rm017_complete_signup_v1',{p_name:name,p_city:city,p_type:type});
 if(error){
  const known=error.code==='23505'?'Ce compte appartient déjà à un établissement. Connectez-vous.':
   'L’inscription pilote a été refusée : adresse non invitée, invitation expirée ou pilote fermé.';
  showVerification('Inscription non finalisée',known);return;
 }
 if(!data?.restaurant_id||data.status!=='configuration_required'){
  showVerification('Inscription non finalisée','La création n’a pas été confirmée. Contactez l’assistance.');return;
 }
 verification.hidden=true;
 done.hidden=false;
 $('setupTitle').textContent='Bienvenue sur RestoManager !';
 $('setupSubtitle').textContent='Votre email est confirmé. Configurez maintenant votre premier service.';
 $('stepCount').textContent='03 / 03';
 $('progressTrack').setAttribute('aria-valuenow','3');
 $('progressFill').style.width='100%';
 done.focus({preventScroll:true});
}
async function onSignup(){
 if(busy||button.disabled||!challengeToken)return;
 busy=true;button.disabled=true;
 try{
  const profile=details(),password=checkPassword(),token=challengeToken;
  const siret=$('businessSiret').value.trim();
  $('siretError').hidden=true;$('siretError').textContent='';
  if(!validSiret(siret)){
   $('siretError').hidden=false;
   $('siretError').textContent='SIRET invalide : vérifiez les 14 chiffres et la clé de contrôle.';
   throw Error('Le SIRET doit comporter 14 chiffres valides.');
  }
  challengeToken='';
  // No account is created before this official server-side verification.
  await verifyProfessionalSiret(profile,siret);
  message('SIRET vérifié. Envoi de votre demande de confirmation email…');
  const api=await connect();
  const canonical=new URL('/inscription.html?verified=1',location.origin).href;
  const {data,error}=await api.auth.signUp({
   email:profile.email,password,
   options:{emailRedirectTo:canonical,captchaToken:token,
    data:{rm017_name:profile.name,rm017_city:profile.city,rm017_type:profile.type,rm017_siret:siret}}
  });
  if(error){
   if(error.code==='over_email_send_rate_limit'||error.status===429)throw Error('Limite d’envoi atteinte. Réessayez plus tard.');
   if(error.code==='captcha_failed')throw Error('Vérification anti-robot refusée. Recommencez.');
   throw Error('L’inscription n’a pas pu être envoyée. Vérifiez votre email ou contactez l’assistance du pilote.');
  }
  if(data?.session){
   // When Confirm Email is OFF Supabase may create an immediate session. Fail closed.
   await api.auth.signOut({scope:'local'});
   throw Error('La confirmation email est désactivée dans Supabase DEV : pilote suspendu.');
  }
  message('Si l’adresse est autorisée, un email de confirmation a été demandé. Cliquez sur son lien pour terminer la création.');
 }catch(error){
  message(error?.message||'Inscription momentanément indisponible.');
 }finally{
  $('registrationPassword').value='';$('registrationPasswordConfirm').value='';
  busy=false;resetCaptcha();
 }
}
async function start(){
 if(!button||!notice||!done||!verification)return;
 const callback=isConfirmationReturn();
 if(!isDev){message('Inscription réservée à DEV.');if(callback){showVerification('Pilote inaccessible','Cette adresse ne peut pas confirmer une inscription DEV.');safeUrl();}return;}
 let runtime;
 try{
  const response=await fetch(runtimeURL,{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('configuration unavailable');
  runtime=await response.json();
 }catch{message('Paramétrage d’inscription indisponible.');if(callback){showVerification('Pilote indisponible','Configuration DEV inaccessible.');safeUrl();}return;}
 const key=runtime?.turnstileSiteKey;
 const validKey=typeof key==='string'&&/^0x[a-zA-Z0-9_-]{16,80}$/.test(key);
 if(runtime?.schema!==2||runtime?.channel!=='dev'||runtime?.enabled!==true||
    runtime?.pilotOnly!==true||runtime?.confirmationEmailRequired!==true||
    runtime?.captchaRequired!==true||!validKey||
    runtime?.redirectOrigin!==location.origin){
  message('Pilote privé fermé : contrôle de la confirmation email, de SMTP, du CAPTCHA et des invitations en cours.');
  if(callback){showVerification('Pilote temporairement fermé','Le lien ne peut pas être finalisé tant que les inscriptions de test sont suspendues.');safeUrl();}
  return;
 }
 $('pilotBannerText').textContent='Pilote privé sur invitation · Email confirmé et CAPTCHA obligatoires';
 $('dataDisclaimer').textContent='Utilisez uniquement une adresse email de test autorisée par RestoManager. Aucune réservation ne sera ouverte automatiquement.';
 $('signupDisclaimer').textContent='Inscription pilote DEV : données transmises uniquement à Supabase DEV après vérification anti-robot.';
 if(callback){
  const q=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));
  if(q.has('error_code')||hash.has('error_code')){
   showVerification('Lien invalide ou expiré','Demandez un nouveau message de confirmation à l’assistance du pilote.');
   safeUrl();return;
  }
  showVerification('Vérification de l’email','Validation de votre session auprès de Supabase DEV…');
  try{
   const api=await connect();
   const {data,error}=await api.auth.getUser();
   if(error||!data?.user){showVerification('Confirmation non reconnue','Le lien est expiré ou la session n’a pas pu être validée. Réessayez depuis le message reçu.');}
   else await finishVerifiedAccount(api,data.user);
  }catch{showVerification('Confirmation non finalisée','Une erreur a empêché la création de votre espace de test. Contactez l’assistance.');}
  finally{safeUrl();}
  return;
 }
 let loadingCaptcha=false;
 async function onPreview(){
  if(loadingCaptcha||captchaWidget!==null)return;
  loadingCaptcha=true;
  try{
   await loadCaptcha(key);
   message('Inscription pilote sur invitation uniquement · Email confirmé obligatoire.');
  }catch{
   button.disabled=true;
   message('Contrôle anti-robot non disponible. Le formulaire d’inscription reste fermé.');
  }finally{loadingCaptcha=false;}
 }
 button.addEventListener('click',onSignup);
 // A real Turnstile widget must render only when its container is visible.
 window.addEventListener('restomanager:registration-preview',()=>void onPreview());
 if(!$('stepPreview').hidden)void onPreview();
 else message('Pilote privé : choisissez d’abord votre établissement. La vérification anti-robot suit à l’étape finale.');
}
void start();
