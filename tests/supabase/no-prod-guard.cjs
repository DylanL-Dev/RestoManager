'use strict';
// RM-AUDIT-02 phase 2 — fail-closed network guard for the isolated Supabase harness.
// Loaded first by tests/supabase/mission3.cjs: every Node-side connection (http, https, fetch,
// WebSocket, raw net/tls sockets) must target loopback. Anything else is refused before any byte
// is sent and recorded; the run then fails. Docker images are pulled by the Docker daemon, not by
// this process, and the browser has its own origin filter in browser-tests.cjs.
const net=require('node:net');const tls=require('node:tls');const http=require('node:http');const https=require('node:https');

const LOOPBACK=new Set(['127.0.0.1','localhost','::1','::ffff:127.0.0.1']);
const violations=[];

function normalise(host){return String(host).trim().toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');}
function check(host,kind){
 if(host===undefined||host===null||host==='')return; // Node defaults to localhost; unix sockets have no host.
 const value=normalise(host);
 if(LOOPBACK.has(value))return;
 violations.push({kind,host:value.replace(/[^a-z0-9.:-]/g,'').slice(0,80)});
 const error=new Error('RM-AUDIT-02 guard: non-loopback connection refused ('+kind+')');error.code='EGUARD';throw error;
}
function hostFromUrl(value){try{return new URL(String(value)).hostname;}catch{return undefined;}}
function hostFromRequestArgs(args){
 const [first,second]=args;
 if(typeof first==='string'||first instanceof URL)return hostFromUrl(first);
 if(first&&typeof first==='object')return first.hostname||(first.host?String(first.host).replace(/:\d+$/,''):undefined)||(second&&typeof second==='object'?second.hostname||second.host:undefined);
 return undefined;
}
function hostFromSocketArgs(args){
 const [first,second]=args;
 if(first&&typeof first==='object')return first.path?undefined:(first.host??'localhost');
 if(typeof first==='number'||/^\d+$/.test(String(first)))return typeof second==='string'?second:'localhost';
 return undefined; // string path: unix domain socket
}

for(const [module,name] of [[http,'http'],[https,'https']]){
 for(const fn of ['request','get']){
  const original=module[fn];
  module[fn]=function guarded(...args){check(hostFromRequestArgs(args),name);return original.apply(this,args);};
 }
}
for(const [module,name,fns] of [[net,'net',['connect','createConnection']],[tls,'tls',['connect']]]){
 for(const fn of fns){
  const original=module[fn];
  module[fn]=function guarded(...args){check(hostFromSocketArgs(args),name);return original.apply(this,args);};
 }
}
if(typeof globalThis.fetch==='function'){
 const original=globalThis.fetch;
 globalThis.fetch=function guarded(input,init){
  const target=typeof input==='string'||input instanceof URL?input:input?.url;
  try{check(hostFromUrl(target),'fetch');}catch(error){return Promise.reject(error);}
  return original.call(this,input,init);
 };
}
if(typeof globalThis.WebSocket==='function'){
 const Original=globalThis.WebSocket;
 globalThis.WebSocket=class GuardedWebSocket extends Original{constructor(address,...rest){check(hostFromUrl(address),'websocket');super(address,...rest);}};
}

module.exports={
 violations,
 summary(){return {nodeViolations:violations.length,refused:violations.slice(0,20)};},
 assertClean(){if(violations.length){const error=new Error('RM-AUDIT-02 guard: '+violations.length+' non-loopback connection attempt(s) refused');error.code='EGUARD';throw error;}},
};
