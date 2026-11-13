# RM-005 — prépublication, recette indépendante du 13/11/2026

**Environnement :** DEV clone uniquement. Aucun déploiement MAIN / RestoManager-V3 ni aucune migration de la base réelle.

## Objectif

Exécuter les contrôles de non-régression prépublication sur le code DEV actuel (`e534cb61`) :

- Syntaxe JavaScript et tests unitaires ;
- Playwright Mission 2 / Mission 3, réservations, Réception et Restaurant, mobile/tablette/PC ;
- créneaux horaires, vraies places libres, traitement des erreurs et alerte d'affluence ;
- passage / seconde personne de la même chambre / fusions ;
- horaire hebdomadaire, jours fermés, minuit Europe/Paris ;
- PostgreSQL temporaire, isolation des établissements, sécurité RLS et SDK Supabase sur infrastructure jetable.

## Sécurité et publication

Cette PR est une **PR de vérification** (document uniquement), destinée à déclencher les workflows `dev-unit-audit`, `dev-playwright-audit` et `mission3-validation`. Ne pas la fusionner dans DEV. Elle ne contient aucun code métier ni migration.

**Règle :** la réussite de CI ne vaut pas validation visuelle sur le vrai navigateur authentifié. Les modules nécessitant une recette humaine resteront à valider explicitement avant V3/MAIN.

## Contrôles métier à confirmer manuellement avant promotion

- Réception : ne choisit, n'installe et ne libère pas les tables.
- Restaurant : prise et modification de réservation, passages, fusions et libération.
- Affluence : seuil de couverts attendus par heure distinct de capacité physique des tables.
- Créneaux : valeurs réelles à partir des tables du snapshot, sélection et 8+ ; tests hors ligne/Realtime.
- Planning par établissement : fermeture samedi/dimanche midi, horaire de dernière réservation, protection serveur.
- Uniquement des données fictives dans DEV ; aucun essai d'écriture en production.

## Verdict initial

En attente des GitHub Actions et de vérifications techniques supplémentaires ; **NON APPROUVÉ POUR PUBLICATION**.
