const encoder=new TextEncoder(),decoder=new TextDecoder();
export const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export const unhex=value=>{if(!/^[a-f0-9]{64}$/i.test(value||''))throw Error('Invalid server key');return Uint8Array.from(value.match(/../g),x=>parseInt(x,16));};
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
export async function fingerprint(secret,value){const key=await crypto.subtle.importKey('raw',unhex(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))));}
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export async function encryptToken(keys,active,restaurant,token){
 if(!/^[a-z0-9_-]{1,20}$/.test(active))throw Error('Invalid key version');
 const key=await crypto.subtle.importKey('raw',unhex(keys[active]),'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('RM015:'+restaurant)},key,encoder.encode(token));
 return active+'.'+base64(iv)+'.'+base64(new Uint8Array(cipher));
}
export async function decryptToken(keys,restaurant,value){
 const parts=String(value).split('.');if(parts.length!==3||!Object.hasOwn(keys,parts[0]))throw Error('Unknown token key');
 const key=await crypto.subtle.importKey('raw',unhex(keys[parts[0]]),'AES-GCM',false,['decrypt']);
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(parts[1]),additionalData:encoder.encode('RM015:'+restaurant)},key,decode(parts[2]));
 const token=decoder.decode(plain);if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid decrypted token');return token;
}
export function equalSecret(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length||a.length<32)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
