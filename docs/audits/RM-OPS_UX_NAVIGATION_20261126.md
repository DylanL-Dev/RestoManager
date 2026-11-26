# RM-OPS UX — Navigation DEV

## Parcours

- Sur mobile et tablette, ouvrir le profil Restaurant puis activer « Mode Coup de feu », au-dessus de « Actualiser les données ». Le profil se ferme, le titre Express reçoit le focus et « Mode complet » rend le focus au profil. Sur ordinateur, le menu latéral fournit le même accès et récupère le focus au retour.
- Ouvrir le service sans fragment. Le tableau de bord commence en haut. « Voir les tables » conserve son défilement explicite. Les URL avec fragment conservent leur destination. Un formulaire ouvert garde sa saisie pendant un aller-retour Express.
- En Réception, vérifier l’absence de l’action Express. La recette utilise des comptes fictifs et un serveur local.

## Coordination avec le lot sécurité

Le brouillon part de DEV après #274. L’arbitrage du propriétaire autorise le versionnement dans `sw.js` et `v3-connected.html`. Les conflits avec #259 et #260 devront être résolus sur la branche candidate après synchronisation de DEV.

- Conserver intégralement le précache du SDK local, les scripts précachés de #260 et la logique d’activation existante. Donner au cache combiné un identifiant neuf et mettre à jour les assertions concernées.
- Conserver la CSP et les scripts externalisés de #260. Reporter uniquement le suffixe de chargement de `service-v3-screens.js` dans la page sous CSP.
- Relancer les contrôles CSP, fournisseurs locaux, Express et PWA lorsque le lot combiné sera prêt.
