'use strict';
// Real frontend + auth gate; only the service boundary is simulated. No remote traffic.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=process.env.BROWSER_ARTIFACTS||path.join(root,'test-results/rm013a');
const baseline=process.env.RM013_BASE_REF||'473b7f423eb06579ab889b40c2d1ebea25e0c657';
const baselineOnly=process.argv.includes('--baseline');
const widths=[360,390,430,768,1024,1440,1920];
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
let state,sequence=0,calls=[],reportRequests=[],reportsFailed=false,notificationsFailed=false,workerRevision=0,notificationQueries=[];const results=[];
function reset(){
 calls=[];reportRequests=[];reportsFailed=false;notificationsFailed=false;notificationQueries=[];
 state={revision:'10',capabilities:{reservation_edits:4,booking_recovery:1,snapshot:1},
 hours:{id:1,lunch_enabled:true,lunch_start:'12:00',lunch_end:'14:30',dinner_enabled:true,dinner_start:'19:00',dinner_end:'21:30',duration:60,arrival_limit_percent:60,
 weekly_schedule:Object.fromEntries(days.map(day=>[day,{lunch:{enabled:!['saturday','sunday'].includes(day),start:'12:00',end:'14:30'},dinner:{enabled:true,start:'19:00',end:'21:30'}}]))},
 rooms:[{id:id(1),name:'Salle principale',active:true,sort_order:0},{id:id(2),name:'Salle Prestige',active:true,sort_order:1},
 {id:id(3),name:'Salon panoramique des grandes réceptions et des événements privés',active:true,sort_order:2},
 {id:id(4),name:'Salle temporaire',active:true,sort_order:3}],
 tables:Array.from({length:22},(_,i)=>({id:id(100+i),label:'Table '+(i+1),seats:4,active:true,room_id:id(1)})),
 reservations:[],assignments:[],holds:[],serviceClosures:[],fusionLinks:[{table_a:id(100),table_b:id(101)}]};
}
const snapshot=()=>({...structuredClone(state),syncSequence:++sequence});
function query({table,mode,values,filters,single}){
 if(['fb_reservation_alerts','reservation_change_alerts'].includes(table)){notificationQueries.push({table,mode,filters});if(notificationsFailed)return {data:null,error:{code:'NETWORK',message:'Fixture notification source unavailable'}}}
 let rows=table==='restaurants'?[{id:'fictional-venue',name:'Restaurant fictif RM-013-A'}]:table==='restaurant_rooms'?state.rooms:table==='restaurant_tables'?state.tables:table==='restaurant_hours'?[state.hours]:table==='service_closures'?state.serviceClosures:table==='fb_reservation_alerts'?(state.bookingAlerts||[]):table==='reservation_change_alerts'?(state.changeAlerts||[]):[];
 rows=rows.filter(row=>filters.every(([key,value,op])=>key==='restaurant_id'?!row.restaurant_id||row.restaurant_id===value:op==='in'?value.includes(row[key]):op==='is'?row[key]==value:row[key]===value));
 if(mode==='insert'&&table==='platform_reports'){
  reportRequests.push({data:structuredClone(values),failed:reportsFailed});
  return {data:null,error:reportsFailed?{code:'NETWORK',message:'Fixture transmission failure'}:null};
 }
 if(mode==='insert'){
  assert.equal(table,'restaurant_rooms');const row={...values,id:id(50+calls.length)};state.rooms.push(row);rows=[row];calls.push({table,mode,values});
 }else if(mode==='update'){
  calls.push({table,mode,values});for(const row of rows)Object.assign(row,values);
 }
 return {data:single?rows[0]||null:structuredClone(rows),error:null};
}
function rpc(name,args){
 calls.push({name,args});
 if(name==='booking_draft_v3')return {data:{tables:[],holds:[],seconds:180},error:null};
 if(name==='create_restaurant_table_v3')state.tables.push({id:id(200+calls.length),label:args.p_label,seats:args.p_seats,room_id:args.p_room_id,active:true});
 else if(name==='update_restaurant_table_v3')Object.assign(state.tables.find(t=>t.id===args.p_table_id),{label:args.p_label,seats:args.p_seats,room_id:args.p_room_id});
 else if(name==='set_restaurant_table_active_v3')state.tables.find(t=>t.id===args.p_table_id).active=args.p_active;
 else if(name==='create_fusion_chain_v1')state.fusionLinks=args.p_tables.slice(1).map((t,i)=>({table_a:args.p_tables[i],table_b:t}));
 else if(name==='change_fusion_link_v3'){state.fusionLinks=state.fusionLinks.filter(link=>!args.p_old||![link.table_a,link.table_b].every(t=>args.p_old.includes(t)));if(args.p_new)state.fusionLinks.push({table_a:args.p_new[0],table_b:args.p_new[1]})}
 else if(name==='close_service_v3'){
  assert.equal(args.p_mode,'manual');assert.ok(args.p_date<'2032-11-08','Fixture closes only a past service');
  assert.equal(state.reservations.filter(r=>r.starts_at.startsWith(args.p_date)&&!['departed','completed','cancelled','no_show'].includes(r.status)).length,0);
  state.serviceClosures.push({service_date:args.p_date,close_mode:'manual',served_covers:0,served_groups:0,closed_at:'2032-11-08T10:00:00Z'});
 }
 else throw Error('Unexpected fixture RPC '+name);
 return {data:id(999),error:null};
}
const bridge=`
export async function requireStaff(){return {user:{id:'fictional-user'},profile:{role:window.__rmRole,active:true,display_name:'Équipe fictive',restaurant_id:'fictional-venue'}}}
export async function loadSharedService(){return window.__rmSnapshot()}
export async function subscribeSharedService(onSnapshot,onError,onConnection){const apply=async()=>{onConnection(true);onSnapshot(await loadSharedService())};window.addEventListener('rm:push',apply);setTimeout(apply,0);return ()=>{}}
function query(table){const spec={table,mode:'select',filters:[],single:false};const q={select(){return q},eq(k,v){spec.filters.push([k,v]);return q},update(v){spec.mode='update';spec.values=v;return q},insert(v){spec.mode='insert';spec.values=v;return q},single(){spec.single=true;return q},maybeSingle(){spec.single=true;return q},then(yes,no){return window.__rmQuery(spec).then(yes,no)}};q.in=(k,v)=>{spec.filters.push([k,v,'in']);return q};q.is=(k,v)=>{spec.filters.push([k,v,'is']);return q};for(const n of ['order','limit','range','gte','lte','neq'])q[n]=()=>q;return q}
export const supabase={from:query,rpc:(name,args)=>window.__rmRpc(name,args),auth:{getUser:async()=>({data:{user:{id:'fictional-user'}}}),signOut:async()=>({error:null})},removeChannel:async()=>{},channel:()=>({on(){return this},subscribe(){return this}})};`;
const server=http.createServer((req,res)=>{
 const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(process.argv.includes('--pwa-fixture')?/^\/(?:RestoManager\/)?/:/^\//,'');
 if(file.split('/').some(p=>p==='..'||p.startsWith('.'))){res.writeHead(404).end();return}
 let data;try{data=process.argv.includes('--pwa-fixture')&&file==='supabase-service-bridge.js'?bridge:process.argv.includes('--pwa-fixture')&&file==='sw.js'?fs.readFileSync(path.join(root,file),'utf8').replace('dev-rm014','dev-rm014-fixture'+workerRevision):baselineOnly?execFileSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:10*1024*1024,stdio:['ignore','pipe','ignore']}):fs.readFileSync(path.join(root,file));}catch{res.writeHead(404).end();return}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);
});
async function open(browser,origin,width,role,options={}){
 reset();
 const context=await browser.newContext({viewport:{width,height:width<768?844:width===768?1024:width===1920?1080:900},serviceWorkers:options.serviceWorkers||'block',timezoneId:'Europe/Paris',isMobile:width<768,hasTouch:width<=1024});
 await context.addInitScript(role=>window.__rmRole=role,role);
 await context.exposeFunction('__rmSnapshot',snapshot);await context.exposeFunction('__rmQuery',query);await context.exposeFunction('__rmRpc',rpc);
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.endsWith('/supabase-service-bridge.js'))return route.fulfill({contentType:'text/javascript',body:bridge});return route.continue()});
 await context.routeWebSocket('**/*',ws=>ws.close());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date(options.time||'2032-11-08T10:00:00Z')});
 await page.goto(origin+(options.basePath||'')+'/v3-connected.html');await page.waitForFunction(()=>window.RestoSupabaseReady===true);
 const welcome=page.locator('#restoTourWelcome');if(await welcome.isVisible())await page.getByRole('button',{name:'Plus tard',exact:true}).click();
 await page.evaluate(()=>window.RestoScreens.show('administration'));
 return {context,page,errors};
}
async function capture(page,name){
 await page.clock.runFor(300);await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));
 await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});
}
async function openCategory(page,id){
 const button=page.locator('#'+id+'Toggle');
 if(await button.getAttribute('aria-expanded')!=='true')await button.click();
 await page.waitForFunction(id=>document.getElementById(id+'Toggle').getAttribute('aria-expanded')==='true',id);
}
async function feedback(page,id,text){await page.waitForFunction(({id,text})=>document.getElementById(id).textContent.includes(text),{id,text})}
async function dialog(page,button){await page.getByRole('alertdialog').getByRole('button',{name:button,exact:true}).click()}
async function chooseRoom(page,name){
 await page.locator('#tableAdminRoom').locator('..').locator('.roomChoiceTrigger').click();
 await page.locator('.roomPickerOption').filter({hasText:name}).click();
}
async function noOverflow(page,where){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow: '+where)}
async function exerciseRestaurant(page,width){
 // Enter/Space + optional accordion keyboard shortcuts. Collapsed content leaves the focus order.
 const rooms=page.locator('#manageRoomsToggle');await rooms.focus();
 await page.keyboard.press('Enter');assert.equal(await rooms.getAttribute('aria-expanded'),'true');
 await page.keyboard.press('Space');assert.equal(await rooms.getAttribute('aria-expanded'),'false');
 await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.id),'manageSettingsToggle');
 await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'manageHoursToggle');
 await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'manageSettingsToggle');
 await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.category),'restoTourHelp');
 await openCategory(page,'manageRooms');
 const prestige=page.locator('.roomManagerItem').filter({hasText:'Salle Prestige'});
 await prestige.getByRole('button',{name:'Renommer Salle Prestige',exact:true}).click();
 await prestige.locator('input').fill('Salon privé');
 await openCategory(page,'manageTables');await openCategory(page,'manageRooms');
 assert.equal(await prestige.locator('input').inputValue(),'Salon privé','Accordion preserves room rename draft');
 await page.evaluate(()=>window.RestoRefreshSharedService());
 assert.equal(await prestige.locator('input').inputValue(),'Salon privé','Snapshot preserves room rename draft');
 await prestige.getByRole('button',{name:'Enregistrer',exact:true}).click();await feedback(page,'roomManagerFeedback','renommée');
 assert.equal(state.rooms.find(r=>r.id===id(2)).name,'Salon privé');
 await page.locator('#roomManagerName').fill('Salle de test isolée');await page.locator('#roomManagerForm button').click();await feedback(page,'roomManagerFeedback','créée');
 assert.ok(state.rooms.some(r=>r.name==='Salle de test isolée'));
 const temporary=page.locator('.roomManagerItem').filter({hasText:'Salle temporaire'});
 await temporary.getByRole('button',{name:'Supprimer Salle temporaire',exact:true}).click();await dialog(page,'Annuler');assert.ok(state.rooms.find(r=>r.id===id(4)).active);
 await temporary.getByRole('button',{name:'Supprimer Salle temporaire',exact:true}).click();await dialog(page,'Supprimer');await feedback(page,'roomManagerFeedback','désactivée');assert.equal(state.rooms.find(r=>r.id===id(4)).active,false);
 await openCategory(page,'manageTables');await chooseRoom(page,'Salon privé');
 await feedback(page,'tableAdminFeedback','salle sélectionnée');assert.equal(await page.locator('#tableAdminList .tableAdminItem').count(),0);
 await page.locator('#tableAdminMax').fill('6');await chooseRoom(page,'Salle principale');await dialog(page,'Annuler');
 assert.equal(await page.locator('#tableAdminMax').inputValue(),'6','Capacity-only draft is also protected');
 assert.equal(await page.locator('#tableAdminRoom').inputValue(),id(2));
 await page.locator('#tableAdminNumber').fill('27');
 await openCategory(page,'manageHours');await openCategory(page,'manageTables');assert.equal(await page.locator('#tableAdminNumber').inputValue(),'27');
 await page.locator('#tableAdminSubmit').click();await feedback(page,'tableAdminFeedback','ajoutée');
 const added=state.tables.find(t=>t.label==='Table 27');assert.equal(added.room_id,id(2));assert.equal(added.seats,6);
 assert.equal(await page.locator('#tableAdminList .tableAdminItem').count(),1);
 await page.getByRole('button',{name:'Modifier la table 27',exact:true}).click();await page.locator('#tableAdminMax').fill('8');
 await page.evaluate(()=>window.RestoRefreshSharedService());assert.equal(await page.locator('#tableAdminMax').inputValue(),'8','Snapshot preserves table draft');
 await chooseRoom(page,'Salle principale');await dialog(page,'Annuler');
 assert.equal(await page.locator('#tableAdminRoom').inputValue(),id(2));assert.equal(await page.locator('#tableAdminMax').inputValue(),'8');
 assert.match(await page.locator('#manageTables .roomChoiceTrigger').innerText(),/Salon privé/,'Picker reverts when dirty change is cancelled');
 await openCategory(page,'manageRooms');await openCategory(page,'manageTables');await page.locator('#tableAdminSubmit').click();await feedback(page,'tableAdminFeedback','modifiée');assert.equal(added.seats,8);
 await page.getByRole('button',{name:'Retirer la table 27',exact:true}).click();await dialog(page,'Annuler');assert.equal(added.active,true);
 await page.getByRole('button',{name:'Retirer la table 27',exact:true}).click();await dialog(page,'Retirer');await feedback(page,'tableAdminFeedback','désactivée');assert.equal(added.active,false);
 await page.getByRole('button',{name:'Réactiver',exact:true}).click();await dialog(page,'Réactiver');await feedback(page,'tableAdminFeedback','réactivée');assert.equal(added.active,true);
 await openCategory(page,'manageRooms');
 await page.getByRole('button',{name:'Supprimer Salon privé',exact:true}).click();await feedback(page,'roomManagerFeedback','contient encore des tables');assert.equal(state.rooms.find(r=>r.id===id(2)).active,true);
 // Server condition for an inactive table in a room is also preserved.
 added.active=false;await page.evaluate(()=>window.RestoRefreshSharedService());
 await page.getByRole('button',{name:'Supprimer Salon privé',exact:true}).click();await dialog(page,'Supprimer');await feedback(page,'roomManagerFeedback','même désactivées');assert.equal(state.rooms.find(r=>r.id===id(2)).active,true);
 await openCategory(page,'manageHours');
 const monday=page.locator('.rmWeeklyRow[data-day="monday"]');if(!await monday.evaluate(el=>el.open))await monday.locator('summary').click();
 // Use the actual hour picker; weekly inputs are intentionally readonly.
 await monday.locator('.rmWeeklylunch input.rmTimeInput').first().click();
 await page.getByRole('button',{name:'11 heures',exact:true}).click();await page.getByRole('button',{name:'30 minutes',exact:true}).click();await page.locator('.rmTimeSave').click();
 await monday.locator('.rmWeeklydinner input[type=checkbox]').uncheck();
 await openCategory(page,'manageRooms');await openCategory(page,'manageHours');
 assert.equal(await monday.locator('.rmWeeklylunch input.rmTimeInput').first().inputValue(),'11:30');
 assert.equal(await monday.locator('.rmWeeklydinner input[type=checkbox]').isChecked(),false);
 await monday.locator('.rmWeeklyCopy').click();await monday.locator('.rmWeeklyCopyTarget').selectOption('tuesday');
 await page.locator('#restaurantShiftForm button[type=submit]').click();await feedback(page,'shiftFeedback','enregistrés');
 assert.equal(state.hours.weekly_schedule.monday.lunch.start,'11:30');assert.equal(state.hours.weekly_schedule.monday.dinner.enabled,false);assert.deepEqual(state.hours.weekly_schedule.tuesday,state.hours.weekly_schedule.monday);
 await noOverflow(page,'hours '+width);if([390,768,1440].includes(width))await capture(page,'after-hours-'+width);
 await openCategory(page,'manageSettings');
 const setting=await page.locator('.restaurantDurationSetting').evaluate(box=>{const button=box.querySelector('.durationSelectTrigger'),label=box.querySelector('label');return {background:getComputedStyle(box).backgroundColor,border:getComputedStyle(box).borderTopWidth,button:button.getBoundingClientRect().toJSON(),label:label.getBoundingClientRect().toJSON()}});
 assert.equal(setting.background,'rgba(0, 0, 0, 0)','Duration has no outer filled frame');assert.equal(setting.border,'0px');
 assert.ok(setting.button.width<=180&&setting.button.height>=44,'Compact duration value with touch target');
 assert.ok(setting.button.y>=setting.label.y&&setting.button.y+setting.button.height<=setting.label.y+setting.label.height+1,'Duration value stays in its label row');
 if([390,768,1440].includes(width))await capture(page,'after-settings-'+width);
 await page.locator('.durationSelectTrigger').click();
 await page.locator('.v3-picker-items button').filter({hasText:/^2 h$/}).click();await feedback(page,'manageSettingsPanel','Durée enregistrée');assert.equal(state.hours.duration,120);
 assert.equal(await page.locator('#restaurantDefaultDuration').evaluate(el=>el.form?.id),'restaurantShiftForm','Moved duration keeps form ownership');
 await noOverflow(page,'settings '+width);
 await openCategory(page,'manageFusions');
 for(let i=0;i<3;i++)await page.locator('.rmFusionTableCard').nth(i).click();
 await openCategory(page,'manageRooms');await openCategory(page,'manageFusions');assert.equal(await page.locator('.rmFusionTableCard.isSelected').count(),3);
 await page.locator('#fusionSubmit').click();await dialog(page,'Confirmer la fusion');await feedback(page,'fusionMessage','Fusion enregistrée');
 assert.equal(state.fusionLinks.length,2);assert.ok(await page.evaluate(()=>window.RestoFusion.pairs().some(group=>group.join(',')==='1,2,3')));
 await page.locator('.rmFusionTechnical summary').click();await page.locator('#fusionList .fusionRowActions button').filter({hasText:'Retirer'}).first().click();await dialog(page,'Retirer');await feedback(page,'fusionMessage','Association retirée');assert.equal(state.fusionLinks.length,1);
 await noOverflow(page,'fusions '+width);
 // Closeout policies are unchanged. The UI and archive still render after moving.
 await openCategory(page,'manageClosure');
 assert.equal(await page.locator('#manageClosurePanel').isVisible(),true,'Actual authenticated click opens closeout');
 await page.locator('#manageClosureToggle').click();assert.equal(await page.locator('#manageClosurePanel').isVisible(),false,'Actual click folds closeout again');
 await page.locator('#manageClosureToggle').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#manageClosurePanel').isVisible(),true,'Keyboard opens closeout');
 if([390,768,1440].includes(width))await capture(page,'after-closure-'+width);
 assert.equal(await page.locator('#closureManual').isVisible(),true);await page.locator('#serviceClosure details summary').click();assert.match(await page.locator('#closureArchive').innerText(),/Aucune clôture partagée/);
 const today='2032-11-08';await page.locator('.sharedClosureControls input').fill(today);await page.locator('.sharedClosureControls input').dispatchEvent('change');
 assert.equal(await page.locator('#closureManual').isDisabled(),true);assert.match(await page.locator('#closureStatus').innerText(),/23 h 30/);
 assert.equal(calls.filter(call=>call.name==='close_service_v3').length,0,'No closeout before eligible time');
 const closeDate=page.locator('.sharedClosureControls input');await closeDate.fill('2032-11-07');await closeDate.dispatchEvent('change');
 assert.equal(await page.locator('#closureManual').isDisabled(),false);
 await page.locator('#closureManual').click();await dialog(page,'Annuler');assert.equal(state.serviceClosures.length,0,'Cancelling never closes the service');
 await page.locator('#closureManual').click();await dialog(page,'Clôturer');await feedback(page,'closureStatus','clôturé et archivé');
 assert.equal(state.serviceClosures.length,1);assert.equal(state.serviceClosures[0].service_date,'2032-11-07');assert.equal(await page.locator('#closureManual').isDisabled(),true,'Archived service cannot be closed twice');
 assert.match(await page.locator('#closureArchive').innerText(),/2032-11-07.*manuel/);
 state.reservations=[{id:id(900),guest_name:'Client fictif non finalisé',hotel_room:null,party_size:2,starts_at:'2032-11-06T12:00:00Z',ends_at:'2032-11-06T13:00:00Z',status:'reserved',notes:'[RESTOMANAGER:EXTERIEUR]',edit_version:id(901)}];
 state.assignments=[{reservation_id:id(900),table_id:id(100)}];await page.evaluate(()=>window.RestoRefreshSharedService());
 await closeDate.fill('2032-11-06');await closeDate.dispatchEvent('change');assert.equal(await page.locator('#closureManual').isDisabled(),true);assert.match(await page.locator('#closureStatus').innerText(),/non finalisée/);
 assert.equal(calls.filter(call=>call.name==='close_service_v3').length,1,'Unfinished reservations still prevent closeout');
 state.reservations=[];state.assignments=[];await page.evaluate(()=>window.RestoRefreshSharedService());
 await closeDate.fill('2032-11-07');await closeDate.dispatchEvent('change');
 if([390,768,1440].includes(width))await capture(page,'after-closure-'+width);

 await openCategory(page,'manageReports');assert.equal(await page.locator('#historyPdf').isVisible(),true);await page.locator('#historyPeriod').selectOption('week');await page.locator('#historyDate').fill('2032-11-08');await noOverflow(page,'reports '+width);
 for(const module of ['manageEstablishment','manageFeedback','manageNetwork','restoTourHelp']){await openCategory(page,module);assert.equal(await page.locator('#'+module+'Toggle').getAttribute('aria-expanded'),'true');await noOverflow(page,module+' '+width)}
 // The sync badge's old native-details shortcut must open the integrated accordion.
 await page.evaluate(()=>window.RestoScreens.show('tables'));await page.locator('#syncBadge').dispatchEvent('click');
 await page.waitForFunction(()=>document.getElementById('manageNetworkToggle').getAttribute('aria-expanded')==='true');
 assert.equal(await page.locator('#manageNetworkToggle').getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('.rmManagementCategoryButton[aria-expanded="true"]').count(),1);
 await page.evaluate(()=>window.RestoScreens.show('tables'));await page.locator('.rushSettingsShortcut').click();
 await page.waitForFunction(()=>document.getElementById('manageSettingsToggle').getAttribute('aria-expanded')==='true');
 assert.equal(await page.locator('#rushArrivalPercent').isVisible(),true,'Arrival shortcut opens service settings');
 await openCategory(page,'manageRooms');
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await noOverflow(page,'dark '+width);
 if([390,768,1440].includes(width))await capture(page,'after-dark-'+width);
 await page.evaluate(()=>document.documentElement.dataset.theme='light');
 // The final module can scroll completely above the fixed mobile navigation.
 await openCategory(page,'restoTourHelp');await page.locator('.restoTourLaunch').scrollIntoViewIfNeeded();
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
 if(width<=900){const rect=await page.locator('.restoTourLaunch').boundingBox(),nav=await page.locator('.mobileBottomNav').boundingBox();assert.ok(rect.y+rect.height<=nav.y,'Last control clears fixed navigation')}
}
if(require.main===module)(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 if(baselineOnly){for(const width of [390,768,1440]){const v=await open(browser,origin,width,'fb_admin');await v.page.locator('[data-category="manageTables"]').click();await capture(v.page,'before-rooms-'+width);await v.context.close();console.log('Captured baseline '+width)}return;}
 for(const width of widths)for(const role of ['fb_admin','reception']){
  const v=await open(browser,origin,width,role),{page}=v;
  if(role==='fb_admin'){
   assert.equal(await page.locator('.rmManagementCategoryButton[aria-expanded="true"]').count(),0);
   await page.locator('[data-category="manageRooms"]').click();
   assert.equal(await page.locator('#roomManagerList .roomManagerItem').count(),4);
   const prestige=page.locator('.roomManagerItem').filter({hasText:'Salle Prestige'});
   const metrics=await prestige.evaluate(row=>{const n=row.querySelector('.roomManagerName'),a=row.querySelector('.roomManagerActions'),r=n.getBoundingClientRect();return {width:r.width,height:r.height,lineHeight:parseFloat(getComputedStyle(n).lineHeight),actions:a.getBoundingClientRect().top,nameBottom:r.bottom}});
   assert.ok(metrics.width>150,'Room label has enough room: '+JSON.stringify(metrics));
   assert.ok(metrics.height<=metrics.lineHeight*2+1,'Salle Prestige stays horizontal');
   const labels=await page.locator('.roomManagerName').evaluateAll(nodes=>nodes.map(n=>({title:n.title,text:n.textContent,height:n.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(n).lineHeight)})));
   assert.ok(labels.every(n=>n.title===n.text&&n.height<=n.lineHeight*2+1),'All room names stay horizontal with their full name accessible');
   assert.ok((await page.locator('.roomManagerActions button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height))).every(height=>height>=44),'Room actions retain touch targets');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if([390,768,1440].includes(width))await capture(page,'after-rooms-'+width);
   await page.locator('[data-category="manageTables"]').click();
   assert.equal(await page.locator('#manageRoomsPanel').isVisible(),false);
   assert.equal(await page.locator('#tableAdminList .tableAdminItem').count(),22);
   if([390,768,1440].includes(width))await capture(page,'after-tables-'+width);
   await exerciseRestaurant(page,width);
  }else{
   assert.equal(await page.locator('[data-category="manageRooms"]').isVisible(),false);
   assert.equal(await page.locator('[data-category="manageTables"]').isVisible(),false);
   assert.equal(await page.locator('[data-category="manageFusions"]').isVisible(),false);
   await page.locator('[data-category="manageReadonlyHours"]').click();
   assert.equal(await page.locator('.rmReceptionWeeklyDay').count(),7);
   assert.equal(await page.locator('#receptionWeeklyReadOnly input').count(),0);
   if([390,768,1440].includes(width))await capture(page,'after-reception-'+width);
   const mutations=calls.length;
   await page.evaluate(()=>{for(const id of ['roomManagerForm','tableAdminForm','restaurantShiftForm','fusionForm'])document.getElementById(id).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
   assert.equal(calls.length,mutations,'Reception submits cannot cross the auth gate');
   await assert.rejects(page.evaluate(()=>window.RestoRenameRestaurantRoom('fake','Interdit')),/Restaurant|Accès|administrateur/);
   await openCategory(page,'manageSettings');assert.equal(await page.locator('.durationSelectTrigger').isVisible(),false);assert.equal(await page.locator('#rushArrivalSettings').isVisible(),false);
   assert.equal(await page.locator('#themeMode').count(),1,'Reception keeps appearance settings');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow '+width+' '+role);
  assert.deepEqual(v.errors,[]);results.push({width,role,status:'passed',pageErrors:v.errors});await v.context.close();console.log('PASS real Gestion layout, keyboard, permissions and workflows '+role+' '+width);
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({baseline,passed:results.length,failed:0,backend:'In-memory service boundary; real frontend and auth guard; external HTTP and WebSocket blocked',results},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}})().catch(e=>{console.error(e);process.exitCode=1});

module.exports={open,server,failReports:value=>{reportsFailed=value},getReportRequests:()=>structuredClone(reportRequests),configure:fn=>fn(state),getCalls:()=>structuredClone(calls),failNotifications:value=>{notificationsFailed=value},getNotificationQueries:()=>structuredClone(notificationQueries),bumpWorker:()=>{workerRevision++}};
