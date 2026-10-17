'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
class Element {
    constructor(doc,tag='div'){this.doc=doc;this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.dataset={};this.attrs={};this.events={};this.style={setProperty(k,v){this[k]=v;}};this.classes=new Set();this.classList={add:(...s)=>s.forEach(v=>this.classes.add(v)),remove:(...s)=>s.forEach(v=>this.classes.delete(v)),contains:s=>this.classes.has(s),toggle:(s,value)=>{const yes=value??!this.classes.has(s);yes?this.classes.add(s):this.classes.delete(s);return yes;}};this.rect={left:0,top:0,width:600,height:500};}
    set className(value){this.classes=new Set(value.split(/\s+/).filter(Boolean));}get className(){return [...this.classes].join(' ');}
    setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k];}
    append(...children){for(const child of children){child.remove();child.parentNode=this;this.children.push(child);}}
    replaceChildren(...children){for(const child of [...this.children])child.remove();this.append(...children);}
    remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}}
    matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);if(selector.startsWith('.'))return this.classes.has(selector.slice(1));if(selector==='[data-floor-id]')return this.dataset.floorId!==undefined;if(selector==='[contenteditable="true"]')return this.attrs.contenteditable==='true';return this.tagName.toLowerCase()===selector;}
    closest(selector){for(let n=this;n;n=n.parentNode)if(selector.split(',').some(s=>n.matches(s.trim())))return n;return null;}
    querySelectorAll(selector){const result=[];for(const child of this.children){if(selector.split(',').some(s=>child.matches(s.trim())))result.push(child);result.push(...child.querySelectorAll(selector));}return result;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    getBoundingClientRect(){return {...this.rect,right:this.rect.left+this.rect.width,bottom:this.rect.top+this.rect.height};}
    addEventListener(name,fn,options){(this.events[name]??=[]).push({fn,capture:options===true||!!options?.capture});}
    setPointerCapture(id){this.doc.captures.set(id,this);}hasPointerCapture(id){return this.doc.captures.get(id)===this;}releasePointerCapture(id){this.doc.captures.delete(id);}
    focus(){this.doc.activeElement=this;}click(){this.doc.fire(this,'click');}
}
class Document extends Element {
    constructor(){super(null);this.doc=this;this.body=new Element(this,'body');this.append(this.body);this.captures=new Map();this.activeElement=this.body;}
    createElement(tag){return new Element(this,tag);}getElementById(id){return this.querySelector('#'+id);}
    fire(target,name,extra={}){
        const event={type:name,target,button:0,pointerId:1,pointerType:'mouse',clientX:0,clientY:0,key:'',detail:0,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};
        const chain=[];for(let n=target;n;n=n.parentNode)chain.push(n);
        for(const node of [...chain].reverse()){for(const {fn,capture} of node.events[name]||[])if(capture)fn(event);if(event.stopped)return event;}
        for(const node of chain){for(const {fn,capture} of node.events[name]||[])if(!capture)fn(event);if(event.stopped)break;}return event;
    }
}
const table=overrides=>({id:'a',number:1,roomId:'main',capacity:4,capacityMin:2,letter:'',shape:'rectangle',width:2,depth:1,x:3,y:3,angle:0,color:'#8a5a29',...overrides});
const initial=()=>({version:4,rooms:[{id:'main',name:'Main',width:12,depth:10,floor:'plain'}],tables:[table(),table({id:'b',number:2,x:6})],elements:[]});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function harness(draft=initial()){
    const document=new Document(),frames=new Map(),properties=[],protectedNumbers=new Set(),confirms=[],saves={count:0};let nextFrame=0,confirmResult=true,api,engineAPI;
    const ids=['tablesGrid','floorViewport','editorStatus','undoFloorBtn','redoFloorBtn','rotate45Btn','rotate90Btn','duplicateFloorBtn','deleteFloorBtn','propertiesFloorBtn','snapFloorBtn','multiSelectBtn','savePlanBtn'];
    for(const id of ids){const node=document.createElement(id.endsWith('Btn')?'button':'div');node.id=id;document.body.append(node);}
    document.getElementById('floorViewport').rect={left:0,top:0,width:300,height:250};
    document.getElementById('savePlanBtn').addEventListener('click',()=>saves.count++);
    const context=vm.createContext({document,console,structuredClone,crypto:require('node:crypto').webcrypto,Date,Math,Set,Map,setTimeout,clearTimeout,
        window:{requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id)},
        localStorage:{getItem:()=>null,setItem(){}},confirm:message=>{confirms.push(message);return confirmResult;},
        referencedTable:number=>protectedNumbers.has(number),placeFloorItem:(button,item)=>{const display=engineAPI.sizePercent(run('currentPlan()'),item);for(const [key,value] of Object.entries(display))button.style[key]=value+'%';},
        renderUI:()=>{
            const grid=document.getElementById('tablesGrid');grid.replaceChildren();
            for(const item of run('currentPlan().tables.concat(currentPlan().elements).filter(t=>t.roomId===floorRoom)')){
                const button=document.createElement('button'),art=document.createElement('span');art.className='furniture-art';button.append(art);grid.append(button);api.bind(button,item,()=>properties.push(item.id));
            }
            api.onRender();
        },FloorZoom:{getScale:()=>1,isPinching:()=>false,ignoreClick:()=>false}
    });
    const run=source=>vm.runInContext(source,context);
    for(const file of ['reservation-engine.js','floor-plan.js'])run(fs.readFileSync(path.join(root,file),'utf8'));
    engineAPI=run('FloorPlan');context.seed=structuredClone(draft);
    run("let floorDraft=seed;let floorRoom='main';function currentPlan(){return floorDraft||FloorPlan.get();}function afficherTables(){renderUI();}function roomOptions(){if(!floorDraft.rooms.some(r=>r.id===floorRoom))floorRoom='main';}");
    run(fs.readFileSync(path.join(root,'floor-editor.js'),'utf8'));api=run('FloorEditor');api.init();run('afficherTables()');
    const $=id=>document.getElementById(id),button=id=>$('tablesGrid').querySelectorAll('[data-floor-id]').find(n=>n.dataset.floorId===id);
    const fire=(target,name,event={})=>document.fire(target,name,event),flush=()=>{for(const [id,fn] of [...frames]){frames.delete(id);fn();}};
    const selected=()=>[...api.selectedItems()].map(t=>t.id),items=()=>JSON.parse(run('JSON.stringify(floorDraft.tables)'));
    const select=(id,extra={})=>fire(button(id),'click',extra);
    const drag=(target,from,to,extra={})=>{fire(target,'pointerdown',{clientX:from.x,clientY:from.y,...extra});fire(document.body,'pointermove',{clientX:to.x,clientY:to.y,...extra});flush();fire(document.body,'pointerup',{clientX:to.x,clientY:to.y,...extra});};
    return {api,document,run,$,button,fire,flush,frames,selected,items,select,drag,properties,protectedNumbers,confirms,saves,setConfirm:value=>{confirmResult=value;}};
}

test('service clicks, editing selection, properties and draft exit remain separate',()=>{
    const h=harness();h.select('a');assert.deepEqual(h.selected(),['a']);assert.equal(h.properties.length,0);
    h.$('propertiesFloorBtn').click();assert.deepEqual(h.properties,['a']);h.fire(h.button('b'),'dblclick');assert.deepEqual(h.properties,['a','b']);
    h.run('floorDraft=null;afficherTables()');assert.equal(h.$('selectionOverlay'),null);assert.equal(h.$('undoFloorBtn').disabled,true);
    const serviceButton=h.$('tablesGrid').querySelectorAll('[data-floor-id]')[0];serviceButton.click();assert.equal(h.properties.length,3);
});

test('modifier and mobile selection toggle, select all and Escape work',()=>{
    const h=harness();h.select('a');h.select('b',{shiftKey:true});assert.deepEqual(h.selected(),['a','b']);
    h.select('a',{ctrlKey:true});assert.deepEqual(h.selected(),['b']);h.$('multiSelectBtn').click();h.select('a');assert.deepEqual(h.selected(),['a','b']);
    h.select('b');assert.deepEqual(h.selected(),['a']);h.api.selectAll();assert.equal(h.selected().length,2);
    h.fire(h.document.body,'keydown',{key:'Escape'});assert.equal(h.selected().length,0);
});

test('rectangle selection includes visible objects and preserves additive selection',()=>{
    const h=harness();h.drag(h.$('tablesGrid'),{x:90,y:100},{x:360,y:190});assert.deepEqual(h.selected(),['a','b']);assert.equal(h.$('selectionMarquee'),null);
    h.api.clearSelection();h.select('b');h.drag(h.$('tablesGrid'),{x:90,y:100},{x:210,y:190},{shiftKey:true});assert.deepEqual(h.selected(),['a','b']);
});

test('group dragging preserves spacing and records one undoable operation',()=>{
    const h=harness();h.select('a');h.select('b',{shiftKey:true});h.api.setSnap(false);
    h.drag(h.button('a'),{x:150,y:150},{x:200,y:125});const items=h.items();close(items[0].x,4);close(items[1].x,7);close(items[0].y,2.5);close(items[1].y,2.5);
    h.api.undo();close(h.items()[0].x,3);close(h.items()[1].x,6);h.api.redo();close(h.items()[0].x,4);
});

test('quick rotations use a stable group pivot and free rotation preserves a single centre',()=>{
    const h=harness();h.select('a');h.select('b',{shiftKey:true});h.api.rotate(90);
    close(h.items()[0].x,4.5);close(h.items()[0].y,1.5);close(h.items()[1].x,4.5);close(h.items()[1].y,4.5);
    for(let i=0;i<3;i++)h.api.rotate(90);close(h.items()[0].x,3);close(h.items()[1].x,6);close(h.items()[0].angle,0);
    h.api.clearSelection();h.select('a');const handle=h.$('selectionOverlay').querySelector('.rotate-handle');
    const endAngle=(-90+33.3)*Math.PI/180;
    h.drag(handle,{x:150,y:90},{x:(3+1.2*Math.cos(endAngle))*50,y:(3+1.2*Math.sin(endAngle))*50});
    close(h.items()[0].angle,33.3);close(h.items()[0].x,3);close(h.items()[0].y,3);
});

test('single resize follows local axes after 90° rotation and keeps the opposite corner fixed',()=>{
    const draft=initial();draft.tables[0].angle=90;const h=harness(draft);h.select('a');
    const before=h.run('FloorPlan.polygons(floorDraft,floorDraft.tables[0])[0]');
    h.drag(h.$('selectionOverlay').querySelector('.resize-se'),{x:125,y:200},{x:105,y:250});
    const item=h.items()[0],after=h.run('FloorPlan.polygons(floorDraft,floorDraft.tables[0])[0]');
    close(item.width,3);close(item.depth,1.4);close(item.x,2.8);close(item.y,3.5);close(after.x,before.x);close(after.y,before.y);
});

test('group resize scales positions and dimensions uniformly around the group centre',()=>{
    const h=harness();h.select('a');h.select('b',{shiftKey:true});
    h.drag(h.$('selectionOverlay').querySelector('.resize-se'),{x:350,y:175},{x:375,y:180});
    const items=h.items();close(items[0].width,2.4);close(items[0].depth,1.2);close(items[1].x-items[0].x,3.6);close((items[0].x+items[1].x)/2,4.5);
});

test('transformations outside the room are refused without shifting the pivot',()=>{
    const draft=initial();draft.tables=[table({x:0.25,width:3,depth:0.5,angle:90})];const h=harness(draft);h.select('a');h.api.rotate(90);
    close(h.items()[0].angle,90);close(h.items()[0].x,0.25);assert.match(h.$('editorStatus').textContent,/limites/);assert.equal(h.$('undoFloorBtn').disabled,true);
});

test('second touch restores the full gesture snapshot and creates no history entry',()=>{
    const h=harness();h.api.setSnap(false);h.select('b');
    h.fire(h.button('a'),'pointerdown',{pointerId:11,pointerType:'touch',isPrimary:true,clientX:150,clientY:150});
    h.fire(h.document.body,'pointermove',{pointerId:11,pointerType:'touch',clientX:190,clientY:160});h.flush();close(h.items()[0].x,3.8);
    h.fire(h.button('b'),'pointerdown',{pointerId:12,pointerType:'touch',isPrimary:false,clientX:300,clientY:150});
    close(h.items()[0].x,3);close(h.items()[0].y,3);assert.deepEqual(h.selected(),['b']);assert.equal(h.$('undoFloorBtn').disabled,true);
    h.fire(h.document.body,'pointerup',{pointerId:11,pointerType:'touch'});h.fire(h.document.body,'pointerup',{pointerId:12,pointerType:'touch'});h.flush();close(h.items()[0].x,3);
    h.select('a');assert.deepEqual(h.selected(),['a']);
});

test('mobile multiple selection allows dragging members and toggles them off only on a tap',()=>{
    const h=harness();h.api.setSnap(false);h.api.setMulti(true);
    const tap=(id,pointerId)=>{
        const button=h.button(id),item=h.items().find(item=>item.id===id),event={pointerId,pointerType:'touch',isPrimary:true,clientX:item.x*50,clientY:item.y*50};
        h.fire(button,'pointerdown',event);h.fire(h.document.body,'pointerup',event);h.fire(button,'click',{detail:1});
    };
    tap('a',11);tap('b',12);assert.deepEqual(h.selected(),['a','b']);
    h.drag(h.button('a'),{x:150,y:150},{x:200,y:160},{pointerId:13,pointerType:'touch',isPrimary:true});
    assert.deepEqual(h.selected(),['a','b']);close(h.items()[0].x,4);close(h.items()[1].x,7);close(h.items()[0].y,3.2);close(h.items()[1].y,3.2);
    tap('a',14);assert.deepEqual(h.selected(),['b']);close(h.items()[0].x,4);
    h.api.undo();close(h.items()[0].x,3);close(h.items()[1].x,6);
});

test('pointer isolation, cancellation and frame coalescing preserve the draft',()=>{
    const h=harness();h.api.setSnap(false);h.fire(h.button('a'),'pointerdown',{clientX:150,clientY:150,pointerId:7});
    h.fire(h.document.body,'pointermove',{clientX:250,clientY:150,pointerId:99});assert.equal(h.frames.size,0);
    for(let x=160;x<=200;x+=10)h.fire(h.document.body,'pointermove',{clientX:x,clientY:150,pointerId:7});
    assert.equal(h.frames.size,1);close(h.items()[0].x,3);h.flush();close(h.items()[0].x,4);
    assert.equal(h.document.captures.get(7),h.button('a'));
    h.fire(h.document.body,'pointercancel',{pointerId:7});close(h.items()[0].x,3);assert.equal(h.$('undoFloorBtn').disabled,true);
});

test('history retains 60 operations, includes external forms and rooms and invalidates redo after edits',()=>{
    const h=harness();for(let i=0;i<65;i++)h.run('floorDraft.tables[0].x+=0.01;afficherTables()');
    for(let i=0;i<60;i++)h.api.undo();close(h.items()[0].x,3.05);assert.equal(h.$('undoFloorBtn').disabled,true);
    for(let i=0;i<60;i++)h.api.redo();close(h.items()[0].x,3.65);
    h.run("floorDraft.rooms.push({id:'terrace',name:'Terrace',width:12,depth:10,floor:'plain'});afficherTables()");h.api.undo();assert.equal(h.run('floorDraft.rooms.length'),1);
    h.run('floorDraft.tables[0].capacity=8;afficherTables()');assert.equal(h.$('redoFloorBtn').disabled,true);h.api.undo();assert.equal(h.items()[0].capacity,4);
});

test('group duplication preserves geometry, creates global table numbers and stays independent of persistence',()=>{
    const draft=initial();draft.rooms.push({id:'other',name:'Other',width:12,depth:10,floor:'plain'});draft.tables.push(table({id:'other',number:99,roomId:'other'}));
    const h=harness(draft);h.select('a');h.select('b',{shiftKey:true});h.api.duplicate();const items=h.items(),copies=items.filter(t=>!['a','b','other'].includes(t.id));
    assert.equal(copies.length,2);assert.deepEqual(copies.map(t=>t.number),[100,101]);assert.equal(new Set(items.map(t=>t.id)).size,5);
    close(copies[1].x-copies[0].x,3);close(copies[1].y-copies[0].y,0);assert.equal(copies[0].width,2);assert.equal(h.selected().length,2);
    assert.equal(h.run('FloorPlan.get().tables.some(t=>t.number===100)'),false);h.api.undo();assert.equal(h.items().length,3);
});

test('deletion refuses protected groups atomically and confirms allowed deletions',()=>{
    const h=harness();h.select('a');h.select('b',{shiftKey:true});h.protectedNumbers.add(1);h.api.remove();assert.equal(h.items().length,2);assert.equal(h.confirms.length,0);assert.match(h.$('editorStatus').textContent,/réservation/);
    h.protectedNumbers.clear();h.setConfirm(false);h.api.remove();assert.equal(h.items().length,2);h.setConfirm(true);h.api.remove();assert.equal(h.items().length,0);h.api.undo();assert.equal(h.items().length,2);
});

test('snap uses physical grid coordinates with visual guides and can be disabled',()=>{
    const h=harness();h.fire(h.button('a'),'pointerdown',{clientX:150,clientY:150});
    h.fire(h.document.body,'pointermove',{clientX:156.35,clientY:150});h.flush();close(h.items()[0].x,3.1);assert(h.$('tablesGrid').querySelectorAll('.snap-guide').length>0);
    h.fire(h.document.body,'pointerup',{clientX:156.35,clientY:150});h.api.setSnap(false);
    h.drag(h.button('a'),{x:155,y:150},{x:161.35,y:150});close(h.items()[0].x,3.227);assert.equal(h.$('tablesGrid').querySelectorAll('.snap-guide').length,0);
});

test('neighbour alignment takes precedence over a closer grid intersection',()=>{
    const h=harness();
    h.fire(h.button('b'),'pointerdown',{clientX:300,clientY:150});
    h.fire(h.document.body,'pointermove',{clientX:153,clientY:230});h.flush();
    close(h.items()[1].x,3);
    assert(h.$('tablesGrid').querySelectorAll('.snap-guide-x').length>0);
    h.fire(h.document.body,'pointerup',{clientX:153,clientY:230});
});

test('keyboard steps, edit-field protection, save shortcut and viewport centre work',()=>{
    const h=harness();h.select('a');h.fire(h.document.body,'keydown',{key:'ArrowRight'});close(h.items()[0].x,3.1);
    h.fire(h.document.body,'keydown',{key:'ArrowRight',shiftKey:true});close(h.items()[0].x,3.11);
    const input=h.document.createElement('input');h.document.body.append(input);h.fire(input,'keydown',{key:'ArrowRight'});close(h.items()[0].x,3.11);
    h.fire(h.document.body,'keydown',{key:'s',ctrlKey:true});assert.equal(h.saves.count,1);
    h.$('tablesGrid').rect={left:-100,top:-50,width:600,height:500};const centre=h.api.visibleCenter();close(centre.x,5);close(centre.y,3.5);
});

test('newly added objects are selected and collision feedback stays temporary',()=>{
    const h=harness();h.run("floorDraft.tables.push({...floorDraft.tables[0],id:'new',number:80});afficherTables()");assert.deepEqual(h.selected(),['new']);
    assert(h.button('new').classList.contains('floor-collision'));assert.match(h.$('editorStatus').textContent,/chevauchent/);
    h.api.undo();assert.equal(h.items().length,2);assert.equal(h.button('a').classList.contains('floor-collision'),false);
});

test('property edits are one atomic history operation and preserve reserved table identities',()=>{
    const h=harness();h.protectedNumbers.add(1);h.select('a');const before=h.items()[0],stored=h.run('JSON.stringify(FloorPlan.get())');
    assert.equal(h.api.setProperties({x:4.25,y:4.5,width:2.4,depth:0.8,angle:-315,color:'#123abc'}),true);
    const after=h.items()[0];close(after.x,4.25);close(after.y,4.5);close(after.width,2.4);close(after.depth,0.8);close(after.angle,45);assert.equal(after.color,'#123abc');
    for(const field of ['id','number','roomId','capacity','capacityMin','letter'])assert.equal(after[field],before[field]);
    assert.equal(h.run('JSON.stringify(FloorPlan.get())'),stored);h.api.undo();assert.deepEqual(h.items()[0],before);assert.equal(h.$('undoFloorBtn').disabled,true);h.api.redo();assert.deepEqual(h.items()[0],after);
});

test('invalid properties, unapproved fields and oriented limit violations leave the draft unchanged',()=>{
    const h=harness();h.select('a');const before=JSON.stringify(h.items());
    for(const values of [null,[],{id:'hijack'},{number:99},{roomId:'other'},{capacity:100},{width:0.09},{depth:-1},{x:NaN},{y:Infinity},{angle:NaN},{color:'#fff'},{x:'4'},{x:-0.1,width:4},{x:11.8,width:3,depth:0.8,angle:45}]){
        assert.equal(h.api.setProperties(values),false);assert.equal(JSON.stringify(h.items()),before);assert.equal(h.$('undoFloorBtn').disabled,true);
    }
    h.select('b',{shiftKey:true});assert.equal(h.api.setProperties({color:'#ffffff'}),false);assert.equal(JSON.stringify(h.items()),before);
    const nearEdge=initial();nearEdge.tables=[table({width:3,depth:0.4,x:0.25,angle:90})];const edge=harness(nearEdge);edge.select('a');
    assert.equal(edge.api.setProperties({angle:0}),false);close(edge.items()[0].angle,90);close(edge.items()[0].x,0.25);
});

test('selection and property edits refresh the adaptive properties panel and hide it after exit',()=>{
    const h=harness();h.run('var propertyUpdates=[];var FloorProperties={update(items){propertyUpdates.push(items.map(item=>({id:item.id,x:item.x})));}};');
    h.select('a');assert.equal(h.run('propertyUpdates.at(-1)[0].id'),'a');h.api.setProperties({x:4});close(h.run('propertyUpdates.at(-1)[0].x'),4);
    h.api.clearSelection();assert.equal(h.run('propertyUpdates.at(-1).length'),0);h.run('floorDraft=null;afficherTables()');assert.equal(h.run('propertyUpdates.at(-1).length'),0);
});

test('rotation handles stay inside the room near angled edges at every zoom level',()=>{
    for(const zoom of [0.4,1,2.5])for(const angle of [0,45,90,180,270]){
        const radians=angle*Math.PI/180,width=1.5,depth=0.8,boxWidth=width*Math.abs(Math.cos(radians))+depth*Math.abs(Math.sin(radians)),boxDepth=width*Math.abs(Math.sin(radians))+depth*Math.abs(Math.cos(radians));
        const draft=initial();draft.tables=[table({x:boxWidth/2+0.01,y:boxDepth/2+0.01,width,depth,angle})];const h=harness(draft);
        h.$('tablesGrid').rect={left:0,top:0,width:600*zoom,height:500*zoom};h.run('FloorZoom.getScale=()=>'+zoom);h.select('a');
        const handle=h.$('selectionOverlay').querySelector('.rotate-handle'),item=h.items()[0],lx=(parseFloat(handle.style.left)/100-0.5)*width,ly=(parseFloat(handle.style.top)/100-0.5)*depth;
        const x=item.x+lx*Math.cos(radians)-ly*Math.sin(radians),y=item.y+lx*Math.sin(radians)+ly*Math.cos(radians),margin=22/(50*zoom);
        assert(x>=margin-1e-8&&y>=margin-1e-8);assert(x<=12-margin+1e-8&&y<=10-margin+1e-8);
        assert.match(handle.style.transform,/translate\(-50%,-50%\)/);
    }
});

test('small selected objects retain a clear drag centre between the enlarged corner hit targets',()=>{
    for(const zoom of [0.4,1,2.5])for(const angle of [0,37]){
        const draft=initial();draft.tables=[table({width:0.5,depth:0.5,angle})];const h=harness(draft);
        h.$('tablesGrid').rect={left:0,top:0,width:600*zoom,height:500*zoom};h.run('FloorZoom.getScale=()=>'+zoom);h.select('a');
        const node=h.$('selectionOverlay'),ppm=50*zoom;
        for(const handle of node.querySelectorAll('.resize-handle')){
            const x=(parseFloat(handle.style.left)/100-0.5)*0.5*ppm,y=(parseFloat(handle.style.top)/100-0.5)*0.5*ppm;
            assert(Math.abs(x)>=32-1e-8&&Math.abs(y)>=32-1e-8);
            assert(!(Math.abs(x)<=23&&Math.abs(y)<=23),'A corner hit target must not intercept the object centre');
        }
    }
});

test('small group resizing uses pointer displacement without jumping to the distant handle position',()=>{
    const draft=initial();draft.tables=[table({width:0.2,depth:0.2}),table({id:'b',number:2,x:3.4,width:0.2,depth:0.2})];
    const h=harness(draft);h.select('a');h.select('b',{shiftKey:true});const handle=h.$('selectionOverlay').querySelector('.resize-se');
    h.drag(handle,{x:192,y:182},{x:197,y:182});
    const items=h.items();close(items[0].width,0.26);close(items[0].depth,0.26);close(items[1].x-items[0].x,0.52);close((items[0].x+items[1].x)/2,3.2);
});

test('rotation of a small object at the room corner uses a free inward target',()=>{
    const draft=initial();draft.tables=[table({x:0.25,y:0.25,width:0.5,depth:0.5})];const h=harness(draft);h.select('a');
    const handle=h.$('selectionOverlay').querySelector('.rotate-handle'),lx=(parseFloat(handle.style.left)/100-0.5)*25,ly=(parseFloat(handle.style.top)/100-0.5)*25;
    assert.equal(handle.hidden,false);assert(Math.hypot(lx,ly)>=43.9);assert(!(Math.abs(lx)<=23&&Math.abs(ly)<=23));
    for(const [x,y] of [[-32,-32],[32,-32],[32,32],[-32,32]])assert(Math.max(Math.abs(lx-x),Math.abs(ly-y))>=30);
    assert.equal(handle.dataset.inset,'true');
});

test('selection handles never intercept a nearby object centre in the snap regression',()=>{
    for(const zoom of [0.4,1,2.5]){
        const draft=initial();draft.tables[1].x=3.13;draft.tables[1].y=4.6;const h=harness(draft);
        h.$('tablesGrid').rect={left:0,top:0,width:600*zoom,height:500*zoom};h.run('FloorZoom.getScale=()=>'+zoom);h.select('b');
        const source=h.items()[1],other=h.items()[0],ppm=50*zoom;
        for(const handle of h.$('selectionOverlay').querySelectorAll('.editor-handle')){
            if(handle.hidden)continue;
            const x=(parseFloat(handle.style.left)/100-0.5)*source.width,y=(parseFloat(handle.style.top)/100-0.5)*source.depth;
            const dx=other.x-source.x-x,dy=other.y-source.y-y;
            assert(Math.max(Math.abs(dx),Math.abs(dy))*ppm>=26-1e-8,'A handle must not cover table 1');
        }
        h.select('a');assert.deepEqual(h.selected(),['a']);
    }
});

test('small corner handles move outward when their initial position covers another object',()=>{
    const draft=initial();draft.tables=[table({width:0.5,depth:0.5}),table({id:'b',number:2,x:3.64,y:3.64,width:0.3,depth:0.3})];
    const h=harness(draft);h.select('a');const handle=h.$('selectionOverlay').querySelector('.resize-se');assert.equal(handle.hidden,false);
    const x=(parseFloat(handle.style.left)/100-0.5)*0.5,y=(parseFloat(handle.style.top)/100-0.5)*0.5;
    assert(Math.max(Math.abs(x-0.64),Math.abs(y-0.64))*50>=26-1e-8);
});
