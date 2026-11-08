# Mission 3 — Validation de l’intégration

Référence : `fec9cbe5b89c5323d126284def664d2a6c113fcd`, Mission 3 reprise dans `fix/v3-tables-display-mission3`, après sa validation initiale sur `fix/mission3-validation-integration`. Aucune publication ni migration partagée n’est comprise dans cette livraison. Le rapport et les résultats d’exécution sont livrés séparément, hors dépôt.

**Mise à jour du 8 novembre, après cette livraison :** les migrations partagées ont été autorisées puis appliquées ensemble sous la version `20261108115320`. Le [compte rendu d’exécution](mission23-migration-2026-11-08.md) détaille les contrôles, la compatibilité avec l’administrateur non superutilisateur et les limites de sauvegarde. La fusion et Render restent en attente d’autorisation distincte ; les constats antérieurs ci-dessous décrivent l’état avant application.

## Contrat frontend / SQL

Appliquer dans l’environnement de validation isolé, dans cet ordre :

1. Le schéma applicatif compatible avec le catalogue de référence.
2. `supabase/scripts/mission2_reservation_edits.sql` : colonne UUID `edit_version`, invalidation et RPC V4.
3. `supabase/scripts/mission3_validation_integration.sql` : prérequis, protections et contrats ci-dessous.
4. Le frontend de cette branche avec tous ses assets versionnés ensemble.

Les scripts sont transactionnels. Leur présence dans Git ne les exécute pas. Le frontend refuse les écritures si le contrat complet n’est pas disponible ; aucun repli automatique sur les éditions V3 n’est prévu. La correction d’affichage ajoute une consultation seule sur le schéma d’origine, avec sa table de révision RLS et la même pagination. Aucune heure serveur n’est inventée lorsque cette RPC manque. Les capacités vides maintiennent toutes les écritures bloquées ; une erreur de permission ou de réseau ne provoque pas ce mode de compatibilité.

`service_sync_state_v1()` retourne la révision de l’établissement sous forme de texte, l’heure serveur et les capacités `reservation_edits:4`, `booking_recovery:1`, `snapshot:1`. Les sept collections autorisées sont paginées dans un ordre stable, sans filtre supprimant les historiques ou les réservations futures. Les offsets suivent le nombre réellement reçu, y compris lorsque le plafond REST est inférieur à la page demandée. Une modification de révision invalide la lecture entière ; trois essais immédiats précèdent une reprise différée. Aucune collection partielle n’est publiée.

`booking_draft_status_v1(p_key text)` retourne `pending`, `committed`, `expired` ou `missing`, avec l’identifiant de réservation et l’expiration applicables. La lecture est limitée au compte et à l’établissement courants. Aucun jeton propriétaire de maintien n’est exposé. `booking_draft_v3(..., p_action:'release')` retourne désormais explicitement `released` ou `committed` : cette réponse décide du résultat lorsqu’une confirmation gagne après une précédente lecture `pending`.

Le navigateur conserve uniquement la clé technique et sa phase dans `sessionStorage` avant de confirmer. Il n’y stocke ni client, chambre, notes, allergies ni mot de passe. Une confirmation ambiguë reste bloquée jusqu’à résolution de la clé. Une réservation déjà confirmée exige une action explicite avant de commencer une nouvelle saisie.

Les éditions V4 exigent toujours la version capturée à l’ouverture. Les mises à jour des réservations, affectations et configurations de tables concernées invalident cette version. Les textes historiques inchangés restent conservés ; les nouveaux textes trop longs produisent une validation explicite. Les clients extérieurs numériques restent extérieurs.

## Verrous et compatibilité

Un verrou transactionnel par établissement précède les verrous de réservation, jour, table et maintien dans les RPC mutatrices. Ce choix conservateur sérialise les écritures courtes d’un restaurant. Les identités de chambre sont verrouillées dans le même espace de noms, incluant l’établissement, à la création et à l’édition.

Les écritures directes permettant de contourner les RPC sont retirées, y compris les ACL de colonnes et les privilèges TRUNCATE. Les opérations opérationnelles de salles et d’horaires restent disponibles aux rôles prévus, avec RLS et verrou avant mutation. Les RPC de tables et fusions conservent leurs permissions explicites. Les fusions existantes de deux ou trois tables sont couvertes ; aucun éditeur graphique ni catalogue de mobilier n’est réintroduit.

Les clients hôtel de passage conservent leur champ « chambre ou nom facultatif ». Une nouvelle réservation marquée hôtel exige une chambre ; une ancienne fiche hôtel sans chambre reste éditable si cette absence ne change pas. Les historiques des services clôturés ne sont pas réécrits lors d’un renommage de table.

L’ancienne RPC de création Réception reste disponible pour compatibilité. Elle ne fournit pas l’idempotence du nouveau parcours `booking_draft_v3` : l’inventaire puis le retrait des anciens clients nécessitent une décision distincte. Un verrou de création de numéro de table hérité reste global et peut provoquer une contention entre établissements lors de créations de configuration simultanées ; il ne permet pas de fuite de données.

## Résultats du 8 novembre 2026

- Réussi : suite complète, 25 fichiers ; syntaxe, 87 fichiers ; audit du moteur, 2 800 assertions.
- Réussi : PostgreSQL isolé, 48 scénarios, dont sauvegarde/restauration fictive et rollback transactionnel.
- Réussi : navigateurs avec backend simulé, 13 groupes Mission 2 et 18 Mission 3.
- Réussi : Auth/HTTP/RLS réels, 29 scénarios ; deux navigateurs avec Realtime réel, 6 groupes.
- Non testé : appareils physiques, lecteurs d’écran, gros volumes, CI GitHub Node 22.
- En attente de validation : intégration de la branche, migration partagée et publication Render, autorisations distinctes.

Les journaux et résultats JSON du rapport constituent les preuves d’exécution. Le schéma partagé vérifié en lecture seule ne dispose toujours pas de `edit_version`, des RPC V4 et des contrats de synchronisation/recovery. Render sert encore le commit `4432417`, tandis que l’intégration GitHub reste à `fec9cbe`.

## Tests reproductibles

```sh
npm ci
npm run test:syntax
npm test
node tests/v3-reservation-audit.cjs
npm run test:mission3:postgres
npx playwright install --with-deps chromium
npm run test:mission2:browser
npm run test:mission3:browser
npm run test:mission3:supabase
```

Les tests PostgreSQL créent leur propre conteneur sans réseau, en tmpfs, et n’acceptent pas d’URL de base fournie par l’environnement. Ils sont supprimés en fin d’exécution. La variante Mission 3 applique les deux scripts, contrôle leur réapplication et étend les scénarios Mission 2.

La suite Supabase utilise de vrais composants officiels GoTrue, PostgREST et Realtime, PostgreSQL, des comptes créés par l’API Admin locale et des JWT réels. Elle conserve les objets Auth réels ; le catalogue applicatif est chargé en filtrant les stubs du fixture PostgreSQL unitaire. Le bootstrap configure les prérequis officiels Realtime (`dashboard_user` et schémas), et prépare wal2json 2.7 depuis un paquet PGDG vérifié par SHA-256, sans installation système ; sa bibliothèque est montée en lecture seule et autorisée dans PostgreSQL 17.11. Ce runner cible Linux amd64 et exige curl, sha256sum et dpkg-deb. Les ports publiés sont liés exclusivement à `127.0.0.1`. Le navigateur charge le bridge réel, avec seulement l’URL, la clé locale et la source locale du même SDK remplacées par le serveur de tests. Les requêtes HTTP et WebSocket distantes sont bloquées.

Sur un hôte Docker VFS à petit disque, exécuter les suites SQL et Supabase successivement. Les scripts optionnels `tests/supabase/flatten-realtime.sh` et `tests/supabase/flatten-postgres.sh` importent les systèmes de fichiers officiels Realtime et PostgreSQL en une couche, vérifie ses digests source et sa configuration d’exécution, sans modifier le démon ni supprimer des images. Il exige `crane >=0.22` installé séparément. Le digest de l’image aplatie diffère du digest officiel ; ses fichiers exécutables et cinq champs de configuration sont vérifiés.

```sh
bash tests/supabase/flatten-realtime.sh
bash tests/supabase/flatten-postgres.sh
MISSION3_POSTGRES_IMAGE=restomanager-mission3/postgres:17-bookworm-flattened \
  MISSION3_REALTIME_IMAGE=restomanager-mission3/realtime:v2.151.3-flattened \
  CHROMIUM_PATH=/usr/bin/chromium npm run test:mission3:supabase
```

`CHROMIUM_PATH` sélectionne un navigateur local existant. `BROWSER_ARTIFACTS` et `MISSION3_ARTIFACTS` doivent pointer hors du dépôt pour conserver les preuves. Les tests simulés ne constituent pas une validation de RLS ou de Realtime. Le workflow Mission 3 effectue ces contrôles sur branche dédiée/PR et ne contient aucun déploiement.

## Validation et déploiement coordonné — à autoriser séparément

1. Relever les commits GitHub et Render, l’état des scripts SQL déjà présents, les signatures, propriétaires, RLS, ACL, triggers, contraintes, publication Realtime et versions des assets. Comparer au préflight ; arrêter en cas de dérive.
2. Exporter une sauvegarde logique applicative et une sauvegarde adaptée des rôles/configurations, selon les moyens autorisés du projet. Vérifier les procédures de sauvegarde Supabase et l’accès réel à la restauration. Restaurer dans une base isolée et vérifier données, RLS, RPC et contraintes. Conserver les sauvegardes chiffrées hors des livrables publics.
3. Rejouer les suites et la restauration sur une copie de recette sans données personnelles réelles. Mesurer les durées de migration, contention des verrous et temps de synchronisation sur le volume attendu.
4. Faire approuver la fenêtre et les deux actions distinctes : application SQL partagée et publication Render. Suspendre temporairement les éditions sur les appareils pour éviter les anciens clients et l’application d’un frontend incompatible.
5. Appliquer le script Mission 2 s’il manque, puis Mission 3 sous contrôle. Ne jamais supprimer ou réinitialiser les données existantes. Vérifier le commit de chaque transaction et la notification de rechargement PostgREST.
6. Vérifier les propriétaires non BYPASSRLS, les fonctions publiques accessibles uniquement aux rôles prévus, les ACL de colonnes, l’isolation des établissements, `edit_version`, les contraintes et les trois capacités attendues. Vérifier les abonnements Realtime.
7. Publier le commit frontend approuvé avec tous les assets de cette branche. Vérifier la réponse publique de chaque asset et les références de cache ; attendre la propagation CDN. Le service worker connecté reste dormant : ne pas activer un ancien cache de shell.
8. Recharger explicitement tous les postes, fermer les anciens onglets et contrôler les capacités avant de réautoriser les éditions. Les confirmations incertaines doivent être résolues avant une nouvelle saisie.
9. Faire des essais de recette autorisés avec deux comptes et appareils indépendants : chambre, conflit de version, notes/allergies, création concurrente, annulation, installation/libération, fusion et changements d’horaires. Vérifier aussi l’historique, les rapports et la clôture.
10. Surveiller pendant un service pilote les erreurs par catégorie, les conflits, les reprises de synchronisation et les durées des RPC, sans journaliser les informations des clients. Valider ensuite l’ouverture de la recette aux collaborateurs.

## Retour arrière

Avant le commit SQL, toute erreur doit annuler la transaction entière ; ne pas poursuivre avec un schéma partiel. Après migration, suspendre les écritures et préserver les données collectées. Revenir à un frontend connu compatible V4 ou maintenir la consultation seule. Ne jamais contourner la vérification de version en réactivant une édition V3 obsolète.

Une restauration de sauvegarde peut supprimer les changements faits après sa prise : la réserver à une procédure explicitement approuvée, avec rapprochement des écritures et preuve de restauration. Préférer un correctif transactionnel en avant lorsqu’il protège mieux les écritures récentes. Aucun script automatique de suppression des protections ou de rétablissement des ACL dangereuses n’est livré.

## Décisions et limites

L’intégration de la branche, la migration partagée et Render nécessitent trois validations distinctes. Restent à décider la fenêtre d’intervention, le responsable de sauvegarde/restauration et le traitement des anciens clients. Les essais matériels Android/tablette, lecteurs d’écran, radios mobiles réelles et longues périodes d’arrière-plan doivent compléter les simulations Chromium. Le résultat des tests effectivement exécutés figure dans le PDF ; la présence d’un test ou d’une instruction ici ne signifie pas qu’il a réussi.
