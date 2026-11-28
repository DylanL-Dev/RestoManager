# RM-RELEASE-03 B2 — Activation serveur du Coup de feu sur DEV

## Décision proposée

**NO-GO pour exécuter le SQL sur DEV à ce stade.** Le frontend est publié et la structure hébergée correspond aux dépendances vérifiées du lot. Utiliser le candidat B2 qui aligne le verrou historique et fournit un retour arrière SQL. Le GO exige une sauvegarde DEV exploitable avec restauration vérifiée, une fenêtre de recette, les comptes de test dédiés et l’autorisation écrite du propriétaire pour le lot et l’empreinte approuvés.

## Version observée

- DEV GitHub `c9caaeab6c4cf7127c8c137632dc27115547924f`, issue de la PR #290 et intégrant #289. Render DEV indique `live` pour le même SHA depuis 03:50:18 UTC le 28 novembre 2026. [Déploiement Render](https://dashboard.render.com/web/srv-dbm8o15g1s2s73cemju0/deploys/dep-dc54uq17lnhs73alijkg)
- GET 200 pour la connexion, l’entrée connectée, la feuille et le script Coup de feu, le module Express, le gateway, le worker et le manifeste de version. Les sept ressources comparées aux octets du commit DEV sont identiques. La CSP de l’entrée est déclarée en `<meta>` et réserve les connexions Supabase au projet DEV en HTTPS et WSS. Le journal Render interrogé ne signalait aucune erreur sur la fenêtre observée. La série de métriques HTTP était vide.
- L’entrée publiée redirige une session anonyme vers la connexion dans Chromium à 390 px. Le contrôle de navigation bloque les requêtes hors de l’origine Render et ignore l’erreur de confiance du proxy local dans Chromium. Les GET de comparaison ont été effectués avec la validation TLS de curl. Les vérifications authentifiées ont utilisé des comptes dédiés sur la pile locale jetable. Aucune connexion à un établissement hébergé ni écriture de recette sur DEV.

## Comparaison avec Supabase DEV

La consultation du catalogue a ciblé `RestoManager-DEV` et PostgreSQL `17.11`. Le rôle `postgres` de l’opérateur est membre de `resto_service_writer` et peut lui transférer des fonctions. Le rôle d’écriture est sans connexion, sans attribut superutilisateur ni `BYPASSRLS`, et sans `CREATE` dans `public` ou `private`. Le candidat restaure les droits d’origine après les transferts d’ownership.

| Contrôle | Observation et critère de validation |
| --- | --- |
| RPC et capacités | Le candidat n’est pas appliqué. Les RPC v4, Express et de libération renforcée, ainsi que leurs journaux, sont absents. La RPC de synchronisation retourne les capacités historiques sans `express_service` ni `quick_release`. La définition de référence de `service_sync_state_v1()` a pour empreinte MD5 `b5daa1b050d12a8100610b91fc0f5e5e` sur `pg_get_functiondef`. |
| Calendrier et versions | `install_walkin_group_v3` utilise le calendrier hebdomadaire et le verrou d’établissement. Le rôle d’écriture peut appeler le calendrier. Les triggers actifs actualisent `edit_version` et la révision de service. |
| RLS et surface API | Réservations, attributions, blocages, salles, tables et révisions ont RLS. Les politiques historiques du rôle interne sont permissives sur plusieurs tables de service. Les RPC Express et de libération doivent donc borner explicitement leurs accès à l’établissement et contrôler le rôle Restaurant par profil actif. Le candidat utilise des fonctions privées à `search_path` vide et des points d’entrée publics invoker. PostgREST DEV refuse le schéma privé avec `406 PGRST106`. Les journaux ajoutés ont RLS forcée et des politiques d’ajout bornées à l’établissement et à l’auteur. Le journal privé de libération est inaccessible au client. |
| Realtime | `supabase_realtime` publie `restaurant_service_changes`. La politique `own_changes` limite la lecture authentifiée à l’établissement. L’abonnement doit être suivi d’une actualisation du snapshot et conserver l’isolation après reconnexion. |
| État des audits | Supabase signale des fonctions publiques historiques `SECURITY DEFINER` accessibles après authentification, ainsi que la protection des mots de passe divulgués désactivée. Relever les avis après l’activation et vérifier que le lot ne crée aucun nouveau point d’entrée public de ce type accessible au client. [Avis sur les fonctions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) · [Protection des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |

### Ordre des verrous corrigé

La RPC historique `apply_smart_placement_v3` reste utilisée dans le mode complet. Elle prenait le verrou de placement, les lignes puis les tables avant que le trigger d’écriture ne prenne le verrou d’établissement. Express prend le verrou d’établissement dès l’entrée. Cet ordre inverse peut bloquer deux confirmations concurrentes. Le candidat B2 ajoute le verrou d’établissement avant les autres dans la v3. Le rôle, le propriétaire, les ACL et les règles historiques restent identiques. Le générateur contrôle l’empreinte du corps avant et après la modification et interrompt la transaction si la version hébergée a dérivé. L’empreinte historique du corps vérifiée sur DEV est `4d7538c16784ba283ab62ead4c8a4054`.

Le candidat retire aussi les droits par défaut de `service_role` sur le nouveau journal de placement. Les tests vérifient les refus de Réception, d’un autre établissement, d’un appel anonyme et d’une révision périmée. L’annulation s’appuie sur le reçu serveur de huit secondes, la version de la réservation, l’auteur, les attributions exactes, l’occupation et les nouveaux blocages.

## Sauvegarde et préparation opérateur

1. Identifier le projet par son nom **RestoManager-DEV** et vérifier que la référence correspond au routage de Render DEV. Consigner le SHA Git live, la fenêtre UTC, la référence de la sauvegarde et l’approbation dans le suivi privé du propriétaire.
2. Dans le tableau de bord Supabase DEV, vérifier le point de récupération disponible. Retenir un point PITR horodaté ou une sauvegarde complète récupérable à l’ouverture de la fenêtre. À défaut de sauvegarde gérée adaptée, réaliser un export logique chiffré avec une connexion PostgreSQL directe DEV et un outil de version compatible. Vérifier la couverture du schéma, des rôles et des données nécessaires. Conserver les exports et les secrets dans le stockage privé prévu par le propriétaire. Les sauvegardes de base couvrent les références Storage, tandis que les objets Storage ont leur propre procédure de sauvegarde. [Sauvegardes Supabase](https://supabase.com/docs/guides/platform/backups)
3. Tester la restauration effective dans un environnement jetable isolé, avec envois et automatisations désactivés. Vérifier que le backup est lisible, que les schémas, triggers et permissions sont restaurés et que les définitions des deux RPC qui seront modifiées correspondent au catalogue DEV. Le script `supabase/release-prep/rm-release-03b2_dev_readonly.sql` collecte les définitions, ACL, RLS et publications sans lire de dossiers clients. Rejouer ce script avant et après dans la fenêtre.
4. Calculer les empreintes des deux fichiers préparés ci-dessous. Le générateur n’ouvre aucune connexion. À l’ouverture de la fenêtre, remonter tout changement de SHA, d’ownership, de politiques, de publication Realtime, de fonction ou de droits. Les RPC historiques doivent garder leurs droits actuels.

```sh
umask 077
node scripts/prepare-rm-release-03b.cjs > DEV-coup-de-feu-activer.sql
node scripts/prepare-rm-release-03b.cjs --rollback > DEV-coup-de-feu-consultation.sql
sha256sum DEV-coup-de-feu-activer.sql DEV-coup-de-feu-consultation.sql
```

Un relevé du catalogue DEV et les deux fichiers générés ont été conservés hors du dépôt, avec accès local restreint. Les SHA-256 de préparation sont `c893524e9437e121a3c47ed22c131e2b15929cd132490d666cabd39cdbc366b3` pour l’activation et `1633482ee7223ca3d17f913b8b1fd5bca03143468b096bbaf3362d7be65df287` pour la consultation. Le connecteur disponible ne donne pas la liste des points PITR ou des sauvegardes de ce projet. Aucune sauvegarde de données hébergées ni restauration d’un export DEV n’a été réalisée ici.

## Activation atomique après autorisation

1. Suspendre les essais et coordonner une fenêtre sans opérations concurrentes. Refaire le contrôle du catalogue de DEV et vérifier la sauvegarde. Utiliser une seule session SQL DEV avec arrêt à la première erreur, hors du trafic applicatif. Le candidat comporte `BEGIN` et `COMMIT`, un délai de verrouillage de trois secondes et un délai par instruction de soixante secondes.
2. L’ordre est verrou v3, moteur v4, libération et annulation, puis installation et passage Express. Les droits, les journaux, les fonctions et les deux capacités deviennent visibles au même commit. La notification PostgREST recharge le schéma après le commit. Une erreur avant commit annule le lot. Vérifier le résultat du commit côté serveur avant de relancer si la connexion de l’opérateur s’interrompt.
3. Vérifier que les capacités `express_service=1` et `quick_release=1` sont toutes deux présentes avec une session de test Restaurant. Contrôler les droits du moteur interne, le rejet des appels anonymes, le refus Réception, le rôle d’écriture, les révisions et la disponibilité de PostgREST. Comparer les avis Supabase au relevé initial.
4. Exécuter la matrice de recette ci-dessous dans l’établissement de test. Les deux capacités sont globales à DEV pour les profils habilités. Prévenir les autres utilisateurs de DEV pendant cette fenêtre.

## Retour en consultation

Arrêter la recette et laisser terminer ou identifier les requêtes déjà en cours. Le script de retour révoque les points d’entrée publics et privés, restaure les définitions historiques de synchronisation et de placement v3, et notifie PostgREST dans une transaction. Il préserve les dossiers, les attributions, les journaux et les objets du lot. Les appels déjà admis avant le retrait restent à réconcilier dans le journal. Recharger les deux sessions, vérifier l’absence des capacités, puis vérifier que les anciennes actions du mode complet restent disponibles. Une incohérence métier demande une correction ciblée après revue, avec conservation du journal. La restauration intégrale reste un scénario de reprise séparé, avec son propre accord et un calcul préalable de l’impact sur les écritures postérieures à la sauvegarde.

## Recette de deux appareils et contrôle d’accès

Préparer des comptes Restaurant A et B avec deux utilisateurs dans l’établissement DEV réservé à la recette. Préparer C dans un autre établissement réservé, ainsi qu’un profil Réception dans le premier établissement. Utiliser uniquement des réservations et tables dédiées, avec le service ouvert et des jeux de données distincts pour les actions qui se concurrencent.

| Scénario | Acceptation |
| --- | --- |
| Avant activation | A et B ouvrent Coup de feu en consultation. Vérifier le canal DEV, la révision initiale, les actions indisponibles et la distinction des données de simulation. |
| Installer et permuter | A confirme une installation puis une permutation avec un dossier attendu. B voit la nouvelle table et le bon statut après signal Realtime. Sur un second jeu, A et B confirment la même proposition. Une seule écriture est validée. Refaire avec le mode complet dans B. |
| Passages | A installe un passage extérieur, puis hôtel. B voit une création par action confirmée. Vérifier un doublon chambre, un conflit d’occupation, un service fermé, la reconnexion et le refus de réessayer à l’aveugle après une réponse perdue. |
| Libérer et annuler | A libère une table « Départ à vérifier ». B constate la libération. A restaure dans les huit secondes et B voit la même attribution. B ne peut pas utiliser le reçu de A. Refaire après expiration, changement de version, réoccupation et sur une réservation déjà installée sur tables fusionnées. |
| Rôles et isolation | Réception consulte dans le périmètre attendu. Elle ne peut pas appeler les trois écritures Express. C n’observe ni événement ni dossier de A ou B. Une requête désignant une réservation ou une table du premier établissement est refusée. |
| Écrans et retour en consultation | Rejouer sur téléphone et sur un second appareil, puis contrôler tablette et ordinateur. Après retour, aucun bouton d’écriture Express ne reste utilisable, même depuis un second onglet après rafraîchissement. |

Arrêter dès qu’une écriture est appliquée deux fois, qu’un événement traverse les établissements, qu’une annulation écrase une autre attribution, qu’un rôle inattendu écrit, ou que la révision ne converge pas après reconnexion. Consigner l’heure et le code de résultat sans identité client.

## Résultats de la recette locale

- 500 tests unitaires avec Node.js 22, 294 fichiers contrôlés pour la syntaxe et 39 contrôles RM-012 sur PostgreSQL jetable. Le test de concurrence Express contre mode complet valide une seule écriture et un refus explicite de la seconde confirmation. Le retour arrière préserve les statuts, affectations et journaux, rétablit les deux définitions historiques et retire les capacités et droits Express.
- 15 contrôles Express dans Chromium, avec les formats 390, 768, 834 et 1440 px, et recette séparée sur une pile jetable avec Auth, PostgREST et Realtime. Deux comptes du même établissement voient la même installation, permutation, création du passage, libération et annulation. Un troisième compte vérifie l’isolation. Ces contrôles utilisent des tailles d’écran émulées.

## Permutations complexes et tables fusionnées

- Le moteur v4 sait valider jusqu’à huit dossiers à table unique dans un plan atomique. L’interface et le point d’entrée Express bornent volontairement la proposition à la cible et un dossier attendu. Une extension doit construire un plan borné, afficher l’ensemble des mouvements, puis revalider le graphe complet du placement sous la même révision et le même verrou. Conserver les refus pour une table occupée, les maintiens actifs, les salles et les capacités. Pour une rotation à trois dossiers, ajouter des tests de cycle, de créneau concurrent, de révision périmée et d’annulation totale en cas d’échec.
- Le passage standard sait prendre jusqu’à quatre tables et le service complet dispose des liens de fusion. L’Express transmet actuellement une seule table. Pour une réservation ou un passage fusionné, réutiliser la validation de connectivité et de capacité du service complet. Vérifier la configuration de la salle et tous les identifiants du groupe, verrouiller les tables dans l’ordre UUID, et confirmer les attributions et l’audit ensemble. Garder la libération et l’annulation multi-table déjà testées. Ajouter les cas 2/4 tables, salle différente, lien supprimé, occupation d’une seule table du groupe, changement de capacité et deux confirmations concurrentes.
- Ces deux chantiers restent séparés de l’activation. Ils peuvent être testés contre le même service de référence sans élargir les écritures validées en B2.
