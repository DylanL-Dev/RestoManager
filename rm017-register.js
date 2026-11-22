'use strict';
/* RM-017.2: DEV-only Auth flow. No service_role key, no direct SQL writes, no PROD routing. */
import {supabaseEnvironment} from './restomanager-env.js?v=20261109-twins1';
const $=id=>document.getElementById(id);
const button=$('submitRegistration'),notice=$('registrationStatus'),done=$('registrationDone');
const isDev=(location.hostname.endsWith('.onrender.com')||location.hostname==='localhost'||location.hostname==='127.0.0.1')&&supabaseEnvironment.name==='DEV';
let client=null,busy=false;
function message(text){if(notice)notice.textContent=text;}
async function connect(){
 if(client)return client;
 // Import only when an operator-enabled DEV signup is in use.
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm');
 client=createClient(supabaseEnvironment.url,supabaseEnvironment.publishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
 });
 return client;
}
function details(){
 const Model=window.RestoSignupDraft;
 const type=document.querySelector('input[name="businessType"]:checked')?.value||'';
 const data={name:$('businessName').value,city:$('businessCity').value,email:$('businessEmail').value};
 if(!Model||Model.validateType(type)||Object.keys(Model.validateDetails(data)).length)throw Error('Vérifiez les informations de votre établissement.');
 return Model.preview(type,data);
}
function checkPassword(){
 const pass=$('registrationPassword').value,confirmed=$('registrationPasswordConfirm').value;
 if(pass.length<12||pass.length>128)throw Error('Choisissez au moins 12 caractères pour votre mot de passe.');
 if(pass!==confirmed)throw Error('Les mots de passe ne correspondent pas.');
 return pass;
}
async function finishVerifiedAccount(api,user){
 if(!user||!user.email_confirmed_at)return;
 const m=user.user_metadata||{};
 const name=typeof m.rm017_name==='string'?m.rm017_name:'';
 const city=typeof m.rm017_city==='string'?m.rm017_city:'';
 const kind=typeof m.rm017_type==='string'?m.rm017_type:'';
 const model=window.RestoSignupDraft;
 if(!model||model.validateType(kind)||Object.keys(model.validateDetails({name,city,email:user.email||''})).length){
  message('Compte confirmé, mais informations incomplètes. Contactez l’assistance avant la configuration.');return;
 }
 message('Email confirmé. Préparation de votre établissement DEV…');
 const {data,error}=await api.rpc('rm017_complete_signup_v1',{p_name:name,p_city:city,p_type:kind});
 if(error)throw Error(error.code==='23505'?'Ce compte est déjà lié à un établissement. Connectez-vous.':'La création sécurisée a été refusée. Contactez l’assistance.');
 if(!data?.restaurant_id||data.status!=='configuration_required')throw Error('La création de l’établissement n’a pas été confirmée.');
 $('signupDraft').hidden=true;
 done.hidden=false;
 $('setupTitle').textContent='Bienvenue sur RestoManager !';
 $('setupSubtitle').textContent='Votre email est confirmé. Configurez maintenant votre premier service.';
 $('stepCount').textContent='03 / 03';
 $('progressTrack').setAttribute('aria-valuenow','3');
 $('progressFill').style.width='100%';
 done.focus({preventScroll:true});
}
async function onSignup(){
 if(busy||button.disabled)return;
 busy=true;button.disabled=true;let password='';
 try{
  const profile=details();password=checkPassword();
  message('Envoi de votre demande de confirmation…');
  const api=await connect();
  const canonical=new URL('/inscription.html?verified=1',location.origin).href;
  const {data,error}=await api.auth.signUp({
   email:profile.email,password,
   options:{emailRedirectTo:canonical,data:{
    rm017_name:profile.name,rm017_city:profile.city,rm017_type:profile.type
   }}
  });
  if(error)throw Error('Impossible de lancer l’inscription. Vérifiez l’adresse, les limitations d’email et réessayez.');
  if(data?.session){
   // Fail closed if Auth Confirm Email is unexpectedly disabled.
   await api.auth.signOut({scope:'local'});
   throw Error('Confirmation email désactivée côté Supabase DEV. Inscription suspendue.');
  }
  message('Si l’adresse est autorisée, un message de confirmation sera envoyé. Vérifiez votre boîte mail avant de revenir ici.');
 }catch(e){message(e.message||'Inscription momentanément indisponible.');}
 finally{
  password='';$('registrationPassword').value='';$('registrationPasswordConfirm').value='';
  busy=false;button.disabled=false;
 }
}
async function start(){
 if(!button||!notice||!done)return;
 if(!isDev){message('Inscription réservée à DEV.');return;}
 let runtime;
 try{
  const response=await fetch('rm017-runtime.json',{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('runtime unavailable');
  runtime=await response.json();
 }catch{message('Paramétrage d’inscription indisponible.');return;}
 if(runtime?.schema!==1||runtime?.channel!=='dev'||runtime?.enabled!==true||
    runtime?.confirmationEmailRequired!==true||runtime?.redirectOrigin!==location.origin){
  message('Inscription réelle non ouverte : vérification du service email, des redirections et de la sécurité en cours.');
  return;
 }
 button.disabled=false;
 message('Inscription de test DEV uniquement · Confirmation email obligatoire · Aucun portail public activé.');
 button.addEventListener('click',onSignup);
 // After the user follows the Supabase confirmation link, an authenticated
 // session is returned to this same DEV page; provisioning is then atomic.
 try{
  const api=await connect();
  const {data,error}=await api.auth.getUser();
  if(!error&&data?.user?.email_confirmed_at)await finishVerifiedAccount(api,data.user);
 }catch(e){message(e.message||'Impossible de finaliser automatiquement. Reconnectez-vous.');}
}
void start();
