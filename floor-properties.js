'use strict';
// The inspector submits one atomic geometry change to the existing draft history.
const FloorProperties=(()=>{
    const $=id=>document.getElementById(id);
    const fields={x:'quickX',y:'quickY',width:'quickWidth',depth:'quickDepth',angle:'quickAngle',color:'quickColor'};
    let itemId=null;
    function update(items,force=false){
        const single=items.length===1,item=items[0];
        itemId=single?item.id:null;
        $('quickSelectionSummary').textContent=single?(item.number!==undefined?'Table T'+item.number+(item.letter||''):item.label):items.length?items.length+' objets sélectionnés. Utilisez les poignées pour les transformer ensemble.':'Sélectionnez un objet sur le plan.';
        $('quickPropertiesForm').classList.toggle('hidden',!single);$('quickDetailsBtn').disabled=!single;
        $('quickPropertiesError').textContent='';
        if(single)for(const [key,id] of Object.entries(fields)){
            if(force||document.activeElement!==$(id))$(id).value=item[key];
        }
    }
    document.addEventListener('DOMContentLoaded',()=>{
        $('quickPropertiesForm').addEventListener('submit',event=>{
            event.preventDefault();
            if(!floorDraft||FloorEditor.selectedItems()[0]?.id!==itemId)return;
            const values=Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,key==='color'?$(id).value:Number($(id).value)]));
            if(FloorEditor.setProperties(values))update(FloorEditor.selectedItems(),true);else $('quickPropertiesError').textContent='Vérifiez les valeurs : l’objet doit rester dans la salle, avec des dimensions d’au moins 10 cm.';
        });
        $('quickDetailsBtn').addEventListener('click',()=>FloorEditor.properties());
    });
    return {update};
})();
