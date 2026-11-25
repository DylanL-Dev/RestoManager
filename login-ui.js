// RM-SEC-04: externalised verbatim from login.html so the page can use script-src 'self'.
document.getElementById("forgot").addEventListener("click",function(){const panel=document.getElementById("recovery");panel.hidden=!panel.hidden;this.setAttribute("aria-expanded",String(!panel.hidden));});
const toggle=document.getElementById('togglePassword'),password=document.getElementById('password');
toggle.addEventListener('click',()=>{const revealed=password.type==='password';password.type=revealed?'text':'password';toggle.textContent=revealed?'Masquer':'Afficher';toggle.setAttribute('aria-pressed',String(revealed));});
const loginMessage=document.getElementById('message');
new MutationObserver(()=>{const content=loginMessage.textContent;loginMessage.dataset.kind=/^(Connexion impossible|Connexion interrompue|Identifiant non reconnu|Compte non autorisé)/.test(content)?'error':'info';}).observe(loginMessage,{childList:true,characterData:true,subtree:true});
document.addEventListener('DOMContentLoaded',()=>window.lucide?.createIcons?.());
