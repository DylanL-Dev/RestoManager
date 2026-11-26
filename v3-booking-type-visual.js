// RM-SEC-04: externalised verbatim from v3-connected.html so the page can use script-src 'self'.
(function(){const select=document.getElementById('bookingType');const radios=document.querySelectorAll('input[name="bookingTypeVisual"]');radios.forEach(r=>r.addEventListener('change',()=>{if(r.checked){select.value=r.value;select.dispatchEvent(new Event('change',{bubbles:true}))}}));})();
