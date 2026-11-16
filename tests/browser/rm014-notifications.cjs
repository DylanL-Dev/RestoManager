'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,server}=require('./rm013a-management.cjs');
const out=process.env.BROWSER_ARTIFACTS||path.resolve('test-results/rm014');
const baseline=process.argv.includes('--baseline');
async function seed(page){
 await page.evaluate(()=>{
  const common={date:'2032-11-08',duration:60,type:'hotel',guests:2,notes:'CONFIDENTIEL',allergies:'ALLERGIE SECRÈTE',walkIn:false};
  window.RestoSharedReservations=[
   {...common,id:'late-1',client:'Chambre 204',hotelRoom:'204',time:'10:30',tables:[1],status:'reserved'},
   {...common,id:'departure-1',client:'Chambre 312',hotelRoom:'312',time:'09:45',seatedAt:'2032-11-08T08:45:00Z',tables:[2],status:'seated'},
   {...common,id:'new-1',client:'Chambre 118',hotelRoom:'118',time:'12:30',tables:[3],status:'reserved'}
  ];
  window.RestoFbReservationAlerts=[{id:'booking-1',reservation_id:'new-1',guest_name:'118',hotel_room:'118',party_size:2,starts_at:'2032-11-08T11:30:00Z',created_at:'2032-11-08T09:58:00Z',read_at:null}];
  window.RestoFbChangeAlerts=[];window.RestoFbAlertsStatus='ready';
  window.dispatchEvent(new Event('restomanager:fb-alerts'));
 });
}
(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 for(const width of [390,768,1440]){
  if(process.argv.includes('--prototype')){const p=await browser.newPage({viewport:{width,height:width==768?1024:900}});await p.goto(origin+'/docs/audits/maquettes/rm014.html');await p.screenshot({path:path.join(out,'prototype-'+width+'.png')});await p.close();continue}
  const v=await open(browser,origin,width,'fb_admin');await v.page.evaluate(()=>window.RestoScreens.show('tables'));await seed(v.page);
  await v.page.locator('.serviceBell').click();await v.page.clock.runFor(250);
  await v.page.screenshot({path:path.join(out,(baseline?'before-':'after-')+width+'.png'),animations:'disabled'});
  assert.deepEqual(v.errors,[]);await v.context.close();console.log('PASS '+(baseline?'before':'after')+' '+width);
 }
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
module.exports={seed};
