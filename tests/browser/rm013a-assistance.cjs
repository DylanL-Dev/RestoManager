'use strict';
// Real authenticated UI; report submissions terminate in an in-memory fixture.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,server,failReports,getReportRequests}=require('./rm013a-management.cjs');
const out=process.env.BROWSER_ARTIFACTS||path.resolve(__dirname,'../../test-results/rm013a-assistance');
const results=[];
async function waitState(page,state){await page.waitForFunction(state=>document.getElementById('reportIssueFeedback').dataset.state===state,state)}
async function capture(page,width,suffix=''){
 if(![390,768,1440].includes(width))return;
 await page.evaluate(()=>{
  const target=document.getElementById('manageFeedback'),header=document.querySelector('body>header.top');
  const offset=getComputedStyle(header).position==='sticky'?header.getBoundingClientRect().height:0;
  scrollTo({top:target.getBoundingClientRect().top+scrollY-offset,left:0,behavior:'instant'});
 });
 await page.clock.runFor(300);
 await page.screenshot({path:path.join(out,'assistance-'+width+suffix+'.png'),fullPage:false,animations:'disabled'});
}
(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 for(const width of [360,390,430,768,1024,1440,1920])for(const role of ['fb_admin','reception']){
  const v=await open(browser,origin,width,role),{page}=v;
  await page.locator('#manageFeedbackToggle').click();const form=page.locator('#reportIssueForm');await form.waitFor({state:'visible'});
  assert.doesNotMatch(await page.locator('#manageFeedback').textContent(),/créateur/i);
  assert.equal(await page.locator('#reportIssueKind option[value=question]').textContent(),'Assistance');
  assert.equal(await page.locator('.reportIssueTypes input[type=radio]').count(),3);
  assert.equal(await page.locator('.reportIssuePriorities input[type=radio]').count(),2);
  for(const [label,value] of [['Suggestion','suggestion'],['Problème','bug'],['Assistance','question']]){
   await page.locator('.reportIssueTypes .reportIssueChoice').filter({hasText:label}).click();assert.equal(await page.locator('#reportIssueKind').inputValue(),value);
  }
  await page.locator('.reportIssuePriorities .reportIssueChoice').filter({hasText:'Urgente'}).click();assert.equal(await page.locator('#reportIssueSeverity').inputValue(),'urgent');
  await page.locator('.reportIssueTypes input[value=question]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#reportIssueKind').inputValue(),'suggestion');
  await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#reportIssueKind').inputValue(),'question');
  assert.equal(await page.locator('.v3-picker-backdrop').isVisible(),false,'No legacy picker is opened by the integrated choices');
  await page.locator('#reportIssueSubmit').click();assert.equal(getReportRequests().length,0,'Invalid empty form cannot submit');
  await page.locator('#reportIssueTitle').fill('Demande d’assistance fictive');await page.locator('#reportIssueDescription').fill('Je souhaite comprendre le choix des tables disponibles. Ceci est un test isolé.');await page.locator('#reportIssueContact').fill('Équipe fictive');
  await page.locator('#manageNetworkToggle').click();await page.locator('#manageFeedbackToggle').click();
  assert.equal(await page.locator('#reportIssueKind').inputValue(),'question');assert.equal(await page.locator('#reportIssueTitle').inputValue(),'Demande d’assistance fictive','Closing the panel preserves the draft');
  if(role==='fb_admin')await capture(page,width);
  failReports(true);await page.locator('#reportIssueSubmit').click();await waitState(page,'error');
  assert.equal(await page.locator('#reportIssueTitle').inputValue(),'Demande d’assistance fictive');assert.equal(await page.locator('#reportIssueSeverity').inputValue(),'urgent');
  assert.equal(await page.locator('#reportIssueSubmit').isDisabled(),false);assert.equal(await form.getAttribute('aria-busy'),null);
  failReports(false);await page.locator('#reportIssueSubmit').click();await waitState(page,'success');
  const requests=getReportRequests();assert.equal(requests.length,2);assert.equal(requests[0].failed,true);assert.equal(requests[1].failed,false);
  assert.deepEqual(requests[1].data,{restaurant_id:'fictional-venue',submitted_by:'fictional-user',submitted_role:role,kind:'question',severity:'urgent',title:'Demande d’assistance fictive',description:'Je souhaite comprendre le choix des tables disponibles. Ceci est un test isolé.',reply_contact:'Équipe fictive',screen:'administration'});
  assert.equal(await page.locator('#reportIssueTitle').inputValue(),'');assert.equal(await page.locator('#reportIssueKind').inputValue(),'bug');assert.equal(await page.locator('#reportIssueSeverity').inputValue(),'normal');
  assert.equal(await page.locator('.reportIssueTypes input[value=bug]').isChecked(),true);assert.equal(await page.locator('.reportIssuePriorities input[value=normal]').isChecked(),true);
  assert.match(await page.locator('#reportIssueFeedback').innerText(),/envoyé à l’assistance/);
  assert.equal(await page.locator('#ownerInbox').count(),0,'No employee report inbox is exposed');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
  const boxes=await page.locator('.reportIssueChoices').evaluateAll(nodes=>nodes.map(n=>({scroll:n.scrollWidth,width:n.clientWidth})));assert.ok(boxes.every(b=>b.scroll<=b.width+1));
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');if(role==='fb_admin')await capture(page,width,'-dark');
  assert.deepEqual(v.errors,[]);results.push({width,role,status:'passed'});await v.context.close();console.log('PASS Assistance choices, keyboard, validation, private submit, failure/retry, reset and layout '+role+' '+width);
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,failed:0,backend:'In-memory service boundary; external HTTP/WebSocket blocked; no real messages sent',results},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
