'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const read=path=>fs.readFileSync(path,'utf8');
const html=read('creator.html');
const auth=read('creator-auth.js');
const consoleJs=read('creator-console.js');
const inboxJs=read('creator-admin.js');
const css=read('creator-console.css');

test('RM-006 assistance: coherent HTML/CSS/JS modules, with PROD-only auth',()=>{
  assert.match(html,/id="ownerNewReports"/);
  assert.match(html,/id="ownerReviewingReports"/);
  assert.match(html,/id="ownerNavClose"/);
  assert.match(html,/id="ownerNavBackdrop"/);
  assert.match(html,/creator-console\.css\?v=20261114-rm006-root1/);
  assert.match(html,/creator-auth\.js\?v=20261114-rm006-root1/);
  assert.match(auth,/creator-admin\.js\?v=20261114-rm006-root1/);
  assert.match(auth,/creator-console\.js\?v=20261114-rm006-root1/);
  assert.match(auth,/https:\/\/tnsrkargogckgtsxipwd\.supabase\.co/);
  assert.doesNotMatch(auth,/restomanager-env\.js|lykoybacslvmhtzftqsf/);
  assert.match(consoleJs,/ownerDrawerOpen/);
  assert.match(consoleJs,/ownerNavBackdrop/);
  assert.match(css,/ownerNavBackdrop/);
  assert.match(css,/ownerNavClose/);
  assert.doesNotMatch(inboxJs,/service_role|from\('auth\.users'\)/);
});

test('RM-006 assistance: reports default to open, resolved disappear after successful update',async()=>{
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.listeners={};this.textContent='';this.className='';this.value='';this.disabled=false;}
    append(...children){this.children.push(...children)}
    replaceChildren(...children){this.children=[...children]}
    setAttribute(key,val){this.attrs[key]=String(val)}
    addEventListener(event,callback){this.listeners[event]=callback}
  }
  const root=new Element('main');
  const document={
    getElementById(id){return id==='ownerInbox'?root:null},
    createElement(tag){return new Element(tag)}
  };
  const reports=[
    {id:'r1',restaurant_id:'venue',submitted_role:'reception',kind:'bug',severity:'normal',title:'Ouvert',description:'Test',reply_contact:'',screen:'Réservation',status:'new',created_at:'2026-11-14T07:00:00Z'},
    {id:'r2',restaurant_id:'venue',submitted_role:'fb_admin',kind:'suggestion',severity:'normal',title:'En cours',description:'Test',reply_contact:'',screen:'Restaurant',status:'reviewing',created_at:'2026-11-14T07:00:00Z'},
    {id:'r3',restaurant_id:'venue',submitted_role:'reception',kind:'question',severity:'normal',title:'Résolu',description:'Test',reply_contact:'',screen:'Réception',status:'resolved',created_at:'2026-11-14T07:00:00Z'}
  ];
  const updates=[];const dispatched=[];
  const client={from(table){
    if(table==='restaurants')return{select:async()=>({data:[{id:'venue',name:'Établissement test'}],error:null})};
    if(table==='platform_reports')return{
      select(){return{order(){return{limit:async()=>({data:reports.map(x=>({...x})),error:null})}}}},
      update(value){return{eq:async(key,id)=>{assert.equal(key,'id');const item=reports.find(r=>r.id===id);item.status=value.status;updates.push([id,value.status]);return{error:null}}}}
    };
    throw new Error('Unexpected table '+table);
  }};
  const context={document,window:{dispatchEvent(e){dispatched.push(e.type)}},Event:class{constructor(type){this.type=type}},console};
  vm.runInNewContext(inboxJs.replace('export function installOwnerInbox','function installOwnerInbox')+'\nthis.installOwnerInbox=installOwnerInbox;',context,{timeout:2000});
  context.installOwnerInbox({client});
  const flush=async()=>{await new Promise(setImmediate);await new Promise(setImmediate)};
  await flush();

  const filters=root.children.find(x=>x.className==='ownerReportFilters');
  const feedback=root.children.find(x=>x.id==='ownerReportsFeedback');
  const list=root.children.find(x=>x.className==='ownerReportList');
  assert.equal(filters.children[0].textContent,'À traiter');
  assert.equal(filters.children[0].attrs['aria-pressed'],'true');
  assert.equal(list.children.length,2,'Only open items appear by default');
  assert.match(feedback.textContent,/2 affiché\(s\)/);
  const first=list.children[0];
  const status=first.children.find(x=>x.className==='ownerReportStatus').children.find(x=>x.tag==='select');
  status.value='resolved';
  await status.listeners.change();
  await flush();
  assert.deepEqual(updates,[['r1','resolved']]);
  assert.deepEqual(dispatched,['restomanager:root-reports-updated']);
  assert.equal(list.children.length,1,'Resolved item must leave the open inbox');
  assert.match(feedback.textContent,/2 résolu\(s\)/);
  filters.children[1].listeners.click();
  await flush();
  assert.equal(list.children.length,3,'All items remain accessible in history');
});
