# Mission 3 — validation et vérifications physiques

La validation automatisée utilise Node et Chromium. Les profils tactiles sont des
émulations : ils ne prouvent ni le comportement d'un Android/iPhone réel, ni les
performances d'une tablette ou d'un ordinateur physique. Le stockage local reste
celui de l'application ; aucune intégration Supabase n'est utilisée.

## Exécuter les vérifications

Depuis le dépôt, lancer un serveur HTTP local puis les suites :

```sh
node --test tests/*.test.js tests/*.test.cjs
node tests/browser/editor.cjs
node tests/browser/three.cjs
node tests/browser/stabilization.cjs
```

Les scripts navigateur utilisent Playwright installé dans le projet, ou le chemin
temporaire disponible dans l'environnement de mission. Les variables
`PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `BROWSER_BASE_URL` et `BROWSER_ARTIFACTS`
permettent de choisir les outils, le serveur et le répertoire de résultats.
`BROWSER_CASE` filtre les scénarios par leur nom. Le serveur doit être démarré
avant les scripts ; l'URL par défaut est `http://127.0.0.1:8000`.

Les contextes navigateur de test sont isolés et initialisés avec leurs propres
données. Les tests n'utilisent pas le profil personnel de l'opérateur. Rapports
JSON et captures sont placés par défaut dans `/tmp/restomanager-artifacts`.

## Résultats et portée

Les lots B et C ont été validés avant le lot D : 14 scénarios navigateur 2D et
7 scénarios navigateur 3D. Le lot D ajoute les tests d'inspecteur, catalogue,
réservations, translation tactile, responsive et diagnostics de performance ;
la validation finale locale passe les 12 scénarios supplémentaires, soit 33 au total. Les sept suites Node passent également. Les rapports détaillés sont dans `docs/test-results`.

| Nº | Exigence critique | Vérification automatisée | Vérification physique restant à consigner |
|---|---|---|---|
| 1 | Rotations répétées à 90° | Géométrie Node et navigateur 2D : pivot, dimensions et position conservés | Tourner huit fois une table sur PC et tablette ; absence de saut visuel |
| 2 | Rotation libre d'un rectangle | Poignée à angle libre, pivot et propriétés sans arrondi | Tester la précision de la poignée au doigt et à la souris |
| 3 | Déplacement d'un objet tourné | Glisser après rotation, centres et limites vérifiés | Vérifier la prise en main souris et doigt sur Android/iOS |
| 4 | Redimensionnement après rotation | Poignées locales et redimensionnement de groupe | Vérifier les quatre poignées, portrait/paysage et doigts proches du bord |
| 5 | Sélection et déplacement multiples | Rectangle PC, sélection tactile et transformations groupées | Vérifier Maj/Ctrl/Cmd, tablette et smartphone réels |
| 6 | Zoom tactile à deux doigts | Pincement CDP, translation à écart constant, annulation du premier déplacement | Faire pincer/glisser deux doigts sur Android/iOS ; aucun objet déplacé par erreur |
| 7 | Ajout au centre visible | Table et élément après zoom/défilement ; catalogue de 15 types | Vérifier la visibilité immédiate et la taille par défaut sur petit écran |
| 8 | Agrandissement/réduction de salle | Dimensions, refus de réduction destructive, ajustement au contenu avec marge | Vérifier grands plans, marge souhaitée et revêtements sur tablette |
| 9 | Sauvegarde puis rechargement | Plans v4, migration sauvegardée, création de réservation et rechargement | Fermer/réouvrir le navigateur sur un profil local de test |
| 10 | Passage 2D → 3D → 2D | Modèle inchangé, scène fidèle, caméra, étiquettes projetées et ressources stables | Vérifier lisibilité et orientation visuelle sur GPU de téléphone réel |
| 11 | Conservation des réservations | Données actives/historique, numéros avec lettres/salles, protection des tables liées | Rejouer une réservation réelle fictive de bout en bout sur un profil de test |
| 12 | Android, tablette et PC | Chromium émulé 1440×1000, 820×1180, 390×844 et 320×740 | Android milieu de gamme, iOS/Safari et PC Chrome/Firefox/Safari selon parc |
| 13 | Objets proches des limites | Empreintes orientées, clamp, refus de propriétés invalides sans mutation | Tourner et dimensionner près des quatre bords avec souris et doigt |
| 14 | Collisions et magnétisme | SAT orienté, obstacles solides, alignements/guides et interrupteur | Vérifier visibilité des guides et messages sur petit écran |
| 15 | Annulation sans enregistrer | Brouillon indépendant, annuler/rétablir ≥30 opérations, Annuler du plan | Naviguer/fermer avec un brouillon, vérifier l'avertissement et le plan conservé |

Les tests Node couvrent également l'annulation d'un geste quand un second doigt
arrive, la conservation des identifiants, les migrations v1/v2/v3, les erreurs de
stockage et la préservation des données illisibles. Les tests navigateur 3D
simulent l'indisponibilité et la perte du contexte WebGL ; la 2D reste utilisable.

## Procédure manuelle reproductible

1. Dans un profil de test, conserver un export des trois clés locales du plan,
   des réservations et de l'historique. Noter le navigateur, sa version, l'appareil,
   le système et l'orientation. Ne pas réinitialiser les données d'exploitation.
2. Charger deux salles avec des numéros uniques et une réservation future liée
   à une table comportant une lettre. Ajouter un événement historique lié.
3. Exécuter les quinze lignes de la matrice. Pour chaque manipulation, comparer
   le centre physique, les dimensions et les liens de réservation avant/après.
4. Enregistrer puis recharger ; refaire des modifications puis choisir Annuler.
   Vérifier que les numéros, les réservations et l'historique restent identiques.
5. En service normal, vérifier l'absence des poignées et commandes d'édition.
   En édition, vérifier les boutons accessibles, le panneau de propriétés, le
   panneau inférieur mobile, les formulaires défilables et le curseur personnalisé.
6. Passer en 3D, tourner/déplacer/zoomer la caméra, réinitialiser, changer de salle,
   puis revenir en 2D. Vérifier les couleurs, volumes et numéros des tables.

## Performances — distinguer diagnostic et mesure physique

La suite de stabilisation reconstruit six fois le plan 2D de 100 objets et rapporte
la médiane et le maximum du temps CPU. Elle relève aussi les intervalles
`requestAnimationFrame` pendant un glisser. Il n'y a pas de seuil de durée CI : ces
mesures dépendent de la machine et ne certifient aucun objectif matériel de FPS.

La suite 3D vérifie avec 100 objets moins de 250 appels de dessin, la stabilité des
géométries/textures/programmes après plusieurs synchronisations, l'arrêt du rendu
au repos et le nettoyage/rétablissement de la vue. SwiftShader est un rendu
logiciel de test ; il ne remplace pas une mesure sur GPU mobile.

Pour les objectifs **60 FPS PC** et **30 FPS smartphone milieu de gamme**, créer un
plan de 100 objets et mesurer au moins 30 secondes par cas : déplacement 2D,
rotation/redimensionnement groupés, caméra 3D orbitale et zoom. Utiliser le panneau
Performance du navigateur ou un outil système adapté, sans capture vidéo lourde.
Noter les images lentes, la mémoire au départ/après dix bascules et la réactivité
du formulaire de réservation. Répéter après cinq minutes d'usage pour observer
une éventuelle chauffe. Ces mesures physiques restent à effectuer.

| Appareil / système / navigateur | Portrait / paysage | 2D 100 objets | 3D 100 objets | Réservations / rechargement | Résultat et date |
|---|---|---|---|---|---|
| PC réel — à renseigner | À vérifier | Cible 60 FPS à mesurer | Cible 60 FPS à mesurer | À vérifier | En attente |
| Android milieu de gamme — à renseigner | À vérifier | Cible 30 FPS à mesurer | Cible 30 FPS à mesurer | À vérifier | En attente |
| Tablette réelle — à renseigner | À vérifier | À mesurer | À mesurer | À vérifier | En attente |
| iPhone / iPad Safari — à renseigner | À vérifier | À mesurer | À mesurer | À vérifier | En attente |

Une ligne physique n'est validée qu'après exécution sur l'appareil indiqué.
Consigner les anomalies avec version du code, étapes, résultat attendu/observé et
capture si utile. Ne pas transformer une réussite en émulation en certification
de matériel réel.
