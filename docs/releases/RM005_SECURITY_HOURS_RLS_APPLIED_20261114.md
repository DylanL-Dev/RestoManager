# RestoManager — RM-005 : correction de sécurité des horaires PROD

Date : **14 novembre 2026**. Projet Supabase PROD : `tnsrkargogckgtsxipwd`.

## Portée et autorisation
Le propriétaire souhaitait que le défaut de permissions des horaires soit corrigé sans aucune manipulation manuelle de la base. Une correction **RLS ciblée** a été appliquée directement via le connecteur Supabase. **Aucune fonction de réservation, donnée client, colonne ni règle de planning n'a été migrée.** Le déploiement complet de RM-005 n'est pas autorisé à ce stade.

## Migration exécutée et traçabilité

- **Migration Supabase PROD appliquée avec succès** : `20261114043824_rm005_prod_hours_rls_role_guard_20261114` (nom logique `rm005_prod_hours_rls_role_guard_20261114`).
- Déclencheur : politique `same_restaurant FOR ALL` autorisant trop largement les écritures des comptes authentifiés ; le rôle `authenticated` dispose du privilège SQL UPDATE sur `restaurant_hours`.
- Garde d'entrée : RLS activée, 4 policies attendues, noms/rôles et définitions initiales conformes, rôle d'écriture interne conservé.
- Politique `same_restaurant` : désormais **FOR SELECT**, contrôle du restaurant.
- Politique `staff_read` : SELECT pour `reception` et `fb_admin` **dans leur restaurant**.
- Politique `admin_edit` : UPDATE avec `USING` et `WITH CHECK` restreints au restaurant et à `fb_admin`.
- Politique `writer_access` du rôle interne `resto_service_writer` : **inchangée**.

## Vérifications opérationnelles

| Contrôle | Avant | Après |
|---|---|---|
| Nombre de réservations | 149 | **149** |
| Lignes de configuration horaires | 2 | **2** |
| Empreinte des horaires et durées | `adda1c4796d8a7886232eb13c7effcc3` | **identique** |
| `same_restaurant FOR ALL` | 1 | **0** |
| `admin_edit` filtrée par établissement | Non | **Oui** |
| Test SQL rôle Réception | Risque lié à policy permissive | UPDATE sans changement effectif : **0 ligne** |
| Test SQL rôle Restaurant | Autorisé | UPDATE sans changement effectif : **1 ligne**, sous ROLLBACK |

Tests de rôles simulés à partir de profils autorisés dans une transaction `BEGIN...ROLLBACK` ; aucune modification métier conservée.

Security Advisor (post-migration) : 22 fonctions `SECURITY DEFINER` appelables par `authenticated`, RLS sans policy pour la table d'audit interne (1 INFO), et alerte sur la protection des mots de passe compromis (1 WARN). Ces alertes préexistantes demandent une revue ciblée et ne justifient aucune révocation globale. Voir https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Rollback — rappel impératif

Si une régression du service est observée, **ne pas rétablir l'ancienne policy `same_restaurant FOR ALL` sans analyser le risque de sécurité**. En cas d'urgence, préférer corriger la policy ou la fonction métier ciblée avec une migration atomique et des tests de rôle. Toute modification supplémentaire de PROD exige une décision explicite.

## Ce qui reste à faire avant de publier RM-005

1. **Sauvegarde restaurable des données Supabase PROD** : non obtenue ; les copies de branches GitHub ne sauvegardent pas la base.
2. Planification hebdomadaire : colonnes DEV absentes de PROD, migrations ciblées et configuration conservatrice des valeurs.
3. RPC passages / réservation : fonctions SQL doivent utiliser la semaine sans perdre verrouillage, sécurité, droits et contrôle de durée.
4. Fusion 2–4 tables, nom extérieur, salles : préparation par lots avec recette isolée.
5. Interfaces frontend RM-005, migration des assets et tests E2E sur clone de structure PROD.
6. Validation explicite séparée avant modification des fonctionnalités et publication MAIN / V3.

**État : correction de sécurité des horaires PROD terminée et vérifiée. RM-005 complète toujours EN PRÉPARATION.**
