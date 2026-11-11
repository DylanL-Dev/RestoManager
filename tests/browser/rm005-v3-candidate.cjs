'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const mock=[{id:'rm005-hotel',type:'hotel',client:'999',date:'2032-11-11',time:'12:00',guests:1,tables:[2],status:'reserved',duration:90,notes:'Demande fictive',allergies:'Noix'},
{id:'rm005-ext',type:'exterieur',client:'Client fictif',date:'2032-11-11',time:'13:00',guests:2,tables:[3],status:'seated',duration:90}];
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)||file.includes(path.sep+'.git'+path.sep)){res.writeHead(404);res.end();return}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});
});
(async()=>{let browser;
try{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 for(const width of [390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',timezoneId:'Europe/Paris'});
  await context.addInitScript(bookings=>{localStorage.setItem('restomanager_reservations',JSON.stringify(bookings))},mock);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/service-v3.html');
  await page.evaluate(()=>window.RestoScreens.show('reservations'));
  await page.locator('#reservationShowAll').click();
  await page.waitForFunction(()=>document.querySelectorAll('.rmBookingCard').length>=2);
  assert.equal(await page.locator('#rmReservationFilters .reservationViewTab').count(),4);
  assert.equal(await page.locator('.rmBookingCard').count(),2);
  assert.equal(await page.locator('.rmBookingCard[data-type=hotel] [data-reservation-action=edit]').count(),1);
  assert.equal(await page.locator('.rmBookingCard[data-type=hotel] .rmBookingFlagAllergy').count(),1);
  const layout=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth,icon:!!document.querySelector('.rmBookingCard[data-type=hotel] .rmBookingClient svg')}));
  assert.ok(layout.body<=layout.viewport+2,'No viewport overflow at '+width+': '+JSON.stringify(layout));
  assert.equal(layout.icon,true,'Hotel icon SVG is locally rendered');
  await page.locator('.reservationViewTab').filter({hasText:'Installés'}).click();
  assert.equal(await page.locator('.rmBookingCard').count(),1);
  await page.locator('.reservationViewTab').filter({hasText:'À venir'}).click();
  assert.equal(await page.locator('.rmBookingCard').count(),1);
  await page.locator('[data-reservation-action=edit]').click();
  assert.equal(await page.locator('#editForm').isVisible(),true);
  assert.equal(await page.locator('#editNotes').inputValue(),'Demande fictive');
  assert.equal(await page.locator('#editAllergies').inputValue(),'Noix');
  await page.locator('#editCancel').click();
  assert.deepEqual(errors,[],'No JavaScript errors at '+width);
  console.log('PASS local V3 RM-005 UI '+width+'px');
  await context.close();
 }
}finally{await browser?.close();await new Promise(ok=>server.close(ok))}
})().catch(e=>{console.error(e);process.exitCode=1});
