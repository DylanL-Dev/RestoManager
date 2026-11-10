# RM-AUDIT-01 — vérifications finales et proposition de clôture

**Conclusion technique proposée : AUDIT VALIDÉ — PRÊT À CLÔTURER.** Statut proposé : `RM-AUDIT-01 — VALIDÉE / PRÊTE À CLÔTURER`. La clôture formelle reste à confirmer par le responsable ; aucune fusion de la PR #75 ni publication n'est réalisée.

## Niveaux de preuve conservés

1. **Historique automatisé** : étapes 2 et 3 et leurs exécutions CI déjà consignées dans le registre. Elles ne sont pas réécrites.
2. **Recette manuelle déclarée DEV** : [commentaire du 10/11/2026](https://github.com/DylanL-Dev/RestoManager/pull/75#issuecomment-6763913217). L'utilisateur déclare les deux connexions, même établissement/jour, création fictive, apparition sans actualisation, édition des couverts, conservation/synchronisation notes et allergies, restrictions de l'interface Réception, maintien/libération à l'abandon, annulation synchronisée et nettoyage. Ce sont des confirmations déclaratives, sans trace Playwright/réseau de ces opérations. Les anciennes confirmations sur la version officielle sont distinctes.
3. **Nouveaux tests exécutés** : SDK 2.119.0, tests Node/Playwright et composants Auth/PostgREST/Realtime réels dans des conteneurs locaux jetables. Pour tester le serveur réellement configuré en DEV, ses fonctions, RLS, ACL et triggers ont été exportés **en lecture seule**, puis rejoués uniquement localement sur deux restaurants et comptes fictifs. Aucun client réel ni ligne de réservation hébergée n'est utilisé.
4. **Limite hébergée** : aucun accès de recette fourni au robot ; aucun nouveau test Playwright authentifié du Render hébergé n'est annoncé. La preuve hébergée reste la recette manuelle déclarée. Les essais négatifs serveur et la concurrence précise S04 sont apportés par le replay isolé autorisé par la mission.

Les contrôles bloquants demandés pouvaient être exécutés sur une base isolée : ils passent. L'absence d'un nouveau rejeu robot sur l'hébergement reste une limite de couverture à accepter lors de la clôture, pas une preuve supplémentaire inventée. Aucun problème critique n'a été mis en évidence dans le périmètre exécuté.

## Tableau final

| Contrôle | Résultat | Preuve exécutée et portée |
| --- | --- | --- |
| Sécurité RLS | **PASS — isolé** | Replay DEV : 17 tables sous RLS, 47 politiques, 24 triggers. Requêtes HTTP sous JWT de vrais comptes Auth locaux ; PATCH/INSERT/DELETE de réservation et PATCH d'affectation directs refusés, sans changement des lignes. Rôle serveur sans SUPERUSER/BYPASSRLS et non hérité par authenticated. |
| Permissions Réception | **PASS — isolé** | Refus API de création/configuration/désactivation de tables, fusion et passages simples/groupés ; installation et libération refusées. Contrôles positifs Restaurant sur une réservation fictive valide ; notes inchangées. |
| Réattribution manuelle / contournement API | **PASS — isolé** | V4 Restaurant refusée à Réception ; ancienne V3 obsolète refusée ; helper interne `reception_update_reservation_with_table_v1` non exécutable ; schéma privé non exposé ; réservation et affectation identiques après les refus. Aucun contournement observé sur les entrées testées. |
| Isolation des établissements | **PASS — isolé** | Deux restaurants peuplés, rôles Restaurant/Réception, lectures REST et RPC de mutation/attribution étrangères refusées. Un navigateur d'un second établissement ne reçoit que son snapshot. |
| Concurrence | **PASS — isolé** | Éditions concurrentes SQL et HTTP ; ancienne `edit_version` refusée ; collision réelle de table et maintien concurrent avec un seul gagnant ; édition/annulation atomiques. |
| Notes et allergies | **PASS — isolé ; confirmé manuellement DEV** | Édition de chambre et textes historiques conservés, allergie de A protégée lors d'une édition périmée de B ; saisie non enregistrée de B conservée. Rechargement de la fiche soumis à confirmation explicite. |
| Verrouillage de tables | **PASS — isolé ; confirmé manuellement DEV** | Maintien propriétaire, abandon et expiration forcée testés par RPC ; compte tiers ne peut libérer le maintien d'un autre ; pas de confirmation d'un maintien expiré. |
| Synchronisation Realtime | **PASS — local réel ; confirmé manuellement DEV** | Deux contextes avec vrais comptes Auth distincts ; notifications WebSocket/Postgres Changes ; modification visible sans rechargement ; édition obsolète après reconnexion refusée et saisie conservée. |
| Compatibilité SDK | **PASS — alignement et contrats testés** | Frontend inchangé à 2.119.0 ; dépendance/lockfile et UMD de test alignés à 2.119.0. Version identique imposée par assertion. Auth/HTTP/Realtime complets réussis. Réserve P2 de divergence 2.57.0/2.119.0 levée sur cette branche de tests. |
| Régression RM-001 à RM-004 | **PASS — automatique local** | 111 tests Node initiaux verts, 13 groupes Mission 2, 77 Mission 3, 14 affichage, 2 scénarios UI à minuit Paris (deux rôles). Hôtel par défaut, interface Réception et permissions protégés par les tests existants ; vues 390/768/1440. |

Ce tableau ne transforme pas les confirmations manuelles en tests automatisés. Les tests d'une base isolée ne sont pas des écritures de production, ni un certificat de tout futur schéma DEV différent.

## Exécutions finales chiffrées

| Exécution | Résultat |
| --- | --- |
| Syntaxe JS | 106 fichiers, zéro erreur |
| `npm test` après alignement | 111 tests / 111 ; répétition finale 33 fichiers / 33, zéro échec |
| `npm run test:mission2:browser` | 13 groupes / 13 |
| `npm run test:mission3:browser` | 77 groupes / 77 |
| `npm run test:display` | 14 groupes / 14 |
| `npm run test:mission3:postgres` | 62 scénarios / 62 |
| `npm run test:audit:dev:postgres` — snapshot final | 62 scénarios / 62, PostgreSQL sans réseau |
| `npm run test:mission3:supabase` — SDK aligné corrigé | 2 pré-migration + 29 API + 6 groupes navigateur Auth/Realtime ; zéro échec |
| `npm run test:audit:dev:supabase` — snapshot final | 2 pré-migration + 34 API + 6 groupes navigateur Auth/Realtime ; zéro échec |
| Horloge Playwright contrôlée 23:59:50 → 00:01 Paris | 2 rôles / 2 ; passage du 8 au 9 novembre 2032 simulé |

Les scénarios communs rejoués plusieurs fois ne doivent pas être additionnés en autant de fonctionnalités distinctes. [Preuves JSON finales](preuves/rm-audit-01-final-20261110.json) : noms de scénarios, résultats, commandes et empreinte du snapshot. Les anciens JSON restent inchangés. Les logs et captures complets sont livrés hors dépôt.

## Comparaison SDK et adaptations du harnais

| Point | Avant | Après |
| --- | --- | --- |
| Frontend CDN | 2.119.0 | **Inchangé : 2.119.0** |
| Dépendance de test et lockfile | 2.57.0 | 2.119.0, version exacte |
| Composants Auth/PostgREST/Realtime/Storage/Functions de test | Versions de la distribution 2.57.0 | Distribution 2.119.0, versions homogènes verrouillées |
| Entrée Node du package | `dist/main/index.js` | `dist/index.cjs` |
| Bundle utilisé dans Chromium | Ancien chemin déduit par remplacement | `dist/umd/supabase.js` résolu depuis le package installé |
| Export UMD dans initScript Playwright | Dépendait de `globalThis.supabase` | Namespace de test explicite du **vrai** bundle ; aucun client Auth simulé |
| Protection contre une nouvelle dérive | Aucune assertion de version frontend | Assertion que login, bridge et dépendance du harnais ont la même version |

Le SDK 2.119.0 exige Node >=22 ; les jobs de validation restent sous Node 22. Les échecs initiaux sont conservés dans les preuves : mauvais chemin du bundle, puis absence du global UMD dans le wrapper Playwright provoquaient un timeout avant toute authentification UI. Le chargeur du snapshot a aussi rencontré un conflit de nom PL/pgSQL, corrigé dans la fixture de test. La CI du premier commit `6486786` a aussi révélé une assertion exécutée après le snapshot mais avant le handshake Realtime : le message temporaire de connexion interrompue ne correspondait pas encore à la consultation seule attendue. Le harnais attend désormais `RestoSharedDataLoaded` **et** `RestoSyncState === readonly`, avec le délai maximal existant et sans forcer l’état de l’application ; les assertions de texte, de tables et de blocage des écritures restent identiques. Les diagnostics de la pile standard sont également conservés en artefacts CI. Ces échecs intermédiaires ne sont pas comptés comme des succès ; les replays finaux sont verts. Aucune restriction RLS, assertion métier ou limite réseau n'a été retirée pour les résoudre.

La parité levée porte sur la version et les contrats exécutés ; elle ne constitue pas une comparaison exhaustive de tous les comportements des deux versions. Les résultats 2.57.0 des étapes précédentes restent historiques, pas des runs différentiels nouveaux de cette session.

## Réserves résiduelles non bloquantes pour la proposition

- **Recette hébergée déclarative** : les confirmations DEV sont explicites mais non accompagnées d'une nouvelle trace robot authentifiée. Conserver cette qualification ; un rejeu instrumenté restera utile quand les accès seront disponibles.
- **Périmètre de matériel** : Chromium et viewports émulés ; pas de nouveaux essais sur terminaux physiques, PWA installée ou une nuit entière de service. Ne pas assimiler les captures simulées à ces essais.
- **Snapshot daté** : les tables/contraintes sont reconstruites par les fixtures locales ; le replay porte sur les fonctions, propriétaires, droits, RLS et triggers capturés. Il n'est pas une sauvegarde complète DEV. Une modification ultérieure du schéma ou des permissions nécessite une nouvelle comparaison.

Ces limites ne masquent pas un test critique échoué. Si le responsable exige un rejeu robot authentifié du clone hébergé comme condition supplémentaire, conserver l'audit ouvert jusqu'à sa réalisation. La proposition de clôture repose sur la recette manuelle DEV déclarée et les essais techniques isolés permis par la mission.

## Périmètre des modifications et suite

Modifications sur la branche de la PR #75 : dépendances **de test**, résolution UMD, assertions/essais HTTP, fixture de métadonnées DEV, workflow de validation et documentation. Aucun module métier/frontend n'est modifié, aucune migration partagée ni publication Render, aucun compte utilisateur réel modifié et aucune réservation hébergée créée/supprimée pendant ces vérifications finales.

La PR #75 est mise à jour, sans fusion automatique. `RestoManager-V3`, `main` et Supabase production restent inchangés par cette mission. Les preuves précédentes et le commentaire de recette manuelle sont conservés.

La préparation proposée de RM-005 figure dans [le dossier de cadrage, sans développement](RM-005_PREPARATION_SANS_DEVELOPPEMENT.md). L'issue #3 est le candidat identifié ; son attribution à RM-005 doit être confirmée. Aucun développement de RM-005 n'a commencé et il ne doit pas démarrer avant la clôture formelle de RM-AUDIT-01.
