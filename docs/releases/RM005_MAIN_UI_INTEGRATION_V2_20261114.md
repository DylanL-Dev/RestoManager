# RM-005 — Activation complète frontend : branche réconciliée avec MAIN

Date : 14 novembre 2026 — **NON PUBLIÉE / NE PAS FUSIONNER AVANT BACKEND**

## Ce qui est déjà dans MAIN

- Sauvegarde préalable : `backup/main-pre-rm005-release-20261113`.
- PR #122 : 9 ressources RM-005 disponibles mais initialement non activées.
- PR #124 : aperçu d'affluence des arrivées dans Réservation et Passage, **lecture seule**, avec garde de synchronisation/offline et test dédié. Commit MAIN de la PR : `de0c7b9cd1c131b8277557bb6cb91e0455dd448e`.
- Ces changements sont indépendants du schéma SQL hebdomadaire, déjà testés sur MAIN avec deux workflows verts.

## Candidat d'activation intégrale RM-005

La branche `release/rm005-main-ui-integration-v2-20261114` repart du MAIN déjà doté de #124 et reprend les 18 fichiers fonctionnels et les 4 tests de la PR #123.

**Compatibilité préservée :**
- Les références `service-v3-arrival-preview.js/css` conservent la version main `20261114-main-advisory1`.
- Le script MAIN `service-v3-arrival-preview.js` avec gestion de synchronisation et heure Paris n'est pas remplacé par l'ancienne version DEV.
- Les styles `rm005SecondOccupantNotice` et `receptionTableCaptionFix` restent présents.
- Les scripts de connexion de MAIN `supabase-service-bridge.js`, `supabase-login.js` et les identifiants Supabase PROD ne sont pas remplacés par des scripts du clone.
- Les tests de l'aperçu d'affluence restent présents et contrôlent les cas offline et inconnus.
- Nouvelle interface planning hebdomadaire, choix de créneaux, fusion, alertes, répartition et statut Réception/Restaurant.

## Limites strictes à la publication

**NE PAS FUSIONNER** tant que Supabase PROD ne possède pas les fonctions et colonnes attendues (`weekly_schedule` et autres migrations RM-005), ni les garde-fous :
1. une sauvegarde/restauration effective de Supabase PROD (GitHub ne copie pas les réservations) ;
2. une répétition des migrations sur copie représentative du schéma réel PROD ;
3. les migrations RM-005 complémentaires nécessaires aux fusions et au nom extérieur ;
4. des tests de rôles Réception/Restaurant, pas de modification de table en Réception, pas d'affichage de notes techniques, et suivi d'arrivées exact ;
5. confirmation de compatibilité frontend/backend et accord de l'exploitant.

La base PROD conserve actuellement son ancien planning. La seule migration corrective déjà appliquée est le durcissement RLS de `restaurant_hours` du 14 novembre.

La PR #123 originale a été construite avant la PR #124 et est devenue conflictuelle. Cette branche réconciliée la remplace pour la suite de l'intégration ; **RM-006 reste hors périmètre**.
