// Staged for security review. Do not deploy until staff accounts and tests exist.
// Requires Supabase-managed SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets.
// JWT authentication, role authorization and recent sign-in are enforced server-side.
import { createClient } from 'npm:@supabase/supabase-js@2';
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json(405,{error:'Méthode interdite'});
 const auth=req.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer '))return json(401,{error:'Authentification requise'});
 const url=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!secret)return json(503,{error:'Configuration indisponible'});
 const admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
 const token=auth.slice(7);
 const {data:{user},error:authError}=await admin.auth.getUser(token);
 if(authError||!user)return json(401,{error:'Session invalide'});
 const {data:profile,error:roleError}=await admin.from('staff_profiles')
 .select('role,active').eq('user_id',user.id).single();
 if(roleError||profile?.role!=='fb_admin'||profile.active!==true)
 return json(403,{error:'Droits administrateur requis'});
 // Reauthentication: auth_time must be within last five minutes.
 // Avoid trusting the client-supplied login time.
 const parts=token.split('.');
 let claims:Record<string,unknown>;
 try{
  if(parts.length!==3)throw Error('Invalid JWT');
  const payload=parts[1].replace(/-/g,'+').replace(/_/g,'/');
  claims=JSON.parse(atob(payload));
 }catch{return json(401,{error:'Jeton invalide'});}
 const authTime=Number(claims.auth_time);
 const now=Math.floor(Date.now()/1000);
 if(!Number.isFinite(authTime)||authTime>now+30||now-authTime>300)
 return json(403,{error:'Reconnectez-vous récemment pour cette opération'});
 let body:{newPassword?:unknown};
 try{body=await req.json();}catch{return json(400,{error:'Requête invalide'});}
 const password=body?.newPassword;
 if(typeof password!=='string'||password.length<16||password.length>128)
 return json(400,{error:'Choisissez un mot de passe de 16 à 128 caractères'});
 // Only reset the shared Reception account, never an arbitrary user ID.
 const {data:target,error:targetError}=await admin.from('staff_profiles')
 .select('user_id').eq('role','reception').eq('active',true).limit(2);
 if(targetError||!target||target.length!==1)return json(409,{error:'Compte Réception non configuré'});
 const targetId=target[0].user_id;
 const {error:resetError}=await admin.auth.admin.updateUserById(targetId,{password});
 if(resetError)return json(500,{error:'Réinitialisation impossible'});
 const {error:auditError}=await admin.from('staff_password_reset_audit')
 .insert({actor_user_id:user.id,target_user_id:targetId,action:'password_reset'});
 if(auditError){
  // A password was changed; never falsely claim the whole workflow succeeded.
  console.error('Password reset audit failed',auditError.message);
  return json(500,{error:'Mot de passe modifié, mais journalisation échouée. Contacter le support.'});
 }
 return json(200,{success:true,message:'Mot de passe Réception modifié'});
});
