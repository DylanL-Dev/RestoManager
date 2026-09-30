'use strict';
// Original vector drawings for RestoManager, with a consistent overhead style.
const FloorArt = (() => {
    const chair=(x,y,angle=0)=>`<g transform="translate(${x} ${y}) rotate(${angle})"><rect class="furniture-chair" x="-8" y="-5" width="16" height="10" rx="4"/><path class="furniture-line" d="M-5 -2H5"/></g>`;
    function table(item){
        const count=Math.min(12,item.capacity),chairs=[];
        if(item.shape==='round'){
            for(let i=0;i<count;i++){const angle=i*360/count,r=angle*Math.PI/180;chairs.push(chair(50+39*Math.sin(r),50-39*Math.cos(r),angle));}
            return svg(chairs.join('')+'<circle class="furniture-top" cx="50" cy="50" r="29"/><circle class="furniture-line" cx="50" cy="50" r="24"/>');
        }
        if(item.shape==='bench')return svg('<rect class="furniture-chair" x="12" y="8" width="76" height="16" rx="6"/><path class="furniture-line" d="M16 13H84M37 8V24M63 8V24"/><rect class="furniture-top" x="12" y="31" width="76" height="38" rx="7"/><rect class="furniture-chair" x="12" y="76" width="76" height="16" rx="6"/><path class="furniture-line" d="M16 87H84M37 76V92M63 76V92"/>');
        if(item.shape==='square'&&count<=4){
            [[50,9,0],[50,91,180],[9,50,-90],[91,50,90]].slice(0,count).forEach(p=>chairs.push(chair(...p)));
        }else{const top=Math.ceil(count/2),bottom=Math.floor(count/2);for(let i=0;i<top;i++)chairs.push(chair(15+(i+0.5)*70/top,9));for(let i=0;i<bottom;i++)chairs.push(chair(15+(i+0.5)*70/bottom,91,180));}
        return svg(chairs.join('')+'<rect class="furniture-top" x="17" y="20" width="66" height="60" rx="8"/><rect class="furniture-line" x="22" y="25" width="56" height="50" rx="5"/>');
    }
    const drawings={
        bar:'<rect class="furniture-top" x="3" y="10" width="94" height="75" rx="12"/><path class="furniture-line" d="M10 22H90M10 73H90"/><circle class="furniture-chair" cx="20" cy="93" r="5"/><circle class="furniture-chair" cx="50" cy="93" r="5"/><circle class="furniture-chair" cx="80" cy="93" r="5"/>',
        wall:'<rect class="furniture-solid" x="0" y="0" width="100" height="100"/><path class="furniture-detail" d="M0 50H100M25 0V50M75 0V50M50 50V100"/>',
        door:'<path class="furniture-line heavy" d="M7 95V7H93"/><path class="furniture-door" d="M7 95A88 88 0 0 1 95 7"/><path class="furniture-line heavy" d="M7 95L95 95"/>',
        window:'<rect class="furniture-top" x="0" y="5" width="100" height="90" rx="2"/><path class="furniture-line" d="M0 35H100M0 65H100M33 5V95M66 5V95"/>',
        pillar:'<rect class="furniture-solid" x="5" y="5" width="90" height="90" rx="3"/><path class="furniture-detail" d="M20 20L80 80M80 20L20 80"/>',
        plant:'<circle class="plant-pot" cx="50" cy="50" r="38"/><ellipse class="furniture-solid" cx="35" cy="34" rx="13" ry="23" transform="rotate(-40 35 34)"/><ellipse class="furniture-solid" cx="67" cy="34" rx="13" ry="23" transform="rotate(40 67 34)"/><ellipse class="furniture-solid" cx="34" cy="67" rx="13" ry="23" transform="rotate(40 34 67)"/><ellipse class="furniture-solid" cx="65" cy="66" rx="13" ry="23" transform="rotate(-40 65 66)"/><circle class="furniture-top" cx="50" cy="50" r="11"/>',
        kitchen:'<rect class="furniture-top" x="3" y="3" width="94" height="94" rx="8"/><rect class="furniture-line" x="10" y="12" width="43" height="40" rx="3"/><circle class="furniture-line" cx="21" cy="24" r="6"/><circle class="furniture-line" cx="42" cy="24" r="6"/><circle class="furniture-line" cx="21" cy="42" r="6"/><circle class="furniture-line" cx="42" cy="42" r="6"/><rect class="furniture-line" x="65" y="12" width="24" height="40" rx="6"/><path class="furniture-line" d="M10 68H90M30 68V90M65 68V90"/>',
        toilets:'<rect class="furniture-top" x="3" y="3" width="94" height="94" rx="8"/><path class="furniture-line" d="M50 10V90"/><circle class="furniture-solid" cx="28" cy="27" r="7"/><circle class="furniture-solid" cx="73" cy="27" r="7"/><path class="furniture-line heavy" d="M28 42V77M17 52H39M18 82L28 67L38 82M73 43V78M62 54H84M64 82L73 67L82 82"/>',
        zone:'<rect class="furniture-zone" x="3" y="3" width="94" height="94" rx="5"/>'
    };
    function svg(content){return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">'+content+'</svg>';}
    function render(item){return item.number!==undefined?table(item):svg(drawings[item.type]||drawings.zone);}
    return {render};
})();
