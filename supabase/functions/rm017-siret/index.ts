// RM-017.2.2 — only deploy to Supabase RestoManager-DEV.
// This endpoint serves pre-signup invited testers. It checks invite + rate
// limits in a private SQL function, then queries the official French registry.
import {createSiretHandler} from '../_shared/rm017-siret-gateway.mjs';
const env=(key:string)=>Deno.env.get(key)||'';
Deno.serve(createSiretHandler({env,projectRef:'lykoybacslvmhtzftqsf'}));
