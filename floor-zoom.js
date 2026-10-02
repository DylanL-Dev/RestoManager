'use strict';
const FloorZoom = (() => {
    let scale = 1, baseWidth = 576, baseHeight = 576, pinch = null, ignoreUntil = 0, roomKey = '';
    const metresToPixels = 48;
    const clamp = value => {
        const viewport=document.getElementById('floorViewport');
        const minimum=Math.min(0.4,(viewport.clientWidth||580)/baseWidth,(viewport.clientHeight||580)/baseHeight);
        return Math.max(minimum,Math.min(2.5,value));
    };
    function setScale(next, anchor) {
        const viewport = document.getElementById('floorViewport');
        const canvas = document.getElementById('tablesGrid');
        const stage = document.getElementById('floorStage');
        const point = anchor || { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
        const x = (viewport.scrollLeft + point.x) / scale, y = (viewport.scrollTop + point.y) / scale;
        scale = clamp(next);
        canvas.style.width = baseWidth + 'px'; canvas.style.height = baseHeight + 'px';
        canvas.style.transform = 'scale(' + scale + ')';
        stage.style.width = baseWidth * scale + 'px'; stage.style.height = baseHeight * scale + 'px';
        viewport.scrollLeft = Math.max(0, x * scale - point.x); viewport.scrollTop = Math.max(0, y * scale - point.y);
        document.getElementById('zoomLevel').textContent = Math.round(scale * 100) + ' %';
    }
    function fit() {
        const viewport = document.getElementById('floorViewport');
        if (!viewport.clientWidth) return;
        setScale(Math.min(1, viewport.clientWidth / baseWidth, (viewport.clientHeight || 580) / baseHeight));
        viewport.scrollLeft = 0; viewport.scrollTop = 0;
    }
    function updateRoom(plan,id,growth) {
        const room=plan.rooms.find(r=>r.id===id);
        const key=id+':'+room.width+':'+room.depth;
        if(key===roomKey)return;
        roomKey=key;baseWidth=room.width*metresToPixels;baseHeight=room.depth*metresToPixels;
        if(growth){
            const viewport=document.getElementById('floorViewport');
            const left=viewport.scrollLeft+growth.x*metresToPixels*scale,top=viewport.scrollTop+growth.y*metresToPixels*scale;
            setScale(scale);viewport.scrollLeft=left;viewport.scrollTop=top;
        }else fit();
    }
    document.addEventListener('DOMContentLoaded', () => {
        const viewport = document.getElementById('floorViewport');
        updateRoom(currentPlan(), floorRoom); fit();
        document.getElementById('zoomInBtn').addEventListener('click', () => setScale(scale * 1.2));
        document.getElementById('zoomOutBtn').addEventListener('click', () => setScale(scale / 1.2));
        document.getElementById('zoomFitBtn').addEventListener('click', fit);
        viewport.addEventListener('wheel', event => {
            if (!event.deltaY) return;
            event.preventDefault(); const rect = viewport.getBoundingClientRect();
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
            setScale(scale * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.003), { x:event.clientX-rect.left, y:event.clientY-rect.top });
        }, { passive:false });
        let pan=null;
        viewport.addEventListener('pointerdown',event=>{
            if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('button'))return;
            pan={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
            viewport.setPointerCapture(event.pointerId);viewport.classList.add('panning');
        });
        viewport.addEventListener('pointermove',event=>{if(!pan)return;viewport.scrollLeft=pan.left+pan.x-event.clientX;viewport.scrollTop=pan.top+pan.y-event.clientY;});
        const stopPan=()=>{pan=null;viewport.classList.remove('panning');};
        viewport.addEventListener('pointerup',stopPan);viewport.addEventListener('pointercancel',stopPan);
        const distance = touches => Math.hypot(touches[1].clientX-touches[0].clientX, touches[1].clientY-touches[0].clientY);
        viewport.addEventListener('touchstart', event => {
            if (event.touches.length !== 2) return;
            event.preventDefault(); pinch = { distance:distance(event.touches), scale };
            ignoreUntil = Date.now() + 400;
        }, { passive:false });
        viewport.addEventListener('touchmove', event => {
            if (!pinch || event.touches.length !== 2) return;
            event.preventDefault(); const rect=viewport.getBoundingClientRect();
            if (pinch.distance > 0) setScale(pinch.scale * distance(event.touches) / pinch.distance, {
                x:(event.touches[0].clientX+event.touches[1].clientX)/2-rect.left,
                y:(event.touches[0].clientY+event.touches[1].clientY)/2-rect.top
            });
        }, { passive:false });
        const end = event => { if (pinch && event.touches.length < 2) { pinch=null; ignoreUntil=Date.now()+400; } };
        viewport.addEventListener('touchend',end); viewport.addEventListener('touchcancel',end);
        window.addEventListener('resize', () => { if (!pinch) fit(); });
    });
    return { setScale, fit, updateRoom, getScale:()=>scale, isPinching:()=>!!pinch, ignoreClick:()=>!!pinch || Date.now()<ignoreUntil };
})();
