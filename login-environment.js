// RM-SEC-04: externalised verbatim from login.html so the page can use script-src 'self'.
import {supabaseEnvironment} from './restomanager-env.js?v=20261109-twins1';
const label=document.getElementById('environmentLabel');label.dataset.env=supabaseEnvironment.name;
label.textContent=supabaseEnvironment.name==='DEV'?'DEV · Environnement de test':'PRODUCTION · Espace professionnel';label.hidden=false;
