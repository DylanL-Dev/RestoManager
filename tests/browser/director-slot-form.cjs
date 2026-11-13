'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const script=read('service-v3-booking-director-choices.js');
const estimator=read('service-v3-slot-capacity.js');
const preview=read('service-v3-arrival-preview.js');
const previewCss=read('service-v3-arrival-preview.css');
const lucide=read('lucide-local.js');
const legacyCss=read('service-v3.css');
const slotTheme=read('ui/booking-slot-cards.css');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [390,800,1440]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.setContent(`<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
   <div class="bookingTools"><form id="bookingForm"><label><span class="reservationFieldCaption">Nom du client <small>(facultatif)</small></span><input id="bookingClient" value=""></label>
   <label><select id="bookingType"><option value="hotel">Client hôtel</option><option value="exterieur">Client extérieur</option></select></label>
   <label><input id="bookingHotelRoom"></label>
   <label><input type="date" id="bookingDate" value="2099-01-05"></label>
   <label><input type="time" id="bookingTime" value="19:00"></label>
   <label><input id="bookingGuests" type="number" value="2"></label>
   <p id="bookingFeedback"></p>
   </form></div><form id="walkinForm"><label>Heure passage<input id="walkinTime" value="19:00"></label><div class="walkinGuestsField"><label>Personnes<input id="walkinGuests" type="number" value="2"></label></div></form></body></html>`);
   await page.addScriptTag({content:lucide});
   await page.evaluate(()=>{
    window.TableStore={get:()=>({tables:[{number:1,capacity:2,active:true},{number:2,capacity:2,active:true}]})};
    window.ReservationEngine={
      getDefaultDuration:()=>90,
      getShiftsForDate:()=>({lunch:{enabled:false,start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'20:00'}}),
      isServiceOpen:()=>true,normalizeReservations:list=>list
    };
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});
    window.RestoSharedReservations=[];window.RestoSharedDataLoaded=true;window.RestoSyncState='pending';window.RestoLastSyncAt=Date.now();
    window.RestoFusion={pairs:()=>[]};
    window.RestoBookingInterval=()=>[0,1];window.RestoBookingDraft={occupied:()=>[]};
    window.RestoRush={evaluate:candidate=>({blocked:candidate.time==='19:15',current:18,after:18+candidate.guests,limit:20})};
   });
   await page.addStyleTag({content:legacyCss});
   await page.addStyleTag({content:slotTheme});
   await page.addStyleTag({content:previewCss});
   await page.addScriptTag({content:estimator});await page.addScriptTag({content:script});await page.addScriptTag({content:preview});
   assert.match(await page.locator('#rmBookingArrivalPreview').innerText(),/18\/20/,'booking pressure visible before selecting covers');
   assert.match(await page.locator('#rmWalkinArrivalPreview').innerText(),/18\/20/,'passage pressure visible before changing covers');
   assert.equal(await page.locator('#rmWalkinArrivalPreview svg').count(),1,'walkin pressure uses Lucide activity');
   assert.match(await page.locator('.rmSlotCard').first().innerText(),/Arrivées 18\/20/,'pressure appears in time chip without guest-size change');
   const first=page.locator('.rmSlotCard').first();
   const cardCount=await page.locator('.rmSlotCard').count();
   assert.equal(cardCount,width<=700?4:5,'compact mobile must show only four time slots');
   if(width<=700){
    const columns=await page.locator('.rmSlotAvailabilityGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns,2,'mobile time chips use two columns');
    const slotPositions=await page.locator('.rmSlotCard').evaluateAll(cards=>cards.slice(0,3).map(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,w:el.getBoundingClientRect().width})));
    assert.ok(Math.abs(slotPositions[0].y-slotPositions[1].y)<3,'first two slots must be in SAME row on actual application CSS');
    assert.ok(slotPositions[1].x>slotPositions[0].x+20,'second slot must be on the right');
    assert.ok(slotPositions[2].y>slotPositions[0].y+20,'third slot must start next row');
    assert.ok(slotPositions[0].w<width/2,'each mobile slot must be compact, not full row');
    const covers=await page.locator('.rmGuestChip').evaluateAll(cards=>cards.slice(0,5).map(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y})));
    assert.ok(covers[1].x>covers[0].x,'guest buttons must not be full row');
    assert.ok(Math.abs(covers[0].y-covers[3].y)<3,'first four cover buttons must share a row');
    assert.match(await page.locator('.rmSlotExpand').innerText(),/autres horaires/);
   }
   assert.equal(await first.getAttribute('data-level'),'limited','fresh shared snapshot must show indicative places even during pending websocket');
   assert.equal(await first.locator('.rmSlotSeats svg').count(),1,'Lucide table-availability icon visible at '+width);
   assert.equal(await first.locator('.rmSlotPressure svg').count(),1,'Lucide immediate arrival icon visible at '+width);
   assert.equal(await first.locator('.rmSlotSelectedMark svg').count(),1,'Lucide selected checkmark visible at '+width);
   const pressure=page.locator('.rmSlotCard').filter({hasText:'19:15'});
   assert.equal(await pressure.getAttribute('data-pressure'),'busy','arrival load is marked');
   assert.equal(await pressure.locator('svg').count(),2,'Lucide activity badge is rendered');
   assert.equal(await pressure.getAttribute('data-level'),'limited','availability color remains based on remaining seats');
   await page.locator('.rmGuestChip').filter({hasText:/^5$/}).click();
   assert.equal(await first.getAttribute('data-level'),'limited','online snapshot must show actual remaining seats');
   assert.equal(await first.getAttribute('data-unavailable'),'true','incompatible party must be marked unavailable');
   await first.click();
   const inlineState=await page.locator('#rmSlotHelp').evaluate(el=>({message:el.textContent,hidden:el.hidden,display:getComputedStyle(el).display}));
   if(!/aucune table ou fusion compatible/i.test(inlineState.message))console.error('SLOT_DEBUG',JSON.stringify({
    inlineState,
    cards:await page.locator('.rmSlotCard').first().evaluate(el=>({text:el.textContent,level:el.dataset.level,unavailable:el.dataset.unavailable,html:el.outerHTML.slice(0,600)})),
    capacity:await page.evaluate(()=>window.RestoBookingSlotResult?.(document.getElementById('bookingTime').value)),
    inForm:await page.locator('#rmSlotHelp').count()
   }));
   assert.match(inlineState.message,/aucune table ou fusion compatible/i);
   assert.equal(inlineState.hidden,false,'inline warning must be visible');
   assert.equal(await page.locator('#bookingTime').inputValue(),'19:00');
   assert.equal(await page.locator('.rmGuestChip').count(),8,'compact 1..7 + 8+ picker');
   assert.equal(await page.locator('.rmGuestNumberField').isVisible(),false,'numeric input is collapsed for usual groups');
   await page.locator('.rmGuestCustom').click();
   assert.equal(await page.locator('.rmGuestNumberField').isVisible(),true,'8+ exposes exact custom group size');
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
