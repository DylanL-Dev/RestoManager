'use strict';
// Capture the actual DEV parent. No genuine staff data or service writes.
process.argv.push('--baseline');
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),fixture=require('./rm013a-management.cjs');
const out=path.resolve(process.env.BROWSER_ARTIFACTS||'test-results/rm016-before');
(async()=>{let browser;try{fs.mkdirSync(out,{recursive:true});await new Promise(r=>fixture.server.listen(0,'127.0.0.1',r));browser=await chromium.launch({args:['--no-sandbox']});
 for(const width of [390,768,1440])for(const role of ['fb_admin','reception']){
 const v=await fixture.open(browser,'http://127.0.0.1:'+fixture.server.address().port,width,role);
 await v.page.evaluate(()=>window.RestoTutorial.start());await v.page.clock.runFor(300);await v.page.locator('#restoTourDock, #rmLearningCoach').waitFor();
 await v.page.screenshot({path:path.join(out,'before-'+role+'-'+width+'.png'),animations:'disabled'});await v.context.close();console.log('PASS actual previous tutorial '+role+' '+width);
 }
 }finally{await browser?.close();fixture.server.closeAllConnections();await new Promise(r=>fixture.server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
