'use strict';
// Module de passage : initialisation différée.
(function(){const form=document.getElementById('walkinForm');if(!form)return;const message=document.getElementById('walkinFeedback');message.textContent='Gestion des passages en cours de développement : enregistrement désactivé.';form.addEventListener('submit',function(e){e.preventDefault();message.textContent='Enregistrement indisponible tant que les contrôles de disponibilité ne sont pas intégrés.';});})();
