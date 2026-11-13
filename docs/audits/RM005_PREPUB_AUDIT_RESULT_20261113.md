# RM-005 — audit de prépublication DEV (13 novembre 2026)

**Verdict : tests automatiques PASS ; validation terrain et publication V3/MAIN NON AUTORISÉES à ce stade.**

## Version contrôlée et CI

- Base fonctionnelle DEV : `feature/v3-supabase-full-clone`, correctif de tests `5080cfc3b6296365e8292b0c754693f621ec7ebb`.
- Branche de contrôle isolée : `qa/rm005-prepublication-rerun-20261113`, commit `e139e85e81ffc0b9fc3e96da4e5b166187a61891`.
- Les contenus du test navigateur `tests/browser/director-slot-form.cjs` sont identiques sur DEV et QA à ce stade (SHA blob `b7f22d616d627c1f2faed65917bbf9e00161f5e0`). La branche QA ajoute uniquement un document de déclenchement.
- PR de contrôle **non fusionnée** : [#117](https://github.com/DylanL-Dev/RestoManager/pull/117).
- CI : [Node 43437883813](https://github.com/DylanL-Dev/RestoManager/actions/runs/43437883813) **PASS**, [Playwright 43437883806](https://github.com/DylanL-Dev/RestoManager/actions/runs/43437883806) **PASS**, [Mission 3 43437883918](https://github.com/DylanL-Dev/RestoManager/actions/runs/43437883918) **PASS** (**4/4 jobs**).
- Syntaxe : **124 contrôles / 0 échec** ; Node : **152/152 tests / 0 échec**.
- UI mock : Mission 2 **13/13**, Mission 3 **98/98**, affichage **14/14** ; planning responsive et créneaux/nom extérieur à **390, 800 et 1440 px : PASS**.
- PostgreSQL jetable : migrations, isolement des établissements, RLS, concurrence, récupération de données fictives **PASS**.
- Supabase local : Auth, PostgREST, SDK, Realtime, isolement Réception/Restaurant, permissions des tables **PASS**.

## Corrections apportées pendant la recette

La première PR QA [#116](https://github.com/DylanL-Dev/RestoManager/pull/116) révélait 3 tests Node obsolètes (référence à un ancien jeton JS et ancienne icône) et une assertion Playwright obsolète (compte des SVG après apparition de la coche de sélection). Une deuxième exécution a révélé la même fragilité sur un créneau non sélectionné. Tous ces tests ont été repris **sans désactiver le contrôle métier** ; ils vérifient désormais les vraies icônes Lucide et la visibilité de la sélection. La CI finale est totalement verte.

La correction fonctionnelle antérieure `TableStore` (problème d'affichage « À vérifier » systématique) est couverte par le test `tests/booking-slot-lexical-registry.test.cjs`.

## Contrôles de base de données distantes : lecture seule

Projets : DEV `lykoybacslvmhtzftqsf` ; PROD `tnsrkargogckgtsxipwd`.

Différences vérifiées en catalogue, **sans écrire dans aucune des deux bases** :

1. DEV possède `restaurant_hours.saturday_lunch_closed`, `sunday_lunch_closed`, `weekly_schedule` ; PROD ne possède aucun de ces trois champs.
2. DEV possède le RPC `create_fusion_chain_v1` pour la fusion atomique 2–4 tables ; PROD ne possède pas ce RPC.
3. Le nouveau contrôle serveur du nom extérieur a été développé via une migration DEV ; son déploiement en production n'a pas été réalisé.
4. La Salle Prestige créée dans DEV n'est pas une configuration à copier telle quelle dans PROD ; les tables réelles doivent être définies par l'équipe.

Advisors sécurité DEV consultés : 23 avertissements de fonctions `SECURITY DEFINER` accessibles au rôle authentifié, 1 avis d'audit RLS sans policy sur une table, 1 avis de protection de mots de passe compromis non activée. Ces alertes **ne prouvent pas à elles seules une exploitation** ; les RPC intentionnellement exposés doivent conserver leurs garde-fous de rôle et d'établissement. Examiner particulièrement le nouveau RPC de fusion avant toute migration PROD. [Référence Supabase SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Éligibilité à la publication

| Lot | Statut | Conditions restantes |
|---|---|---|
| Créneaux intelligents / affluence / UI et couverts | **CI PASS — À TESTER AUTHENTIFIÉ SUR RENDER** | Essais Restaurant + Réception, disponibilité après réservation, deux appareils, état hors ligne, PWA/cache ; validation explicite |
| Planning hebdomadaire, fermetures de services | **CI PASS — RETENU SUR DEV** | Vérification métier des horaires / jours, autorisations par rôle, recette réelle ; préparer et auditer les migrations SQL et la reprise des anciennes configurations avant PROD |
| Fusions 2–4 tables et Gestion | **CI PASS — RETENU SUR DEV** | Préparer RPC et droits PROD, vérifier proximité réelle des tables et compatibilité des réservations existantes ; recette tactile |
| Salle Prestige | **DEV SEULEMENT** | Valider la configuration physique et les tables qui lui appartiennent, sans copier les données DEV |
| Client extérieur nommé | **CI PASS — RETENU SUR DEV** | Inclure le garde-fou serveur PROD et valider création + édition après migration |

**Aucune publication V3 ou MAIN réalisée.** Aucune donnée fictive écrite dans la base de production. Les tests automatiques utilisent principalement des moteurs/serveurs locaux jetables, et ne certifient pas un parcours hébergé Render authentifié.

### Règles de livraison à appliquer après accord explicite

- Sauvegarder l'état exact de MAIN et de V3, car ces branches ont divergé.
- Construire des PR de release ciblées ; exclure `restomanager-env.js` DEV, la configuration de base DEV, les SQL de test et les données.
- Préserver RM-001 (minuit Paris), les droits Réception/Restaurant, le contrôle serveur des réservations et les caches PWA.
- Déployer le code front seul seulement si aucune API/migration DEV ne lui est nécessaire ; sinon migrer PROD par scripts revus, **après** accord.
- Confirmer chaque lot sur écran réel avant la promotion suivante.
