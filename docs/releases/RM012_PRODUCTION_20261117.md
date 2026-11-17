# RM-012.1 — Livraison préparée pour V3 et MAIN, 17/11/2026

Le propriétaire autorise la promotion après validation : « Oui si tout est ok tu met à jour V3 et main ». Les changements proviennent exclusivement de RM-012 et RM-012.1 validés sur DEV (PR #174/#176, source `0e7f7b7`), sans fusion globale de DEV. L'autorisation est consignée dans le registre officiel par la PR #177.

## Fonctionnement livré

Gestion → Services à régulariser : sélection exacte de la date, liste des tables et réservations oubliées, actions Restaurant confirmées, journal, clôture datée et archives. Les droits, états périmés, doubles clôtures et la journée en cours sont vérifiés côté serveur. Les Réceptions ne peuvent pas régulariser ni clôturer.

Une alerte RM-014 par journée, actualisée et résolue selon les données métier. Le suivi démarre le **17/11/2026** : aucune ancienne alerte et aucune clôture automatique rétroactive. L'historique ancien reste accessible volontairement. Après la fin réelle du service, un travail privé toutes les cinq minutes clôture uniquement les journées entièrement finalisées, sans blocage ; aucune table n'est libérée et aucun client déclaré absent automatiquement.

## Paquet et conservation de la production

Branches de départ : V3 `b8f7a397fd35541e13d222421e43b0025ba13ead`, MAIN `a74e7ed9cab740b215e27946d75da35181f4b0e2`. Sauvegardes distantes `backup/rm012-v3-before-20261117` et `backup/rm012-main-before-20261117`. Branches de livraison `release/rm012-v3` et `release/rm012-main`.

Canal `main`, annonce unique `2026.11.17-rm012.1`, historique réel conservé, précache 74 ressources. URL/clé publiques et options de connexion PROD inchangées ; écrans de connexion, dépendances et lockfile conservés. [Manifeste et empreintes](RM012_RELEASE_MANIFEST_20261117.json).

## Validation du candidat exact

- Syntaxe : 143 fichiers, aucune erreur. Tests Node : 201 réussis sur chacune des deux cibles.
- PostgreSQL 17 isolé, réseau désactivé : 29 groupes de règles métier/RLS/concurrence réussis sur les migrations finales.
- pg_cron réel : 15 groupes réussis, activation datée, clôture système, autorisations, absence de doublon, concurrence et passage effectif du planificateur.
- Playwright : 23 groupes réussis ; Restaurant/Réception aux largeurs 360, 390, 430, 768, 1024, 1440 et 1920 ; reconnexion, réseau, réponse perdue, brouillon RM-011, concurrence, historique et absence d'anciennes alertes.
- Base de test créée avec une copie **du catalogue uniquement** des fonctions, permissions, RLS et déclencheurs présents en PROD le 17/11. Les données sont exclusivement fictives dans des conteneurs éphémères. Aucune écriture de test dans DEV ou PROD.
- Les workflows GitHub de chaque cible doivent réussir avant toute fusion. Leurs résultats et les artefacts complets sont visibles dans les PR de livraison ; la publication publique doit ensuite être vérifiée séparément.

## Captures du candidat de production

| Vue | Mobile 390 | Tablette 768 | PC 1440 |
| --- | --- | --- | --- |
| Régularisation | [Capture](preuves/rm012/review-390.png) | [Capture](preuves/rm012/review-768.png) | [Capture](preuves/rm012/review-1440.png) |
| Clôture automatique tracée | [Capture](preuves/rm012/automatic-closed-390.png) | [Capture](preuves/rm012/automatic-closed-768.png) | [Capture](preuves/rm012/automatic-closed-1440.png) |
| Notification | [Capture](preuves/rm012/notification-390.png) | [Capture](preuves/rm012/notification-768.png) | [Capture](preuves/rm012/notification-1440.png) |

## Activation Supabase PROD : accord explicite encore requis

Le code frontend seul ne peut pas activer la fonctionnalité : les RPC RM-012 et pg_cron sont absents en PROD. Les prérequis existants ont été vérifiés en lecture seule. **Aucune migration PROD n'a été appliquée à ce stade.** La consigne propriétaire « Ne jamais modifier Supabase PROD » nécessite un accord explicite distinct de la promotion des branches.

Deux migrations exactes déjà testées sur base éphémère puis DEV :

1. [`20261117083046_rm012_intelligent_closeout.sql`](../../supabase/migrations/20261117083046_rm012_intelligent_closeout.sql) : fonctions de détection, régularisation et clôture atomique, journal RLS, unicité restaurant/date, verrous et synchronisation ; protections serveur des statuts et dates.
2. [`20261117151709_rm012_activation_and_automatic_close.sql`](../../supabase/migrations/20261117151709_rm012_activation_and_automatic_close.sql) : politique par établissement avec début au 17/11/2026, clôture automatique active, pg_cron toutes les cinq minutes, journal système et garde des droits. Auteur nullable uniquement pour les actions système, auteur obligatoire pour les actions manuelles.

L'application crée des objets de schéma et une politique par établissement, installe pg_cron si nécessaire et active un travail serveur. Elle ne change ni horaires ni statuts de réservations ; les anciens services restent hors rattrapage automatique. Après activation, des journées réelles éligibles à partir du 17 peuvent être archivées par le travail, conformément au choix du propriétaire. Aucun faux service ne sera créé pour vérifier la publication.

## Vérification utilisateur après publication

Ouvrir Gestion → Services à régulariser. Vérifier le début de suivi au 17/11, l'absence d'alertes antérieures, puis la consultation volontaire d'une date ancienne. Contrôler la navigation et les notifications sur les appareils habituels. Les actions de régularisation doivent concerner uniquement des cas réels vérifiés. Les tests automatisés ne remplacent pas cette recette sur appareils physiques.

Le clone Render est déjà en `2026.11.17-rm012.1` : https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html?preview=rm012.1 . Sa base reste distincte de PROD.
