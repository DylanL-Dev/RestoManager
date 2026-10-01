'use strict';
const FurnitureAssets=(()=>{
 const framing={"table-square-2": {"width": 169.919, "height": 106.091, "left": -35.095, "top": -2.2}, "table-square-4": {"width": 110.485, "height": 109.138, "left": -5.198, "top": -3.655}, "table-round-4": {"width": 120.115, "height": 119.542, "left": -9.866, "top": -11.058}, "table-round-2": {"width": 104.153, "height": 184.412, "left": -2.076, "top": -37.059}, "table-rectangle-6": {"width": 110.193, "height": 138.717, "left": -5.185, "top": -18.584}, "table-rectangle-10": {"width": 107.917, "height": 176.869, "left": -3.959, "top": -38.646}, "bench": {"width": 115.47, "height": 138.411, "left": -8.471, "top": -17.991}, "bar": {"width": 107.639, "height": 184.683, "left": -3.948, "top": -39.764}, "plant": {"width": 121.629, "height": 128.352, "left": -12.415, "top": -8.802}, "lamp": {"width": 258.557, "height": 114.208, "left": -79.175, "top": -6.284}, "wall": {"width": 112.265, "height": 354.237, "left": -6.356, "top": -127.684}, "door": {"width": 176.371, "height": 109.233, "left": -39.522, "top": -5.314}, "window": {"width": 110.973, "height": 147.877, "left": -5.487, "top": -22.995}, "pillar": {"width": 177.872, "height": 110.29, "left": -39.007, "top": -5.541}, "kitchen": {"width": 117.306, "height": 134.118, "left": -12.909, "top": -14.332}, "toilets": {"width": 142.825, "height": 148.754, "left": -21.412, "top": -24.911}, "chair": {"width": 164.136, "height": 116.543, "left": -32.068, "top": -5.483}, "buffet": {"width": 108.666, "height": 160.153, "left": -4.506, "top": -28.991}, "reception": {"width": 133.689, "height": 154.624, "left": -17.164, "top": -27.374}, "sofa": {"width": 107.825, "height": 304.369, "left": -3.869, "top": -100.0}};
 const elements=['bar','plant','lamp','wall','door','window','pillar','kitchen','toilets','chair','buffet','reception','sofa'];
 function key(item){
  const defaultColor=item.number!==undefined?'#8a5a29':({plant:'#28734f',window:'#28536d',wall:'#3b4553',toilets:'#6c3187'}[item.type]||'#8a5a29');
  if(item.color&&item.color.toLowerCase()!==defaultColor)return null;
  if(item.number===undefined)return elements.includes(item.type)?item.type:null;
  if(item.shape==='bench')return 'bench';
  if(item.shape==='square'&&[2,4].includes(item.capacity))return 'table-square-'+item.capacity;
  if(item.shape==='round'&&[2,4].includes(item.capacity))return 'table-round-'+item.capacity;
  if(item.shape==='rectangle'&&[6,10].includes(item.capacity))return 'table-rectangle-'+item.capacity;
  return null;
 }
 function render(item){
  const asset=key(item);if(!asset)return FloorArt.render(item);
  const frame=framing[asset]||{width:100,height:100,left:0,top:0};
  return '<span class="sprite-viewport"><img style="width:'+frame.width+'%;height:'+frame.height+'%;left:'+frame.left+'%;top:'+frame.top+'%" class="furniture-sprite" src="assets/furniture/'+asset+'.webp" alt="" draggable="false" decoding="async" onerror="this.parentElement.style.display=\'none\';this.parentElement.nextElementSibling.style.display=\'block\'"></span><span class="furniture-fallback" style="display:none">'+FloorArt.render(item)+'</span>';
 }
 return {key,render};
})();
