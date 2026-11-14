# RM-005 — état de la mise à niveau MAIN au 14 novembre 2026

## Déjà fusionné dans MAIN
- PR **#122**, commit **`6afe99f8e294261426b2a6ca412246d240384e78`**.
- Neuf nouvelles ressources JS/CSS RM-005 copiées de DEV, encore **non chargées** par `v3-connected.html` en production.
- Le test navigateur utilise une horloge de midi stable pour éviter les échecs à l'heure réelle du runner.
- Comparaison avec `backup/main-pre-rm005-release-20261113` : MAIN a exactement ce lot de dix fichiers modifiés/ajoutés, aucun autre changement.
- Les sauvegardes GitHub de MAIN et V3 avant RM-005 demeurent disponibles.

## Branche d'activation — PR #123 (DRAFT, non fusionnée)
- Vingt-deux fichiers au total : 18 fichiers de code/HTML et 4 tests adaptés à l'interface RM-005 approuvée.
- Préserve les fichiers d'environnement/de connexion de MAIN : `supabase-service-bridge.js`, `supabase-login.js`, pas de `restomanager-env.js` de DEV.
- Préserve le bandeau pour deuxième occupant de chambre et les restrictions visuelles des tables côté Réception issus de MAIN.
- Les deux workflows sur le commit `464f2c77a06651026469dd36841f16a0c9161507` sont **PASS** : tests de publication et tests navigateur.
- La branche **ne doit pas être fusionnée** avant les migrations serveur et le parcours de recette sur schéma réel.

## Backend RM-005 — PR #121 (DRAFT)
- Phase A : planning hebdomadaire sans fermeture forcée du week-end, préservant horaires actuels et durée.
- Phase B : six fonctions RPC existantes patchées par appel au helper hebdomadaire, avec empreintes SQL et contrôle propriétaire/permissions.
- Répétition SQL sur deux PostgreSQL 17 éphémères contenant des définitions RPC de PROD sans données réelles : **PASS**.
- **Aucune** phase A/B exécutée sur Supabase PROD. La correction de sécurité RLS des horaires exécutée auparavant demeure la seule intervention SQL ciblée.
- PROD : **149 réservations**, **0 colonne hebdomadaire supplémentaire** au dernier contrôle en lecture seule.

## Conditions avant activation fonctionnelle
1. Sauvegarde de la base PROD réellement restaurable, vérification de la procédure de restauration et protection des données client.
2. Tests de migration et de rollback sur un schéma PROD représentatif, y compris le rôle Réception, salles, chambres, verrous, affluence, passage et fuseau Europe/Paris.
3. Relecture des éventuelles migrations complémentaires RM-005, notamment fusions et nom des clients extérieurs.
4. Tests de cohérence backend/frontend, ainsi que l'absence de version de DEV et d'identifiants de test dans le build destiné à PROD.
5. Fenêtre de déploiement et surveillance des services, validation finale de l'exploitant.

**Décision : MAIN partiellement mise à niveau sans altérer l'application opérationnelle ; activation RM-005 complète EN ATTENTE de la conformité SQL et de la sauvegarde. RM-006 reste séparée.**
