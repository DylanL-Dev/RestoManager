'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateRuntime}=require('../scripts/public-connected-config.cjs');
const origin='https://lykoybacslvmhtzftqsf.supabase.co';
const active={schema:1,channel:'dev',activated:true,api:origin+'/functions/v1/rm015-public',allowedApiOrigin:origin};
test('RM015 build accepts only staged or the reviewed DEV activation',()=>{assert.equal(validateRuntime(active),'dev');assert.equal(validateRuntime({...active,activated:false,api:null,allowedApiOrigin:null}),'off');});
test('RM015 build refuses production, arbitrary origins, paths and accidental keys',()=>{for(const change of [{channel:'prod'},{api:'https://foreign.example.test/api'},{api:origin+'/rest/v1'},{allowedApiOrigin:'https://foreign.example.test'},{activated:'true'},{secret:'never-a-static-key'},{api:null}])assert.throws(()=>validateRuntime({...active,...change}));});
