'use strict';
const origin='https://lykoybacslvmhtzftqsf.supabase.co';
function validateRuntime(runtime){
 if(!runtime||Object.keys(runtime).some(k=>!['schema','channel','activated','api','allowedApiOrigin','turnstileSiteKey'].includes(k))||runtime.schema!==1||runtime.channel!=='dev')throw Error('Invalid public DEV runtime');
 if(runtime.turnstileSiteKey!==undefined&&(typeof runtime.turnstileSiteKey!=='string'||!/^[A-Za-z0-9_-]{10,100}$/.test(runtime.turnstileSiteKey)))throw Error('Invalid public verification site key');
 if(runtime.activated===false&&runtime.api===null&&runtime.allowedApiOrigin===null)return 'off';
 if(runtime.activated===true&&runtime.api===origin+'/functions/v1/rm015-public'&&runtime.allowedApiOrigin===origin)return 'dev';
 throw Error('Only the explicitly reviewed DEV endpoint can be activated');
}
module.exports={validateRuntime};
