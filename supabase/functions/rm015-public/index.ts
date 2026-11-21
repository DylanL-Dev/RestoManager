import {createRuntimeHandler} from '../_shared/rm015-runtime.mjs';
import {verifyTurnstile} from '../_shared/rm015-turnstile.mjs';
const env=(name:string)=>Deno.env.get(name)||'';
Deno.serve(createRuntimeHandler({env,expectedProjectRef:'lykoybacslvmhtzftqsf',
 verifyChallenge:(token:string,ip:string,config:{allowedOrigins:string[]})=>verifyTurnstile({token,ip,secret:env('RM015_TURNSTILE_SECRET'),allowedOrigins:config.allowedOrigins})
}));
