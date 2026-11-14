# RestoManager RM-005 — préparation phase B : horaires serveur et RPC

Date : **14 novembre 2026** — **préparation NON appliquée à Supabase PROD**

## Livrables de cette étape

- Candidat SQL `supabase/release-prep/rm005_weekly_phase_b_rpc_candidate_NOT_APPLIED.sql` : adapté aux **six définitions RPC réellement en place en PROD**.
- Les contrôles d'horaires hérités sont remplacés individuellement par le helper privé `private.restaurant_service_open_at_v1(uuid,timestamptz)`.
- Le helper est conservé en `SECURITY INVOKER`, sans EXECUTE pour `PUBLIC`, `anon`, `authenticated`. Le rôle technique interne `resto_service_writer` reçoit seul le droit EXECUTE explicite.
- Un ancien accès `private.install_walkin_v3` aux horaires par `id=1` sans restaurant_id est limité à `private.staff_restaurant()` dans ce candidat.
- Le patch de chaque RPC impose un **hash MD5 de la définition actuelle PROD**, un contrôle du propriétaire de fonction, de `SECURITY DEFINER`, des droits d'exécution `authenticated` et une **occurrence exacte** du code à remplacer. Tout écart arrête la transaction.
- Une fonction présente uniquement sur DEV, `public.reception_update_reservation_with_table_v1`, est **exclue** pour ne pas introduire de droit de choix de table en Réception.

## Fonctions et contrôles de dérive à date

| Fonction PROD | Empreinte baseline `pg_get_functiondef` | Propriétaire | Changement ciblé |
|---|---|---|---|
| `private.install_walkin_v3` | `478f71977a87c62e1b6776c769160978` | `resto_service_writer` | Plage d'ouverture + scope restaurant |
| `public.booking_draft_v3` | `27fd30e7a1751dcce495b957ba518375` | `resto_service_writer` | Plage de réservation |
| `public.install_walkin_group_v3` | `acee84610fb8420b9dba6f1942a62d44` | `resto_service_writer` | Passage multiple |
| `public.install_walkin_group_v4` | `ad2462b3184e637fa1ed27ad59a1b6d3` | `postgres` | Passage multiple + deuxième occupant |
| `public.reception_booking_v3` | `2c2a26f4502a64c9e0abff57cb2799ac` | `resto_service_writer` | Création automatique Réception |
| `public.reception_update_reservation_v4` | `6bf11a586b46b4eb68c9a656eefda59a` | `resto_service_writer` | Modification et version Réception |

Toutes les signatures et empreintes correspondent encore à PROD lors de la relecture **en lecture seule** du 14/11/2026. Les futurs changements PROD devront obligatoirement imposer une nouvelle revue.

## Résultats des tests

- **Phase A** : SQL des sept jours, init nouvel établissement, absence de fermeture forcée et préservation des durées sur PostgreSQL 17 fictif.
- **Helper Phase B** : PostgreSQL 17 fictif, contrôles des frontières horaires, vendredi/samedi/dimanche, changement d'heure Europe/Paris, exemple de fermeture ciblée le samedi midi, refus d'exécution directe par `anon/authenticated`, accès du `resto_service_writer`. Tests PASS.
- **Six RPC entières** : signatures, corps et propriétés introspectés depuis PROD, validations statiques du patch ; **elles n'ont pas encore été remplacées et exécutées dans une reproduction intégrale du schéma de production**.
- **Tests frontend navigateur** : exécutés sur une interface fictive sans données externes ; résultat PASS sur le dernier commit vérifié.
- **GitHub Actions** : workflow `RM-005 - planning et RPC SQL isoles`, pipeline syntaxe/unitaire et navigateur ; vérification globale de la PR requise après toute modification des fichiers de préparation.

## Test complémentaire : six définitions RPC PROD sur PostgreSQL fictif

Une seconde base PostgreSQL 17 éphémère a été ajoutée au workflow `RM-005 - planning et RPC SQL isoles`, avec :
- le planning Phase A et deux établissements fictifs ;
- les **corps SQL exacts** des six fonctions de production (exportées en lecture seule), **aucune donnée client** ;
- un essai complet du candidat Phase B et des assertions de maintien des propriétaires, droits et contrôles de rôle ;
- validation désactivée des dépendances métier absentes de cette base fictive (`check_function_bodies = off`) : même en cas de PASS, il faudra une restauration de vrai schéma pour tester le comportement métier complet.

Les premiers essais ont détecté **deux erreurs de fixture**, corrigées sur la branche de préparation : rôles PostgreSQL recréés dans la deuxième base (rôles globaux au cluster) et absence de points-virgules après les définitions `pg_get_functiondef`. **Résultat confirmé : workflow GitHub Actions #43564800230, étape SQL isolée PASS sur les deux bases PostgreSQL 17 fictives, y compris substitution complète des six définitions de fonctions PROD et maintien des privilèges.** Ne pas confondre un PASS des tests du helper seul avec un PASS de toutes les RPC.

## Décision opérationnelle samedi

L'utilisateur a indiqué que le restaurant n'a **pas de service samedi midi avant l'ouverture du soir**. Cette information ne constitue pas une demande de fermeture récurrente de tous les samedis. **La phase A préserve donc les horaires PROD historiques, même si ceux-ci déclarent aujourd'hui un midi ouvert**. Toute fermeture hebdomadaire doit être validée séparément, sans affecter les autres jours.

## Restrictions de publication

- **Pas de backup Supabase PROD restauré/vérifié**. Les branches `backup/main-...` et `backup/v3-...` ne protègent que le code Git.
- **Phase A et Phase B = candidats dans `supabase/release-prep`**, hors `supabase/migrations`, non appliqués.
- L'ancienne correction RLS sur `restaurant_hours` est la seule migration PROD déjà réalisée, et ne doit pas être rejouée.
- **Aucun merge MAIN, V3, ni changement de données de réservation**.
- Avant GO : épreuve sur copie intégrale du schéma PROD, backup/restauration, recette salle et réception, puis validation expresse du propriétaire.

**État : prêt pour la revue et les essais complémentaires, mais NON PUBLIABLE.**
