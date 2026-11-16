# RM-013-A — Corrections du retour de recette du 16/11/2026

Deux problèmes signalés sur le clone Render DEV : le panneau Clôture ne se dépliait pas et le réglage de durée « 1 h » présentait un double encadré peu lisible. Correctif sur `fix/rm013a-closure-duration`, créée depuis DEV `76a5a7e` ; aucune publication V3/MAIN ni écriture en base distante.

## Clôture

La protection authentifiée des clics bloquait tout identifiant contenant `closure`, dont le nouveau bouton de navigation `manageClosureToggle`. Le clic ne parvenait donc pas à l’accordéon. Le même filtre empêchait l’action `closureManual` d’atteindre son gestionnaire partagé existant.

- Les en-têtes `.rmManagementCategoryButton` sont reconnus comme navigation et ne sont plus assimilés à une mutation.
- `closureManual` rejoint les actions partagées autorisées uniquement pour Restaurant connecté ; Réception et connexion indisponible restent bloquées.
- Le gestionnaire de clôture existant et le RPC serveur ne changent pas. Date admissible, échéance de 23 h 30 pour le jour courant, réservations finalisées, confirmation et refus d’une deuxième clôture restent les règles appliquées.
- La rubrique reste pertinente pour consulter l’état et les archives du service. Aucun mécanisme de régularisation RM-012 ajouté.

Le test de protection ajouté reproduisait le blocage avant correction. Les tests navigateur ouvrent maintenant les rubriques par leurs **vrais boutons**, au lieu d’appeler directement l’API d’ouverture qui contournait le filtre de clics.

## Durée

- Suppression des styles hérités du cadre vert et des anciens sélecteurs liés à `#administration`, devenus inutiles depuis le déplacement vers Paramètres.
- Libellé et valeur sur une même ligne adaptative ; petite commande « 1 h » avec chevron, zone tactile d’au moins 44 px, explication en dessous et simple séparation avec les autres réglages.
- Mode sombre conservé. Aucun changement de durée réelle, d’options, de sélecteur ni de mécanisme de sauvegarde.
- CSS, module authentifié et cache PWA concernés versionnés en `20261116-rm013a2`. Les autres scripts gardent leur version inchangée.

## Validation

- Syntaxe : 133 fichiers, 0 erreur.
- `npm test` : 51 fichiers de tests passent.
- Matrice Playwright RM-013-A : 360/390/430/768/1024/1440/1920 × Restaurant/Réception, 14 combinaisons passent, aucune erreur de page.
- Ouverture/repli au clic réel et ouverture clavier de Clôture ; état ARIA et visibilité du contenu contrôlés.
- Clôture fictive : annulation sans appel, confirmation d’un service passé, archive affichée, refus d’une deuxième clôture, blocage du jour courant avant 23 h 30 et d’un service contenant une réservation non finalisée.
- Durée fictive initiale 1 h : absence de cadre extérieur, bouton compact de hauteur tactile, choix de 2 h et sauvegarde confirmée dans la fixture. Brouillons, salles, tables, fusions et autres rubriques rejoués.
- Suite Mission 3 existante : 110 scénarios de régression.
- Aucun appel ni réservation/clôture de test dans Supabase DEV ou PROD. Le frontend et sa protection sont réels ; le service est simulé en mémoire et le réseau distant bloqué.

| Format | Durée « 1 h » | Clôture / archive |
| --- | --- | --- |
| Mobile 390 | [Capture](preuves/rm013a-retour/after-settings-390.png) | [Capture](preuves/rm013a-retour/after-closure-390.png) |
| Tablette 768 | [Capture](preuves/rm013a-retour/after-settings-768.png) | [Capture](preuves/rm013a-retour/after-closure-768.png) |
| PC 1440 | [Capture](preuves/rm013a-retour/after-settings-1440.png) | [Capture](preuves/rm013a-retour/after-closure-1440.png) |

[Journaux et résultat de la matrice](preuves/rm013a-retour/).

## Recette Render

Après mise à jour du clone, vérifier la version `20261116-rm013a2` des ressources CSS et d’authentification. Dans Gestion, ouvrir/replier Clôture et consulter les archives, puis ouvrir Paramètres pour contrôler la durée. Les essais de clôture effective sont couverts ici par les fixtures ; ne pas clôturer un service réel pour une simple vérification visuelle.

Le correctif reste **À TESTER CLONE** par l’utilisateur. La validation sur appareils réels et la mise à jour effective de la PWA restent à confirmer avant toute promotion V3/MAIN.
