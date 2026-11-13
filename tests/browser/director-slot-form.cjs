'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const script=read('service-v3-booking-director-choices.js');
const estimator=read('service-v3-slot-capacity.js');
const lucide=read('lucide-local.js');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [390,800,1440]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.setContent(`<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
   <form id="bookingForm"><label><span class="reservationFieldCaption">Nom du client <small>(facultatif)</small></span><input id="bookingClient" value=""></label>
   <label><select id="bookingType"><option value="hotel">Client hôtel</option><option value="exterieur">Client extérieur</option></select></label>
   <label><input id="bookingHotelRoom"></label>
   <label><input type="date" id="bookingDate" value="2099-01-05"></label>
   <label><input type="time" id="bookingTime" value="19:00"></label>
   <label><input id="bookingGuests" type="number" value="2"></label>
   <p id="bookingFeedback"></p>
   </form></body></html>`);
   await page.addScriptTag({content:lucide});
   await page.evaluate(()=>{
    window.TableStore={get:()=>({tables:[{number:1,capacity:2,active:true},{number:2,capacity:2,active:true}]})};
    window.ReservationEngine={
      getDefaultDuration:()=>90,
      getShiftsForDate:()=>({lunch:{enabled:false,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'20:00'}}),
      isServiceOpen:()=>true,normalizeReservations:list=>list
    };
    window.RestoSharedReservations=[];window.RestoSharedDataLoaded=true;window.RestoSyncState='ok';
    window.RestoFusion={pairs:()=>[]};
    window.RestoBookingInterval=()=>[0,1];window.RestoBookingDraft={occupied:()=>[]};
    window.RestoRush={evaluate:candidate=>({blocked:candidate.time==='19:15',current:18,after:18+candidate.guests,limit:20})};
   });
   await page.addScriptTag({content:estimator});await page.addScriptTag({content:script});
   const first=page.locator('.rmSlotCard').first();
   assert.equal(await first.locator('svg').count(),1,'Lucide guests icon is visible at '+width);
   const pressure=page.locator('.rmSlotCard').filter({hasText:'19:15'});
   assert.equal(await pressure.getAttribute('data-pressure'),'busy','arrival load is marked');
   assert.equal(await pressure.locator('svg').count(),2,'Lucide activity badge is rendered');
   assert.equal(await pressure.getAttribute('data-level'),'limited','availability color remains based on remaining seats');
   await page.locator('#bookingGuests').fill('5');
   await first.click();
   assert.match(await page.locator('#rmSlotHelp').innerText(),/aucune table ou fusion compatible/i);
   assert.equal(await page.locator('#bookingTime').inputValue(),'19:00');
   await page.locator('#bookingType').selectOption('exterieur');
   assert.equal(await page.locator('#bookingClient').getAttribute('required'),'','exterior client requires name');
   assert.equal(await page.evaluate(()=>window.RestoExternalNameGuard.validateField()),false,'empty exterior name blocked');
   assert.match(await page.locator('#rmDirectorError-bookingClient').innerText(),/obligatoire/);
   await page.locator('#bookingClient').fill('Durand');
   assert.equal(await page.evaluate(()=>window.RestoExternalNameGuard.validateField()),true);
   await page.locator('#bookingType').selectOption('hotel');
   assert.equal(await page.locator('#bookingClient').getAttribute('required'),null,'hotel name optional');
   assert.equal(await page.locator('.rmSlotExplainer svg').count(),1,'Lucide info icon');
   const docWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
   assert.ok(docWidth<=width+3,'No horizontal overflow '+width+'px: '+docWidth);
   console.log('PASS arrival/seat chips and exterior name on '+width+'px');
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
