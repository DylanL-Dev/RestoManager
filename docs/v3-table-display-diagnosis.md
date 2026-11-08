# Écran Tables vide — diagnostic et correctif

Contrôles réalisés le 8 novembre 2026. Base GitHub : `fec9cbe`. Branche de correction : `fix/v3-tables-display-mission3`, destinée à une PR vers `feature/v3-supabase-full-clone`.

## Cause démontrée

Render publie toujours `4432417606135ba18d027299b13170a7fa8bb134`, alors que Full Clone est à `fec9cbe5b89c5323d126284def664d2a6c113fcd`. Le fichier `service-v3.js` téléchargé publiquement a le même SHA-256 que celui du commit Render : `0708eecd3db640c0a2af9034a8144a8755dbf8a479fcfdd9e55628ee7c2b456b`.

Dans cette version, `refreshAvailability()` appelle `mins()` pour comparer les horaires. `mins` appartient à une autre fonction immédiatement exécutée et n’existe pas dans la portée de ce module. L’appel initial provoque `ReferenceError: mins is not defined` avant l’installation des listeners de synchronisation et avant `render()`.

La sélection de salle et les filtres ont déjà été créés, mais les cartes, l’occupation et les arrivées ne sont pas remplies. La reproduction sous Chromium à 390×844, 768×1024 et 1440×900 confirme des conteneurs visibles avec zéro enfant/texte : il ne s’agit pas de texte blanc masqué par le CSS. Des snapshots fictifs complets arrivent ensuite sans restaurer les listeners qui n’ont jamais été installés.

Le correctif du calcul horaire (`bookingMinutes`) existe déjà dans `fec9cbe`. Le décalage de publication explique qu’il ne soit pas exécuté sur Render. L’intégration Mission 3 conserve ce correctif, FUN-01, FUN-02, CONC-01, l’affluence et les retards.

## Données et accès vérifiés sans écriture

Les seules lectures du projet partagé utilisées pour ce diagnostic portent sur des agrégats et le catalogue : une salle active, 23 tables dont 22 actives et rattachées à une salle active, 76 réservations, 98 affectations, zéro affectation orpheline, zéro libellé de table non numérique. Les deux comptes actifs Restaurant/Réception sont rattachés à un établissement ayant une salle active.

Les politiques SELECT autorisent les deux rôles, avec restriction au restaurant du profil. La table de révision est lisible avec la même isolation. Ces constats ne démontrent aucun défaut RLS expliquant cet écran. Les accès réels sont également testés sur des comptes fictifs et deux restaurants dans la pile Supabase locale.

La session authentifiée personnelle sur le smartphone de l’utilisateur n’a pas été inspectée ; aucun identifiant distant ni donnée nominative de réservation n’a été utilisé. Le code réellement publié a été reproduit localement avec son HTML et ses assets, en remplaçant seulement le bridge par des données fictives. Tous les appels HTTP/WebSocket distants sont bloqués dans ces reproductions.

## Corrections de cette PR

- Intégration des sources, scripts SQL préparés et tests Mission 3 dans un commit distinct.
- Le rendu des tables s’exécute indépendamment du calcul des disponibilités : une erreur de ce calcul produit un message local et bloque la validation concernée, sans interrompre le plan de salle ni les arrivées.
- États visibles de chargement, lecture refusée/erreur avec bouton Réessayer, absence confirmée de tables/arrivées, consultation seule et données anciennes après déconnexion.
- Aucune table de démonstration ou de cache local n’est présentée comme donnée serveur avant le premier snapshot autorisé complet.
- Si la RPC Mission 3 manque, lecture seule par la table de révision existante et les sept collections déjà autorisées. La pagination et la vérification avant/après de révision restent actives. Une erreur de permission/réseau ne provoque pas ce mode de compatibilité.
- Les capacités d’écriture restent absentes dans ce mode : aucune édition V3 non versionnée ne remplace les RPC V4. Un changement de capacités pendant une lecture impose une nouvelle lecture complète.
- Versions des assets et imports de bridge harmonisées avec `20261108-tables-display`.

## Tests

```sh
npm run test:syntax
npm test
node tests/v3-reservation-audit.cjs
CHROMIUM_PATH=/usr/bin/chromium npm run test:display -- --baseline
CHROMIUM_PATH=/usr/bin/chromium npm run test:mission2:browser
CHROMIUM_PATH=/usr/bin/chromium npm run test:mission3:browser
MISSION3_POSTGRES_IMAGE=restomanager-mission3/postgres:17-bookworm-flattened npm run test:mission3:postgres
MISSION3_POSTGRES_IMAGE=restomanager-mission3/postgres:17-bookworm-flattened \
  MISSION3_REALTIME_IMAGE=restomanager-mission3/realtime:v2.151.3-flattened \
  CHROMIUM_PATH=/usr/bin/chromium npm run test:mission3:supabase
```

`--baseline` reproduit volontairement le défaut du commit publié, puis vérifie la version corrigée. Il exige cet objet Git dans le clone local ; la CI standard exécute la version courante sans cet argument. Les scénarios couvrent les deux rôles, les trois tailles, les filtres, 22 tables fictives, les arrivées, les états vides, le chargement, l’erreur/Réessayer, la déconnexion et une panne injectée du calcul de disponibilité.

La pile réelle est testée d’abord sur le schéma d’origine sans les migrations 2/3 : les tables restent visibles en consultation et les écritures sont bloquées. Les deux scripts sont ensuite appliqués uniquement dans cette base jetable ; les éditions concurrentes, réservations, RLS et Realtime sont vérifiés après migration. Aucun changement SQL supplémentaire de production n’est nécessaire pour ce correctif d’affichage.

Résultats locaux : syntaxe 88 fichiers, suite complète 25 fichiers sans échec, audit du moteur 2 800 assertions, SQL isolé 48 scénarios, HTTP/Auth/RLS 29 scénarios, navigateur réel avant migration 2 groupes puis Realtime après migration 6 groupes, interfaces simulées Mission 2/3 31 groupes, affichage 17 groupes dont les 3 reproductions du code publié.

Les tests de navigateur ne remplacent pas une validation sur smartphone/tablette physiques ni une validation du compte personnel de l’utilisateur. La CI GitHub dépend du résultat des runs de la PR, à consulter séparément des preuves locales.

## Conditions de publication

1. Valider la PR et le plan SQL documenté dans `docs/mission3-validation-integration.md`.
2. Obtenir une autorisation distincte pour le projet Supabase partagé ; sauvegarder et vérifier la restauration, contrôler le catalogue, puis appliquer Mission 2 avant Mission 3. Les tests locaux contrôlent la compatibilité et la réapplication des scripts, mais ne remplacent pas ce préflight sur l’état exact du jour.
3. Vérifier V4, `edit_version`, les trois capacités, RLS/ACL et le rechargement du cache PostgREST avant d’autoriser les écritures du frontend.
4. Autoriser séparément la publication Render. **L’auto-déploiement est activé sur la branche Full Clone : une fusion peut publier le frontend.** Ne pas fusionner tant que SQL et publication ne sont pas validés.
5. Recharger les postes pour obtenir les assets cohérents, vérifier les tables et les arrivées, puis effectuer les contrôles fonctionnels autorisés à deux comptes.

Les previews de Pull Request Render sont désactivées ; pousser cette branche dédiée et ouvrir sa PR ne modifie pas la branche surveillée par Render. Aucun déploiement, fusion ou changement de données partagées n’est effectué par cette mission. La version officielle du restaurant et `main` restent préservées.
