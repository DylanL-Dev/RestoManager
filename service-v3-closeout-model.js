'use strict';
/* RM-012 presentation only. The RPC is the authority for dates, roles and actions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RestoCloseoutModel=api})(typeof window==='undefined'?globalThis:window,function(){
 const finalStates=new Set(['completed','released','departed','cancelled','no_show']);
 const labels={reserved:'Attendu',confirmed:'Confirmé',late:'En retard',arrived:'Arrivé, non installé',seated:'Installé',completed:'Servi',released:'Table libérée',departed:'Parti',cancelled:'Annulé',no_show:'Absent',open:'Ouvert',closed:'Clôturé'};
 const actions={release_table:{label:'Libérer la table',target:'released',title:'Confirmer le départ',description:'Confirmez que les clients ont quitté la table. Seule cette réservation sera finalisée.'},mark_absent:{label:'Confirmer l’absence',target:'no_show',title:'Confirmer l’absence du client',description:'Confirmez que le client ne s’est pas présenté. Aucun statut n’est déduit de son retard.'},mark_served:{label:'Le client a été servi',target:'completed',title:'Régulariser un service effectué',reason:true,description:'Le client a été servi mais son suivi n’a pas été terminé. Expliquez la correction.'},correct_arrival:{label:'Corriger une arrivée erronée',target:'confirmed',title:'Corriger le statut d’arrivée',reason:true,description:'L’arrivée a été enregistrée par erreur. La réservation redeviendra confirmée ; cette correction ne déclare pas le client absent.'}};
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&value>='0001-01-01'&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 function formatDate(value){return validDate(value)?value.split('-').reverse().join('/'):'Date à vérifier'}
 function formatTime(value){return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Horaire à vérifier'}
 function available(item,day){if(!day?.ended||day.closure)return [];if(item.status==='seated')return ['release_table'];if(['reserved','confirmed','late'].includes(item.status))return ['mark_absent','mark_served'];if(item.status==='arrived')return ['mark_served','correct_arrival'];return []}
 function validate(data,restaurant){
  const date=validDate;
  const day=d=>d&&date(d.date)&&typeof d.ended==='boolean'&&typeof d.can_close==='boolean'&&['pending','occupied_tables','awaited','arrived','unsupported','active_holds','total','served_covers'].every(k=>Number.isSafeInteger(d[k])&&d[k]>=0)&&(!d.can_close||d.ended&&!d.closure&&d.pending===0&&d.active_holds===0);
  return data?.schema===1&&data.restaurant_id===restaurant&&date(data.today)&&Number.isFinite(Date.parse(data.server_time))&&typeof data.revision==='string'&&Array.isArray(data.services)&&data.services.every(day)&&Array.isArray(data.notification_days)&&data.notification_days.every(day)&&Array.isArray(data.history)&&data.history.every(c=>date(c.service_date))&&day(data.selected)&&Array.isArray(data.selected.items)&&data.selected.items.every(i=>typeof i.id==='string'&&typeof i.version==='string'&&typeof i.status==='string'&&Array.isArray(i.tables))&&Array.isArray(data.selected.audit);
 }
 function notifications(days,context,{stale=false}={}){
  if(context?.role!=='fb_admin'||!context.restaurantId)return [];
  const unique=new Map(days.map(d=>[d.date,d]));
  return [...unique.values()].filter(d=>d.ended&&!d.closure).map(d=>{
   const toCheck=d.awaited+d.arrived+(d.unsupported||0);
   const text=d.pending||d.active_holds?d.occupied_tables+' table'+(d.occupied_tables>1?'s':'')+' encore occupée'+(d.occupied_tables>1?'s':'')+' · '+Math.max(toCheck,d.occupied_tables?0:d.pending)+' réservation'+(toCheck>1?'s':'')+' à vérifier'+(d.active_holds?' · '+d.active_holds+' maintien(s) actif(s)':'')+'.':'Vérifications terminées. La clôture reste à confirmer.';
   return {id:'service:'+d.date,restaurantId:context.restaurantId,serviceDate:d.date,type:'service-regularization',group:'important',priority:'high',title:'Service du '+formatDate(d.date)+' à régulariser',body:stale?'Informations à revérifier après reconnexion. '+text:text,createdAt:Date.parse(d.date+'T12:00:00Z'),revision:d.revision,resolved:false,dismissible:false,icon:'clipboard-check',targetScreen:'administration',actionLabel:'Régulariser ce service'};
  });
 }
 return {finalStates,labels,actions,formatDate,formatTime,available,validate,notifications};
});
