'use strict';
// Layered vector furniture: bevelled materials and visible thickness, with no external assets.
const FloorArt=(()=>{
 let serial=0;
 const chair=(x,y,a=0)=>`<g transform="translate(${x} ${y}) rotate(${a})"><rect class="furniture-shadow" x="-10" y="-5" width="20" height="17" rx="6"/><rect class="chair-frame" x="-9" y="-7" width="18" height="18" rx="6"/><rect class="furniture-chair" x="-8" y="-8" width="16" height="15" rx="5"/><rect class="chair-cushion" x="-6" y="-4" width="12" height="10" rx="4"/><path class="chair-back" d="M-8 -2V-6Q0 -12 8 -6V-2"/><path class="material-glint" d="M-4 -3Q0 -5 4 -3"/></g>`;
 const plate=(x,y)=>`<g transform="translate(${x} ${y})"><ellipse class="plate-shadow" cy="2" rx="6" ry="5"/><circle class="table-plate" r="5"/><circle class="plate-rim" r="3.6"/><path class="cutlery" d="M-8 -4V4M7 -4V4M-9 -4V-1M-7 -4V-1"/><circle class="table-glass" cx="8" cy="-6" r="2"/></g>`;
 function top(shape){return '<g transform="translate(0 5)" class="table-thickness">'+shape.replace(/furniture-top/g,'table-edge')+'</g>'+shape;}
 function table(item){
  const n=Math.max(1,Math.min(12,item.capacity||2)), chairs=[],places=[];
  let surface;
  if(item.shape==='round'){
   for(let i=0;i<n;i++){const a=i*360/n,r=a*Math.PI/180;chairs.push(chair(50+40*Math.sin(r),50-40*Math.cos(r),a));if(i<6)places.push(plate(50+21*Math.sin(r),50-21*Math.cos(r)));}
   surface='<circle class="furniture-top" cx="50" cy="49" r="29"/>';
  }else if(item.shape==='bench'){
   for(const y of [3,76])chairs.push(`<g transform="translate(0 ${y})"><rect class="chair-frame" x="9" y="4" width="82" height="19" rx="7"/><rect class="furniture-chair" x="9" y="0" width="82" height="19" rx="7"/><path class="chair-back" d="M13 6H87"/><path class="seat-seam" d="M36 8V18M64 8V18"/></g>`);
   surface='<rect class="furniture-top" x="10" y="29" width="80" height="40" rx="6"/>';for(const x of [27,73])for(const y of [39,60])places.push(plate(x,y));
  }else{
   if(item.shape==='square'&&n<=4){[[50,9,0],[50,90,180],[9,50,-90],[91,50,90]].slice(0,n).forEach(p=>chairs.push(chair(...p)));[[35,34],[65,65]].forEach(p=>places.push(plate(...p)));}
   else{for(let i=0;i<n;i++){const row=i%2,col=Math.floor(i/2),cols=Math.ceil(n/2),x=22+(col+.5)*56/cols;chairs.push(chair(x,row?90:9,row?180:0));if(i<6)places.push(plate(x,row?65:33));}}
   surface='<rect class="furniture-top" x="18" y="20" width="64" height="58" rx="5"/>';
  }
  return svg('<ellipse class="ground-shadow" cx="52" cy="58" rx="39" ry="34"/>'+chairs.join('')+'<path class="table-legs" d="M24 32V84M76 32V84"/>'+top(surface)+places.join(''),'table');
 }
 function plant(){let leaves='';for(let i=0;i<11;i++){const a=i*137.5;leaves+=`<g transform="rotate(${a} 50 49)"><path class="plant-leaf furniture-solid" d="M50 51Q24 48 35 15Q59 24 50 51Z"/><path class="leaf-vein" d="M50 49L36 20"/></g>`;}return '<ellipse class="ground-shadow" cx="54" cy="60" rx="35" ry="29"/><circle class="plant-pot" cx="50" cy="55" r="24"/><circle class="pot-soil" cx="50" cy="50" r="20"/>'+leaves;}
 const drawings={
  bar:()=>'<rect class="ground-shadow" x="5" y="19" width="92" height="70" rx="8"/>'+top('<rect class="furniture-top" x="3" y="8" width="94" height="60" rx="7"/>')+'<path class="bar-panel" d="M8 70H92V81H8Z"/>'+[20,50,80].map(x=>chair(x,89)).join('')+'<path class="brass-rail" d="M8 20H92"/>',
  plant,
  wall:()=>'<rect class="wall-side" x="0" y="12" width="100" height="88"/><rect class="wall-top" x="0" y="0" width="100" height="82"/><path class="wall-highlight" d="M0 2H100"/>',
  pillar:()=>'<rect class="wall-side" x="10" y="16" width="82" height="80" rx="3"/><rect class="wall-top" x="7" y="5" width="82" height="80" rx="3"/><rect class="pillar-inset" x="17" y="15" width="62" height="60" rx="2"/>',
  door:()=>'<path class="door-swing" d="M10 91A81 81 0 0 1 91 10"/><path class="door-frame" d="M6 94V6H94"/><path class="door-panel" d="M10 91L79 52L84 60L14 99Z"/><circle class="door-handle" cx="72" cy="60" r="3"/>',
  window:()=>'<rect class="window-frame" x="0" y="5" width="100" height="90" rx="3"/><rect class="window-glass" x="7" y="12" width="86" height="70"/><path class="window-shine" d="M12 65L50 15M40 76L80 23"/><path class="window-divider" d="M50 10V85M5 48H95"/><rect class="window-sill" x="0" y="85" width="100" height="12" rx="2"/>',
  kitchen:()=>'<rect class="metal-side" x="4" y="12" width="92" height="85" rx="5"/><rect class="metal-top" x="3" y="3" width="92" height="82" rx="5"/><rect class="hob" x="10" y="12" width="42" height="47" rx="3"/>'+[ [21,24],[41,24],[21,47],[41,47] ].map(([x,y])=>`<circle class="burner" cx="${x}" cy="${y}" r="7"/>`).join('')+'<rect class="sink" x="63" y="14" width="24" height="43" rx="7"/><path class="tap" d="M74 20V10Q82 5 84 15"/><path class="cabinet-line" d="M7 69H90M32 69V84M62 69V84"/>',
  toilets:()=>'<rect class="wall-top" x="3" y="3" width="94" height="94" rx="5"/><path class="wall-highlight" d="M50 5V95"/>'+[27,73].map(x=>`<rect class="ceramic" x="${x-12}" y="16" width="24" height="17" rx="4"/><ellipse class="ceramic" cx="${x}" cy="52" rx="13" ry="22"/><ellipse class="toilet-bowl" cx="${x}" cy="52" rx="8" ry="14"/>`).join(''),
  zone:()=>'<rect class="furniture-zone" x="3" y="3" width="94" height="94" rx="5"/>'
 };
 function svg(content,type){
  const id='material-'+(++serial);
  const gradient=(name,stops)=>`<linearGradient id="${id}-${name}" x2=".7" y2="1">${stops.map(([o,c])=>`<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const defs='<defs>'+gradient('wood',[['0','#d7b98b'],['.4','var(--furniture-color)'],['1','#644a30']])+gradient('seat',[['0','#718a76'],['.5','#355a49'],['1','#1c352c']])+gradient('leaf',[['0','#8fbd63'],['.45','var(--furniture-color)'],['1','#174c32']])+`<pattern id="${id}-grain" width="13" height="100" patternUnits="userSpaceOnUse"><rect width="13" height="100" fill="url(#${id}-wood)"/><path d="M3 0Q7 30 3 60T3 100M10 0Q6 30 10 60T10 100" fill="none" stroke="#f6ddba" stroke-opacity=".18" stroke-width=".7"/></pattern></defs>`;
  content=content.replace(/class="furniture-top"/g,`class="furniture-top" style="fill:url(#${id}-grain)"`).replace(/class="furniture-chair"/g,`class="furniture-chair" style="fill:url(#${id}-seat)"`).replace(/class="plant-leaf furniture-solid"/g,`class="plant-leaf furniture-solid" style="fill:url(#${id}-leaf)"`);
  return `<svg class="volume-art art-${type}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">${defs}${content}</svg>`;
 }
 return {render:item=>item.number!==undefined?table(item):svg((drawings[item.type]||drawings.zone)(),item.type)};
})();
