# RestoManager — RM-005 : audit de préparation PROD (13 novembre 2026)

**Statut : NON AUTORISÉ À PUBLIER (NO-GO de déploiement), préparation technique engagée.**
Cette note est une **analyse en lecture seule** des bases et une proposition d'ordre de migration, **pas** une autorisation d'exécuter un script en production.

## État vérifié

| Élément | Résultat |
|---|---|
| Recette utilisateur RM-005 sur Render DEV | **8/8 validée** |
| Tests CI de la correction passages/horaires (PR #119) | **3 workflows PASS**, dont **158 tests Node réussis** |
| Production actuelle | MAIN, Supabase PROD ; V3 est un historique divergent et non une sauvegarde fidèle |
| GitHub : DEV comparé à MAIN | **555 commits devant et 50 derrière** à la date de cette analyse ; 117 fichiers dans le comparatif |
| GitHub : V3 comparé à MAIN | **5 commits devant et 36 derrière** |
| Base PROD `restaurant_hours` | Aucun champ `saturday_lunch_closed`, `sunday_lunch_closed`, `weekly_schedule` |
| Base DEV `restaurant_hours` | Ces trois champs sont présents et utilisés |
| RPC `public.create_fusion_chain_v1` | Présente en DEV ; absente en PROD |
| Déclencheurs `require_named_exterior_guest`, `reject_closed_weekly_service`, `validate_restaurant_weekly_schedule` | Présents DEV, absents PROD |
| Horaires PROD au jour du contrôle | Midi 12:00–14:30 ; soir 19:00–21:30 ; **durée 60 min** sur l'établissement réel |
| Sécurité du planning PROD | Politique `same_restaurant` en **ALL** ; DEV l'a limitée à **SELECT**, complétée par un `admin_edit` à contrôle de rôle/établissement |

Ces résultats sont issus de lectures catalogues et de contrôles GitHub, sans écritures PROD. Le fait que DEV soit validée **ne** prouve **pas** qu'un SQL DEV brut soit compatible avec PROD.

## Risques détectés / points bloquants

1. **RLS horaires en production :** l'ancienne politique permissive `same_restaurant FOR ALL` peut étendre les autorisations d'écriture par combinaison de policies. **Constat supplémentaire en lecture seule : le rôle SQL `authenticated` a effectivement le privilège UPDATE sur `restaurant_hours` en PROD (comme en DEV), mais PROD conserve une policy permissive `FOR ALL`, contrairement à DEV.** Ce couple de droits/policies expose un risque de modification directe par un compte Réception au niveau API, même si son interface cache l'action. Corriger sur copie de PROD avant l'exposition du planning ; contrôler avec un compte Réception qui tente un UPDATE (il doit être refusé), puis avec le responsable Restaurant (autorisé).
2. **Migration de week-end DEV non transposable telle quelle :** `20261112200500_john_weekend_lunch_dev.sql` contient un `UPDATE` qui force la fermeture samedi/dimanche midi pour l'établissement réel. **Ne pas recopier cette mise à jour sur PROD.** Initialiser le nouveau calendrier à partir des horaires **actuels de PROD**, puis faire confirmer toute fermeture voulue par l'équipe. Les horaires temporairement ouverts sur DEV pour les tests ne sont pas la configuration de production.
3. **Contrôles d'ouverture SQL legacy :** `install_walkin_group_v3/v4`, `booking_draft_v3`, `reception_booking_v3`, etc. vérifient encore les colonnes historiques sur PROD. En DEV, sept chemins ont été harmonisés avec `private.restaurant_service_open_at_v1`. La migration PROD doit conserver les signatures, propriétés, propriétaires, contrôles de rôle, verrouillages et garde-fous de tenant d'origine.
4. **Grant de la fonction privée :** elle doit être accessible au rôle SQL interne `resto_service_writer` pour les RPC qu'il possède, **pas** directement à `anon` ni `authenticated`. Le correctif a déjà été testé sur DEV et doit être préparé explicitement dans le futur script PROD.
5. **Fusion :** ne pas appliquer aveuglément la suite de migrations DEV, car `20261112110000_rm005_fusion_uuid_room_dev.sql` corrige un ancien SQL à base de `min(uuid)`. Préparer **uniquement la définition finale** de la RPC avec contrôles de salle/établissement/role/ordre physique, et les éventuels changements complémentaires requis pour 4 tables.
6. **Client extérieur :** la validation côté frontend doit avoir son garde-fou serveur ; préserver les réservations historiques et les clients Hôtel anonymes autorisés.
7. **Durée réelle :** PROD affiche actuellement 60 min ; la documentation métier historique mentionne 90 min. **Ne pas changer automatiquement** cette valeur : validation métier distincte requise.
8. **Sécurité :** les advisors signalent actuellement en PROD 22 fonctions `SECURITY DEFINER` exécutables par utilisateurs authentifiés, une table RLS sans policy (info) et la protection des mots de passe compromis non activée. Plusieurs RPC privilégiées sont intentionnelles : analyser leur corps et leurs droits, ne pas révoquer en bloc au risque de casser l'application. Voir https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Inventaire frontend : ne pas merger DEV en bloc

Le HTML DEV ajoute notamment neuf ressources absentes du HTML MAIN :
- `ui/booking-slot-cards.css` ;
- `service-v3-fusion-builder.css` ;
- `service-v3-management-categories.css` ;
- `service-v3-weekly-schedule.css`, `service-v3-weekly-schedule.js` ;
- `service-v3-slot-capacity.js` ;
- `service-v3-arrival-preview.css`, `service-v3-arrival-preview.js` ;
- `service-v3-booking-director-choices.js`.

En plus, plusieurs fichiers déjà présents ont évolué (moteur de réservation, gestion des passages, droits, formulaires, Lucide, gestion, PWA). Les imports, versions de cache et ordre d'initialisation doivent être repris **avec leurs dépendances**. Ne pas recopier les clés, l'environnement d'exécution DEV ni des valeurs de démonstration.

## Ordre de préparation proposé (non exécuté)

| Phase | Action proposée | Preuve obligatoire / arrêt |
|---|---|---|
| 0. État initial | Capturer SHAs exacts MAIN/V3, schéma/policies/fonctions et réglages horaires PROD ; faire confirmer sauvegarde/restauration testée par l'exploitant | Pas de backup prouvé = STOP |
| 1. Base éphémère | Reconstituer **la structure PROD**, avec données synthétiques ; appliquer seulement les migrations ciblées | Rollback et ré-exécution reproductibles |
| 2. Préparation RLS | Restreindre la politique horaire à la lecture par établissement ; permettre UPDATE uniquement au rôle Restaurant | Réception UPDATE refusé, Restaurant autorisé, isolement multi-tenant PASS |
| 3. Planning | Ajouter colonnes manquantes **sans effacer les valeurs** ; initialiser les 7 jours d'après les paramètres propres à chaque restaurant ; valider heures et fermer uniquement si explicitement souhaité | Dernière réservation et durée inchangées, aucun service fermé par accident |
| 4. Sécurité de service | Vérifier/remplacer les triggers de plage horaire et les 7 RPC legacy, avec helper privé et grant interne | Vendredi/samedi/dimanche ouverts/fermés ; UTC/Paris/minuit ; deux rôles |
| 5. Fonctionnalités SQL | Installer gardes client extérieur et fusion 2–4 tables, uniquement après revue des droits et des conflits | Réservation Hôtel sans nom toujours valable, extérieur anonyme bloqué, fusion atomique |
| 6. Frontend ciblé | Préparer PR non fusionnées par lots compatibles avec le schéma final ; exécuter Node + Playwright + parcours de service sur clone | 0 régression et aucun chemin vers Supabase DEV dans le build PROD |
| 7. Autorisation | Soumettre synthèse **GO/NO-GO** au propriétaire | **Accord explicite AVANT toute migration/merge/déploiement PROD** |
| 8. Publication (plus tard) | Migration SQL et release frontend dans ordre confirmé, avec contrôle en lecture seule de l'état post-migration, surveillance, option de retour arrière | Procédure validée, période de service compatible |
| 9. Sauvegarde V3 (plus tard) | Sauvegarder l'ancien état V3 distinctement, puis reconstruire V3 sur le **nouveau MAIN validé** et vérifier GitHub Pages | V3 et MAIN alignés sans écraser une ancienne sauvegarde |

**Attention :** les étapes 7–9 ne sont pas autorisées par ce dossier.

## Scripts DEV utiles comme références, PAS comme « SQL PROD prêt à exécuter »

1. `supabase/migrations/20261112200500_john_weekend_lunch_dev.sql` (contient UPDATE indésirable pour PROD).
2. `supabase/migrations/20261112211500_weekly_schedule_dev.sql` (init et trigger ; revoir valeur initiale en PROD).
3. `supabase/migrations/20261112212500_weekly_hours_rls_dev.sql` (durcissement RLS).
4. `supabase/migrations/20261113153000_rm005_walkin_weekly_server_dev.sql` (sept fonctions).
5. `supabase/migrations/20261113164500_rm005_weekly_helper_writer_grant_dev.sql` (writer interne).
6. `supabase/migrations/20261113015700_john_exterior_guest_required_dev.sql` (nom extérieur).
7. `supabase/migrations/20261111203000_rm005_four_table_walkins_dev.sql`, `20261112105000_rm005_atomic_fusion_chain_dev.sql`, `20261112110000_rm005_fusion_uuid_room_dev.sql` (régénérer une version finale, pas les 3 patches historiques).

Le fichier `supabase/release-prep/rm005_prod_readonly_preflight.sql` est **exclusivement en lecture** et a été exécuté avec succès contre PROD pour vérifier sa validité syntaxique.

## Backups et restauration

- Sauvegarde avant migration : schéma, fonctions/propriétaires/grants, politiques RLS, paramètres du restaurant, réservations, liens et verrous de tables, avec stockage et test de restauration autorisés par l'exploitant.
- Capture des SHAs git MAIN et V3 et création de références de restauration **sans changer leurs branches**.
- Si l'étape SQL ajoute des colonnes ou contraintes, le rollback applicatif ne suffit pas : conserver explicitement une trajectoire de **forward-fix** et de restauration de base éprouvée, sans suppression des nouvelles réservations.
- Pendant une anomalie, stopper les écritures si nécessaire avant de revenir à l'ancienne interface ; vérifier que l'ancien code accepte encore le nouveau schéma.

## Nouvelle préparation RLS — test de rôles sur DEV

- Projet de correction versionné, **non autorisé** : `supabase/release-prep/rm005_prod_hours_rls_candidate_NOT_APPROVED.sql`, conservé **hors** `supabase/migrations`. Ce script est **à revoir et à rejouer sur une copie éphémère du schéma PROD avant toute utilisation** ; sa présence sur GitHub n'autorise pas son exécution.
- Contrôle effectué en **transaction avec ROLLBACK sur Supabase DEV**, compte Réception `reception` : l'UPDATE des horaires ne renvoie aucune ligne et n'est donc pas appliqué.
- Contrôle effectué en **transaction avec ROLLBACK sur Supabase DEV**, compte Restaurant `fb_admin` : l'UPDATE neutre renvoie la ligne de l'établissement, conformément au rôle.
- Aucun horaire conservé, aucune réservation créée, aucune écriture PROD.
- Le candidat contient une précondition arrêtant la migration si la politique de PROD ne correspond plus à la baseline, préserve la policy du rôle writer et exige une validation après remplacement.
- Deux tests Node vérifient l'existence de garde-fous (ils **ne** remplacent pas l'exécution intégrale SQL sur un clone PROD).

## Travaux restant à effectuer avant un GO publiable

- Monter une copie éphémère représentative du **schéma PROD** pour tester les migrations finales *dans le bon ordre*, sans utiliser des données clientes sans accord.
- Construire les PR frontend ciblées et compiler les assets ; adapter toutes les interfaces Réception et Restaurant.
- Vérifier les RPC existantes par propriétaire et permissions, y compris concurrence, écrivain interne, horaires et capacités.
- Obtenir la décision métier sur les fermetures week-end, la durée des tables et l'heure de dernière réservation.
- Fixer le plan réel de sauvegarde/restauration et la fenêtre de mise en service.

**Conclusion : RM-005 prête en DEV, pas encore démontrée prête à être migrée sans risque vers PROD. Aucune intervention en production effectuée.**
