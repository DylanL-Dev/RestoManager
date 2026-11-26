// RM-SEC-04: externalised verbatim from login.html so the page can use script-src 'self'.
import {supabaseEnvironment} from './restomanager-env.js?v=2026.11.21-rm015.10-main';
const label=document.getElementById('environmentLabel');label.dataset.env=supabaseEnvironment.name;
label.textContent=supabaseEnvironment.name==='DEV'?'DEV · Environnement de test':'PRODUCTION · Espace professionnel';label.hidden=false;
