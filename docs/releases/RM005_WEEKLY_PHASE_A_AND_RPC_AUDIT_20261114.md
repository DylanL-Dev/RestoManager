# RM-005 — Planning hebdomadaire : phase A testée, audit des RPC phase B

**Date : 14 novembre 2026**
**Statut : PRÉPARATION UNIQUEMENT. AUCUN SQL phase A/B exécuté sur Supabase PROD.**

## État actuel (vérifié)

- GitHub MAIN et V3 ont été sauvegardés séparément (branches `backup/main-pre-rm005-release-20261113` et `backup/v3-pre-rm005-release-20261113`).
- La seule migration SQL PROD déjà appliquée est la correction ciblée de RLS de `restaurant_hours` (`rm005_prod_hours_rls_role_guard_20261114`, tracée séparément).
- PROD possède encore neuf colonnes `restaurant_hours` ; aucun champ `weekly_schedule`, `saturday_lunch_closed`, `sunday_lunch_closed`.
- Les horaires actuels ont été consultés sans changement : établissement réel, midi 12 h–14 h 30, soir 19 h–21 h 30, 60 min ; établissement démo inactif, 90 min. **Aucune valeur de DEV ne doit être copiée.**

## Phase A — préparation structurelle (candidat NON appliqué)

Fichier : `supabase/release-prep/rm005_weekly_phase_a_candidate_NOT_APPLIED.sql`.

Cette phase :
1. vérifie les préconditions de structure et de permissions avant toute écriture ;
2. ajoute les trois colonnes nécessaires ;
3. construit pour **chaque établissement** ses sept jours à partir des horaires déjà enregistrés, sans fermer automatiquement le samedi/dimanche ;
4. valide la structure JSON complète ;
5. prépare automatiquement un planning valide lors de la création d'un nouvel établissement ;
6. conserve les durées, les réservations et les salles sans les modifier.

**Preuve READ ONLY sur Supabase PROD :** simulation SQL produisant sept jours complets sur les deux établissements, sans modification des fermetures existantes, des durées ni des créneaux.

**Preuve TEST ISOLÉ :** job GitHub Actions `RM-005 - planning 7 jours SQL isole`, exécution #43562571968, scénario complet **PASS** sur PostgreSQL 17 éphémère, données synthétiques uniquement :
- 7 jours et heures préservés sur l'établissement ouvert ;
- établissement démo fermé ;
- durées conservées ;
- nouvel établissement initialisé sans planning manquant ;
- calendrier JSON invalide refusé.

Scripts de test : `tests/sql/rm005_weekly_phase_a_synthetic_fixture.sql` et `tests/sql/rm005_weekly_phase_a_assertions.sql`.

**Limite :** un test synthétique ne prouve pas l'absence de conflit avec toutes les fonctions, grants, triggers et données du véritable schéma PROD. Il faut un essai sur restauration isolée et un point de sauvegarde avant la migration réelle.

## Phase B — contrôles horaires serveur / RPC (audit READ ONLY)

Source DEV actuelle : `supabase/migrations/20261113153000_rm005_walkin_weekly_server_dev.sql`. Le fichier source remplace huit définitions, mais **il ne doit pas être exécuté globalement sur PROD**.

| Fonction | PROD | Différence principale / garde |
|---|---|---|
| `private.restaurant_service_open_at_v1` | **absente** | Nouveau helper privé ; rôle `resto_service_writer` doit obtenir EXECUTE, jamais le navigateur directement |
| `private.install_walkin_v3` | présente, propriétaire `resto_service_writer` | Remplacer seulement garde d'ouverture, préserver rôles et verrous |
| `public.booking_draft_v3` | présente, `resto_service_writer` | Concurrence, expiration et droits inchangés |
| `public.install_walkin_group_v3` | présente, `resto_service_writer` | Capacité / fusion / contrôles de table préservés |
| `public.install_walkin_group_v4` | présente, propriétaire `postgres` | Ne pas perdre la logique d'occupant supplémentaire |
| `public.reception_booking_v3` | présente, `resto_service_writer` | Ne pas autoriser la Réception à choisir une table |
| `public.reception_update_reservation_v4` | présente, `resto_service_writer` | Préserver contrôle de version et permissions |
| `public.reception_update_reservation_with_table_v1` | **absente de PROD** | Existe seulement DEV, non exécutable directement par `authenticated` : **exclure du transfert automatique** et vérifier si réellement indispensable |

Les signatures des six fonctions préexistantes sont cohérentes entre DEV et PROD ; leurs corps diffèrent, ce qui **ne prouve pas** qu'une copie des corps DEV respecte toutes les règles en production. Avant phase B : comparer le code SQL de chaque fonction et faire exécuter des tests de rôles, multi-tenant, concurrence, week-end et passage de minuit sur copie isolée.

**Point de vigilance nouveau :** DEV initialise un nouvel `restaurant_hours` sans `weekly_schedule` via `private.initialize_restaurant_hours`. La phase A proposée comprend donc un déclencheur d'initialisation des nouveaux établissements ; ne pas oublier de vérifier cette évolution également sur DEV avant migration réelle.

## Pipeline et limites du GO

- **Trois workflows sur trois PASS au commit `988ca1d0`** : audit SQL PostgreSQL 17 synthétique, garde-fou `RestoManager - validation avant publication`, et vérification navigateur avec horloge fixe.
- Une exécution initiale du test navigateur a échoué tôt le matin : son scénario de passage dépendait de l'heure réelle du runner et était hors service. **Le test seul** a été corrigé pour simuler midi avec `page.clock.setFixedTime`, sans changer le comportement de l'application. La nouvelle exécution #43562944900 est **PASS**.
- **Sauvegarde de la base PROD et restauration testée : NON DISPONIBLES.** Les sauvegardes GitHub ne couvrent pas les réservations.
- **Aucune publication de RM-005, aucune migration phase A/B, aucune fusion MAIN/V3.** PR #121 doit rester en brouillon. RM-006 reste un lot distinct.

## Prochaines validations

1. **Terminé :** trois workflows PASS ; le faux échec navigateur lié à l'heure du runner a été corrigé dans les tests.
2. Préparer un candidat Phase B ciblé à partir des signatures/corps **actuels** de PROD (ne pas copier DEV globalement).
3. Répéter les tests sur clone représentatif du schéma PROD et vérifier sécurité RLS / RPC.
4. Disposer d'une sauvegarde **restaurable** des données et d'un plan de rollback.
5. Demander un accord explicite pour toute migration structurante ou publication MAIN/V3.
