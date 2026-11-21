import {BookingError} from './client.mjs?v=20261121-rm01510';
let loading;
function load(doc,win){
 if(win.turnstile)return Promise.resolve(win.turnstile);
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{
  const script=doc.createElement('script'),timeout=setTimeout(()=>fail(),15000);
  const fail=()=>{clearTimeout(timeout);script.remove();loading=null;reject(new BookingError('La vérification est indisponible. Réessayez dans quelques instants.',{code:'CHALLENGE'}));};
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.referrerPolicy='no-referrer';script.onerror=fail;script.onload=()=>{clearTimeout(timeout);if(win.turnstile)resolve(win.turnstile);else fail();};doc.head.append(script);
 });return loading;
}
export function createVerification({dialog,siteKey,doc=document,win=window}){
 return ()=>new Promise((resolve,reject)=>{
  let finished=false,widget,provider;
  const host=dialog.querySelector('[data-verification-widget]'),status=dialog.querySelector('[role=status]');
  const finish=(error,token)=>{if(finished)return;finished=true;dialog.removeEventListener('close',closed);if(widget!==undefined)provider?.remove(widget);host.replaceChildren();dialog.close();if(error)reject(error);else resolve(token);};
  const closed=()=>finish(new BookingError('Vérification annulée. Votre choix est conservé.',{code:'CHALLENGE'}));
  dialog.addEventListener('close',closed);dialog.querySelector('[data-verification-cancel]').onclick=()=>dialog.close();status.textContent='Préparation de la vérification…';dialog.showModal();
  void load(doc,win).then(value=>{if(finished)return;provider=value;status.textContent='Terminez la vérification pour continuer.';widget=provider.render(host,{sitekey:siteKey,action:'reservation',language:'fr',size:'compact',theme:'auto','response-field':false,callback:token=>typeof token==='string'&&token.length>0&&token.length<=2048?finish(null,token):closed(),'error-callback':()=>finish(new BookingError('La vérification n’a pas abouti. Réessayez.',{code:'CHALLENGE'})),'expired-callback':()=>finish(new BookingError('La vérification a expiré. Réessayez.',{code:'CHALLENGE'}))});}).catch(error=>finish(error));
 });
}
