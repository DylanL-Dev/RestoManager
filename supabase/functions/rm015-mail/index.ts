import {createDatabaseRpc} from '../_shared/rm015-gateway.mjs';
import {createMailWorker,resendTransport} from '../_shared/rm015-mail.mjs';
const env=(name:string)=>Deno.env.get(name)||'';
Deno.serve(createMailWorker({
 enabled:env('RM015_EMAIL_ENABLED')==='true'&&env('RM015_EMAIL_PROVIDER')==='resend',
 keys:JSON.parse(env('RM015_TOKEN_KEYS_JSON')||'{}'),workerSecret:env('RM015_MAIL_WORKER_SECRET'),publicBase:env('RM015_PUBLIC_BASE'),
 rpc:createDatabaseRpc({url:env('SUPABASE_URL'),secret:env('SUPABASE_SECRET_KEY')||env('SUPABASE_SERVICE_ROLE_KEY')}),
 sendMessage:resendTransport({apiKey:env('RM015_RESEND_API_KEY'),from:env('RM015_EMAIL_FROM')})
}));
