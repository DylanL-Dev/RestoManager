# RM-013-A — Gestion responsive, recette du 16 novembre 2026

Les trois lots de l’issue [#151](https://github.com/DylanL-Dev/RestoManager/issues/151) sont réalisés dans une seule branche et une seule PR vers DEV. Le défaut de rendu de « Salle Prestige » est reproduit sur la base DEV puis corrigé structurellement. Aucune régression observée dans les suites ci-dessous.

## Périmètre et traçabilité

- Base DEV : `feature/v3-supabase-full-clone`, commit `473b7f423eb06579ab889b40c2d1ebea25e0c657`.
- Branche fille : `feature/rm013a-management-responsive`.
- Commits distincts : lot 1 `fix(rm013a): separate room names and actions to prevent vertical text` ; lot 2 `feat(rm013a): organize management into accessible persistent accordions` ; lot 3 `test(rm013a): validate responsive workflows and publish visual evidence`.
- Pas de fusion ni de déploiement pendant cette mission. Aucune écriture sur les branches `main` et `RestoManager-V3`. Aucun accès aux bases Supabase PROD/DEV, aucune migration, aucune modification RLS, aucune réservation réelle créée.
- La vraie page `v3-connected.html`, ses styles, ses scripts et sa protection d’événements authentifiés tournent dans Playwright. Seule la frontière du service est simulée, en mémoire. Les requêtes HTTP externes et les WebSocket sont bloqués ; les service workers sont désactivés dans les contextes de test.

## Lot 1 — Noms de salles horizontaux

La cause associait du texte flexible à des boutons incompressibles, avec `overflow-wrap:anywhere` et plusieurs règles concurrentes. Le nom pouvait se réduire à quelques caractères de largeur.

- DOM séparé : `.roomManagerInfo` contient le nom et les compteurs ; `.roomManagerActions` contient Renommer/Supprimer ; le formulaire de renommage occupe sa propre ligne.
- Grille à deux colonnes lorsque l’espace le permet, actions sous le texte dans les conteneurs de moins de 540 px. Le nom n’entre plus en compétition avec les boutons sur mobile.
- Une ligne de nom avec ellipsis si nécessaire, nom complet conservé dans le DOM et dans `title`. Aucune coupure à chaque caractère. Le formulaire Renommer permet aussi de consulter le nom entier.
- Trois styles injectés supprimés du JavaScript ; règles redondantes des salles retirées du HTML. Styles regroupés dans la feuille Gestion existante.
- Contrôles tactiles d’au moins 44 px, couleurs différenciées pour la suppression, champs alignés, thème sombre conservé.

**Validation explicite : « Salle Prestige » est horizontale aux sept largeurs.** Les tests mesurent une largeur utile supérieure à 150 px et une hauteur au plus égale à deux lignes. Tous les noms, dont le nom long de la fixture, sont contrôlés et conservent leur texte complet accessible.

## Lot 2 — Une hiérarchie de sections dépliables

La navigation par catégories existante est réutilisée comme accordéon. Les onglets horizontaux et leur duplication avec les anciens titres ont été remplacés par les en-têtes des panneaux.

Rubriques : Paramètres du service ; Horaires du restaurant ; Salles ; Tables ; Fusions ; Clôture du service / historique ; Rapports & statistiques. Mon établissement, Signaler un problème, Réseau et synchronisation, Didacticiel & aide restent accessibles dans la même hiérarchie.

- État initial replié ; une rubrique ouverte à la fois sur tous les formats.
- Boutons natifs pour les rubriques principales, `aria-expanded`, `aria-controls`, régions nommées et titres de niveau 2. Les modules complémentaires conservent leurs `details/summary` natifs et reçoivent les mêmes relations ARIA.
- Entrée/Espace pour ouvrir/replier, flèches haut/bas et Début/Fin pour parcourir les en-têtes. Les contenus repliés quittent l’ordre de tabulation. Focus replacé sur l’en-tête lorsque son panneau est fermé par un raccourci.
- Les formulaires restent montés. Saisies de salle, table, horaires et sélection de fusion conservées lors du passage d’une rubrique à l’autre.
- Les formulaires ouverts de renommage survivent à un nouveau snapshot. Le formulaire de table conserve aussi ses valeurs lors d’un rafraîchissement des données.
- Confirmation avant de remplacer une saisie de table, de réinitialiser le formulaire ou de changer de salle pendant une édition. Refuser restaure aussi le libellé du sélecteur personnalisé.
- Durée et réglage des arrivées déplacés dans Paramètres. Le select de durée garde son association avec `restaurantShiftForm`. Son enregistrement immédiat existant est conservé.
- Les dépliants hebdomadaires midi/soir sont réutilisés, avec le même sélecteur d’heure, la copie entre jours et la sauvegarde existante.
- Les tables affichent uniquement la salle sélectionnée, avec capacités et actions Modifier/Retirer/Réactiver. Le nom de salle redondant n’est plus répété sur chaque ligne. Deux colonnes de lignes compactes sur les grands écrans, une colonne sur les contenus plus étroits.
- Le raccourci de réglage des arrivées ouvre désormais Paramètres du service. L’ancien raccourci de synchronisation fonctionne encore avec le module natif intégré.

## Lot 3 — Harmonisation et recette

Les captures et assertions couvrent Restaurant (`fb_admin`) et Réception aux largeurs **360, 390, 430, 768, 1024, 1440 et 1920 px** : 14 combinaisons. Hauteurs : 844 px sur mobile, 1024 px à 768, 900 px à 1024/1440, 1080 px à 1920.

Réception conserve un vrai titre de page, une rubrique Paramètres de l’application dédiée à l’apparence et les horaires partagés en lecture seule. Les commandes Salles/Tables/Fusions et la modification des horaires restent indisponibles. Les soumissions forcées sont également refusées par la protection authentifiée existante.

Contrôles réalisés :

- Création/renommage d’une salle avec conservation d’UUID ; annulation puis confirmation de suppression d’une salle vide ; refus de supprimer une salle contenant une table active ou retirée.
- Sélection de salle réelle dans le sélecteur personnalisé ; salle vide ; ajout d’une table dans la bonne salle ; modification de capacité ; annulation de retrait, retrait et réactivation.
- Conservation des brouillons lors d’un repli, d’un changement de rubrique et d’un snapshot ; refus d’abandon d’une saisie lors d’un changement de salle, y compris lorsque seule la capacité a été modifiée.
- Changement d’heure avec le sélecteur réel, fermeture du soir d’un jour, copie vers un autre jour, sauvegarde du planning ; changement de durée à 2 h avec persistance dans la fixture partagée.
- Sélection de trois tables, conservation de la sélection entre rubriques, confirmation et création d’une chaîne de fusions, retrait confirmé d’une association.
- Clôture : présence des commandes et des archives, date courante et refus avant 23 h 30 conservés. Aucune règle RM-012 ajoutée.
- Rapports : présence de l’export PDF et changement de période/date. Modules établissement, signalement, réseau, aide toujours ouvrables.
- Absence de défilement horizontal de page dans chaque rubrique parcourue, zéro erreur JavaScript de page, dernier contrôle défilable au-dessus de la navigation mobile fixe. Inspection visuelle des captures mobile/tablette/PC et du thème sombre.

Versions des ressources modifiées passées à `20261116-rm013a1` dans le HTML connecté. Cache shell `restomanager-shell-20261116-dev-rm013a1`, incluant les feuilles Gestion et le planning hebdomadaire. Les assertions de versions des tests ont été actualisées ; les assertions métier demeurent.

## Tests exécutés

| Commande / suite | Résultat |
| --- | --- |
| `npm ci --cache /tmp/restomanager-npm-cache` | Réussi, dépendances verrouillées installées |
| `npm run test:syntax` | 133 fichiers vérifiés, 0 erreur |
| `npm test` | 51 fichiers de tests passent, 0 échec |
| `npm run test:rm013a:browser` | 14 combinaisons rôle/largeur, parcours décrits ci-dessus, 0 erreur de page |
| `npm run test:rm013a:browser -- --baseline` | Captures DEV avant correction à 390/768/1440 |
| `npm run test:mission2:browser` | 13 scénarios passent |
| `npm run test:mission3:browser` | 110 scénarios passent, dont réservations, conflits, brouillons, navigation, fusions, rôles |
| `npm run test:display` | 14 scénarios passent |
| `node tests/browser/rm005-room-management.cjs` | Création, renommage, isolation et suppression avec la protection authentifiée, 390/800/1440 : OK |
| `node tests/browser/weekly-ui.cjs` | Planning, copie, activation des services et rotation tablette/mobile, 1440/800/390 : OK |
| `node tests/browser/director-slot-form.cjs` | Créneaux et client extérieur, 390/800/1440 : OK |
| `git diff --check` | OK |

Le workflow `.github/workflows/rm013a-management.yml` reproduit installation, syntaxe, tests unitaires, captures avant/après, recette RM-013-A et contrôles salles/horaires. Il cible uniquement les PR vers DEV et publie l’artefact `rm013a-management-responsive`, même en cas d’échec.

Résultats et journaux : [preuves/rm013a](preuves/rm013a/). Résultat machine de la matrice : [results.json](preuves/rm013a/results.json).

## Captures comparatives

Toutes utilisent les mêmes données fictives ; les images après de Salles/Tables précèdent les mutations du scénario. Les images Horaires/Sombre montrent l’état après les actions fictives de recette. Les captures sont en page entière : la navigation fixe apparaît à la position du viewport dans ces images longues ; les assertions vérifient séparément que le dernier contrôle peut défiler au-dessus de cette barre.

| Format | Avant DEV | Salles après | Tables après | Horaires après | Réception après | Sombre après |
| --- | --- | --- | --- | --- | --- | --- |
| Mobile 390 × 844 | [Avant](preuves/rm013a/before-rooms-390.png) | [Salles](preuves/rm013a/after-rooms-390.png) | [Tables](preuves/rm013a/after-tables-390.png) | [Horaires](preuves/rm013a/after-hours-390.png) | [Réception](preuves/rm013a/after-reception-390.png) | [Sombre](preuves/rm013a/after-dark-390.png) |
| Tablette 768 × 1024 | [Avant](preuves/rm013a/before-rooms-768.png) | [Salles](preuves/rm013a/after-rooms-768.png) | [Tables](preuves/rm013a/after-tables-768.png) | [Horaires](preuves/rm013a/after-hours-768.png) | [Réception](preuves/rm013a/after-reception-768.png) | [Sombre](preuves/rm013a/after-dark-768.png) |
| PC 1440 × 900 | [Avant](preuves/rm013a/before-rooms-1440.png) | [Salles](preuves/rm013a/after-rooms-1440.png) | [Tables](preuves/rm013a/after-tables-1440.png) | [Horaires](preuves/rm013a/after-hours-1440.png) | [Réception](preuves/rm013a/after-reception-1440.png) | [Sombre](preuves/rm013a/after-dark-1440.png) |

## Fichiers modifiés

- `service-v3-table-admin.js` : structure des salles, conservation du renommage, lignes de tables, protection des saisies.
- `service-v3-management-categories.css` : accordéons, salles, tables compactes et styles adaptatifs/sombres, remplacement des anciennes règles de catégories.
- `service-v3-screens.js` : hiérarchie Gestion, ARIA/clavier, montage des modules complémentaires et déplacement des réglages.
- `service-v3-room-choices.js` : remise à jour du libellé après refus d’abandon.
- `service-v3.js` : raccourci des arrivées vers Paramètres du service.
- `v3-connected-auth.js` : titre et libellés de Gestion Réception ; protections métier inchangées.
- `v3-connected.html` : suppression des styles concurrents des salles, versions des ressources ; styles sombres de l’historique conservés.
- `sw.js` : version et ressources du cache PWA.
- `package.json`, `.github/workflows/rm013a-management.yml`, `tests/browser/rm013a-management.cjs` : commande de recette, workflow et harnais isolé complet.
- `tests/browser/rm005-room-management.cjs` : charge la vraie feuille Gestion et vérifie le texte désormais séparé des compteurs.
- `tests/browser/mission3.cjs` : contrôle le panneau replié, les en-têtes restant visibles dans l’accordéon.
- `tests/rm005-management-categories.test.cjs` : structure de l’accordéon, relations ARIA et protection de la largeur des noms.
- `tests/rm005-room-renaming.test.cjs`, `tests/rm010-shared-threshold-sync.test.cjs`, `tests/rm011a-booking-draft-navigation.test.cjs`, `tests/room-isolation-and-slot-visual.test.cjs`, `tests/reception-weekly-readonly.test.cjs`, `tests/tutorial-source.test.cjs` : versions des fichiers réellement chargés.
- Ce rapport et `docs/audits/preuves/rm013a/` : captures, journaux et résultats.

## Limites et vérification terrain sur le clone Render

Cette recette valide le frontend sur Chromium avec services fictifs. Elle ne remplace pas une validation réelle Auth/RLS/Realtime, Safari/iOS, un lecteur d’écran matériel, l’installation/mise à jour effective de la PWA ou l’export PDF binaire via son CDN. Aucune clôture effective de service n’a été envoyée. Aucun test DB n’est requis par les changements purement UI.

La description de #151 est la référence disponible pour RM-013 ; aucun fichier autonome de la maquette n’est joint à cette issue ni présent dans le dépôt. Une comparaison pixel à pixel avec un original externe n’est donc pas affirmée.

La PR ne déploie pas le clone. Après intégration/déploiement DEV selon votre processus, ouvrir [le clone Render](https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html#administration) et vérifier que les ressources portent `20261116-rm013a1` avant de comparer les rendus.

1. Avec Restaurant, ouvrir Salles sur téléphone, tablette et PC : « Salle Prestige » horizontal, compteurs et deux actions lisibles ; consulter le nom complet d’un libellé long.
2. Ouvrir/replier les rubriques au toucher puis au clavier ; saisir sans enregistrer, changer de rubrique et revenir : valeurs conservées.
3. Sélectionner une salle, vérifier que ses seules tables apparaissent ; contrôler une salle vide. Éviter toute création/suppression ou sauvegarde de test dans les données du restaurant ; les scénarios de mutation se rejouent avec le harnais isolé.
4. Vérifier la consultation des jours midi/soir, de la durée, des fusions, des archives et des rapports, sans enregistrer de modification de test.
5. Avec Réception, vérifier les horaires en lecture seule, l’apparence et l’aide, et l’absence des commandes Restaurant.
6. Vérifier le mode sombre, le dernier contrôle au-dessus du menu fixe et l’absence de défilement horizontal. La recette terrain reste préalable à toute promotion V3/MAIN.
