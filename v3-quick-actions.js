// RM-SEC-04: externalised verbatim from v3-connected.html so the page can use script-src 'self'.
document.querySelectorAll('.quickAction[href^="#"]').forEach(function(link){
 link.addEventListener('click',function(){
  const target=document.querySelector(link.getAttribute('href'));
  if(target&&target.tagName==='DETAILS')target.open=true;
 });
});
