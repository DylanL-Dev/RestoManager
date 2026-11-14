'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const auth=fs.readFileSync('v3-connected-auth.js','utf8');
const start=auth.indexOf('const allowedForms=window.RestoReception?');
const end=auth.indexOf(' // Native HTML validation can prevent submit events entirely',start);
assert.ok(start>=0&&end>start,'The authenticated event gate must be present');
const gateCode=auth.slice(start,end)+'\nwindow.__guardSubmit=forbidden;';

function guard(role,{ready=true}={}){
 const label={textContent:''};
 const window={RestoReception:role==='reception',RestoSupabaseReady:ready};
 vm.runInNewContext(gateCode,{window,document:{getElementById:()=>null},label,logout:null,Error});
 return window.__guardSubmit;
}

function submit(fn,{id='',className=''}) {
 const changes={prevented:false,stopped:false};
 const form={id,classList:{contains:name=>className.split(' ').includes(name)}};
 const event={type:'submit',target:{closest:selector=>selector==='form'?form:null},preventDefault(){changes.prevented=true},stopImmediatePropagation(){changes.stopped=true}};
 fn(event);
 return changes;
}

test('Restaurant connected: room creation submit is not blocked by global gate',()=>{
 assert.deepEqual(submit(guard('restaurant'),{id:'roomManagerForm'}),{prevented:false,stopped:false});
});

test('Restaurant connected: dynamic inline room rename is allowed without ID',()=>{
 assert.deepEqual(submit(guard('restaurant'),{className:'roomManagerRenameForm'}),{prevented:false,stopped:false});
});

test('Reception: both room creation and rename are rejected before submit listeners',()=>{
 const fn=guard('reception');
 for(const form of [{id:'roomManagerForm'},{className:'roomManagerRenameForm'}]){
  assert.deepEqual(submit(fn,form),{prevented:true,stopped:true});
 }
});

test('Restaurant disconnected: neither room mutation can pass the gate',()=>{
 const fn=guard('restaurant',{ready:false});
 assert.deepEqual(submit(fn,{id:'roomManagerForm'}),{prevented:true,stopped:true});
 assert.deepEqual(submit(fn,{className:'roomManagerRenameForm'}),{prevented:true,stopped:true});
});

test('Existing unrelated forms keep their current access restrictions',()=>{
 const restaurant=guard('restaurant'),reception=guard('reception');
 assert.deepEqual(submit(restaurant,{id:'tableAdminForm'}),{prevented:false,stopped:false});
 assert.deepEqual(submit(reception,{id:'tableAdminForm'}),{prevented:true,stopped:true});
 assert.deepEqual(submit(restaurant,{id:'unapprovedForm'}),{prevented:true,stopped:true});
 assert.deepEqual(submit(reception,{id:'reportIssueForm'}),{prevented:false,stopped:false});
 assert.deepEqual(submit(guard('restaurant',{ready:false}),{id:'reportIssueForm'}),{prevented:false,stopped:false});
});
