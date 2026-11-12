'use strict';
/* Offline Playwright visual/interaction smoke test for the DEV weekly scheduler. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const css=fs.readFileSync(path.join(root,'service-v3-weekly-schedule.css'),'utf8');
const js=fs.readFileSync(path.join(root,'service-v3-weekly-schedule.js'),'utf8');
const lucide=fs.readFileSync(path.join(root,'lucide-local.js'),'utf8');
const dayKeys=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const schedule={};
for(const day of dayKeys)schedule[day]={lunch:{enabled:day!=='saturday'&&day!=='sunday',start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [1440,800,390]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.setContent('<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><form id="restaurantShiftForm"><div class="shiftSettingsGrid"></div><button type="submit">Enregistrer les horaires</button></form></body></html>');
   await page.addStyleTag({content:css});
   await page.addScriptTag({content:lucide});
   await page.evaluate(s=>{window.RestoSharedHours={weeklySchedule:s};},schedule);
   await page.addScriptTag({content:js});
   assert.equal(await page.locator('.rmWeeklyRow').count(),7,'seven days');
   assert.ok(await page.locator('.rmWeeklyCopy svg').count()>=7,'Lucide copy icons are rendered');
   assert.ok(await page.locator('.rmWeeklyServiceTitle svg').count()>=14,'Sun and moon SVG icons are rendered');
   assert.equal(await page.locator('#rmWeeklySchedule').isVisible(),true,'weekly planner must be visible');
   assert.equal(await page.locator('.rmWeeklyRow[data-day="saturday"] .rmWeeklyDayStatus').innerText(),'Midi fermé · soir ouvert');
   if(width<=700)await page.locator('.rmWeeklyRow[data-day="wednesday"] summary').click();
   const before=await page.evaluate(()=>window.RestoWeeklyScheduleDraft());
   assert.equal(before.wednesday.dinner.enabled,true);
   const day=page.locator('.rmWeeklyRow[data-day="wednesday"]');
   await day.locator('.rmWeeklydinner input[type=checkbox]').uncheck();
   const changed=await page.evaluate(()=>window.RestoWeeklyScheduleDraft());
   assert.equal(changed.wednesday.dinner.enabled,false);
   assert.equal(changed.thursday.dinner.enabled,true);
   // Copy Monday's independent lunch and dinner times to Tuesday.
   const monday=page.locator('.rmWeeklyRow[data-day="monday"]');
   if(width<=700&&!(await monday.evaluate(el=>el.open)))await monday.locator('summary').click();
   await monday.locator('.rmWeeklyCopy').click();
   await monday.locator('.rmWeeklyCopyTarget').selectOption('tuesday');
   const copied=await page.evaluate(()=>window.RestoWeeklyScheduleDraft());
   assert.deepEqual(copied.tuesday,copied.monday);
   // Tablet in landscape/Desktop may have a narrow real content area because
   // the permanent sidebar and category navigation each consume width.
   if(width===1440){
     await page.evaluate(()=>{
       document.getElementById('restaurantShiftForm').style.width='630px';
       document.getElementById('restaurantShiftForm').style.maxWidth='630px';
     });
     const rects=await page.evaluate(()=>{
      const a=document.querySelector('.rmWeeklyRow[data-day="monday"] .rmWeeklylunch').getBoundingClientRect();
      const b=document.querySelector('.rmWeeklyRow[data-day="monday"] .rmWeeklydinner').getBoundingClientRect();
      const copy=document.querySelector('.rmWeeklyRow[data-day="monday"] .rmWeeklyCopy').getBoundingClientRect();
      const ins=[...document.querySelectorAll('.rmWeeklyRow[data-day="monday"] input[type="time"]')].map(e=>e.getBoundingClientRect());
      return {lunch:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},dinner:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},
        copy:{left:copy.left,right:copy.right,top:copy.top,bottom:copy.bottom},
        inputs:ins.map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom}))};
     });
     assert.ok(rects.lunch.bottom<=rects.dinner.top+3,'narrow tablet: lunch and dinner cards must stack');
     assert.ok(rects.copy.top>=rects.dinner.bottom-3,'narrow tablet: copy action must be below services');
     for(const input of rects.inputs)assert.ok(input.left>=rects.lunch.left-3&&input.right<=rects.dinner.right+3,'time field stays inside schedule area');
   }
   const docWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
   assert.ok(docWidth<=width+4,'horizontal overflow at '+width+'px: '+docWidth);
   if(width===800){
    await page.setViewportSize({width:390,height:850});
    await page.waitForTimeout(150);
    const open=await page.locator('.rmWeeklyRow[open]').count();
    assert.equal(open,1,'rotation from tablet to phone must collapse all but Monday');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=394,'no overflow after rotation');
   }
   await page.close();
   console.log('PASS weekly scheduler responsive and interactions at '+width+'px');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
