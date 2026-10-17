'use strict';
// Reproducible screenshots use isolated demonstration data, never a saved user plan.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.BROWSER_ARTIFACTS||path.join(process.cwd(),'docs/screenshots');
const origin=process.env.BROWSER_BASE_URL||'http://127.0.0.1:8000';
const plan={version:4,rooms:[{id:'main',name:'Salle principale',width:12,depth:8,floor:'wood'}],tables:[],elements:[]};
[[2,2],[4.5,2],[7,2],[2,4.5],[4.5,4.5],[7,4.5],[2,6.7],[4.5,6.7]].forEach(([x,y],i)=>plan.tables.push({id:'demo-'+i,number:i+1,roomId:'main',x,y,width:i===1?1.6:1.2,depth:1.2,angle:i===1?20:0,capacity:4,capacityMin:2,shape:i===1?'rectangle':i%3===0?'round':'square',letter:'',color:i===1?'#28734f':'#8a5a29'}));
for(const item of [
 {id:'bar',type:'bar',label:'Bar',x:10.3,y:3,width:4,depth:1,angle:90,color:'#604936'},
 {id:'plant',type:'plant',label:'Plante',x:10.4,y:6.8,width:.7,depth:.7,color:'#28734f'},
 {id:'bench',type:'bench',label:'Banquette',x:7.5,y:6.5,width:2,depth:.7,color:'#732433'},
 {id:'chair',type:'armchair',label:'Fauteuil',x:9.1,y:6.8,width:.7,depth:.7,angle:20,color:'#732433'},
 {id:'wall-top',type:'wall',label:'Mur',x:6,y:.1,width:12,depth:.2,color:'#69776f'},
 {id:'wall-left',type:'wall',label:'Mur',x:.1,y:4,width:.2,depth:7.6,color:'#69776f'}
])plan.elements.push({roomId:'main',angle:0,...item});
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{for(const profile of ['desktop','mobile']){
  const context=await browser.newContext(profile==='mobile'?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1000}});
  await context.addInitScript(plan=>{localStorage.setItem('restomanager_floor_plan_v1',JSON.stringify(plan));localStorage.setItem('restomanager_reservations','[]');localStorage.setItem('restomanager_history','[]');},plan);
  const page=await context.newPage();await page.goto(origin,{waitUntil:'networkidle'});
  await page.evaluate(()=>startFloorEdit());await page.locator('[data-floor-id="demo-1"]').click();
  await page.screenshot({path:path.join(output,profile+'-2d.png'),fullPage:true});
  await page.locator('#floor3DBtn').click();await page.waitForFunction(()=>Floor3D.getState().visible&&Floor3D.getState().frames>0);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:path.join(output,profile+'-3d.png'),fullPage:true});await context.close();
 }}finally{await browser.close();}
 console.log('Captures : '+output);
})().catch(error=>{console.error(error);process.exitCode=1;});
