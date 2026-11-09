# RestoManager — environnements indépendants

État contrôlé le 9 novembre 2026.

## Production (ne jamais effacer)
- Frontend : GitHub Pages, branche `main`
- Projet Supabase actuel : `tnsrkargogckgtsxipwd` (`RestoManager-V3`)
- Contient les comptes, les réservations et les historiques réels des clients.
- Ne jamais exécuter de jeux d'essais, de reset ou de seed fictif en production.

## Développement
- Frontend : branche `feature/v3-supabase-full-clone`, déployée sur Render.
- Projet Supabase séparé : `lykoybacslvmhtzftqsf` (`RestoManager-DEV`), même organisation et région eu-west-1.
- Structure métier vérifiée : 17 tables (16 publiques + 1 privée), 133 colonnes, 86 contraintes, 57 fonctions, 47 politiques RLS, 44 index, 24 déclencheurs.
- Configurations restaurants, salles, 23 tables, horaires, fusions et révisions copiées à l'identique (comparaison de hachages de lignes).
- Données volontairement absentes : réservations réelles, verrous en cours, historiques clients, comptes Auth et profils de personnel.
- Comptes Auth DEV à créer de façon indépendante et sécurisée. Ne pas réutiliser les mots de passe / comptes réels.

## État de la connexion Render
**Connexion distincte mise en place :** la branche de développement utilise `restomanager-env.js` et sélectionne `lykoybacslvmhtzftqsf` pour le domaine Render (et localhost), alors que les fichiers de `main` utilisent toujours la production. Le déploiement Render `dep-dbp1sarm8hqs73dt1b9g` a été confirmé `live`. Ne pas considérer le parcours de réservation pleinement opérationnel tant que les deux utilisateurs Auth de DEV n'ont pas été créés et testés.

## Workflow de mise à jour
1. Écrire des migrations SQL versionnées dans Git pour toute évolution de schéma ; ne jamais faire un copier/coller aveugle de la base ou de données réelles.
2. Tester la migration sur DEV avec les identifiants propres à DEV, y compris les politiques RLS et la synchronisation.
3. Valider la version sur RestoManager-V3, puis faire des PRs ciblées vers `main` pour le code.
4. Après sauvegarde et revue des migrations, appliquer à PROD uniquement les modifications de schéma validées. Ne jamais recopier les tables des réservations de DEV dans PROD.
5. Vérifier la santé des deux bases, les permissions et les fonctionnalités clés après le déploiement.

## Point important sur l'historique des migrations
PROD contient 34 migrations historiques Supabase. Le nouveau projet DEV a été reconstitué à partir d'un instantané structurel et dispose d'un historique distinct. **Ne pas effectuer un `supabase db push` automatique entre ces projets sans d'abord établir un historique de migrations cohérent et contrôler le diff.** Une correspondance du schéma ne signifie pas une correspondance de l'historique des migrations.

Aucune clé secrète ni mot de passe ne doit être stocké ici ou dans les fichiers publics GitHub Pages.

## Activer les comptes DEV (opération manuelle obligatoire)
1. Ouvrir [Supabase Auth — Utilisateurs DEV](https://supabase.com/dashboard/project/lykoybacslvmhtzftqsf/auth/users) et créer, via **Add user**, deux utilisateurs avec des mots de passe nouveaux et uniques :
   - `reception@accounts.restomanager.example.com`
   - `admin-fb@accounts.restomanager.example.com`
2. Les utilisateurs doivent être **confirmés** dans Auth. Ne pas réutiliser les mots de passe de PROD, et ne jamais les écrire dans GitHub ou ChatGPT.
3. Exécuter seulement dans l'éditeur SQL du projet DEV : [`supabase/scripts/dev_staff_bootstrap.sql`](../supabase/scripts/dev_staff_bootstrap.sql). Le script refuse de s'exécuter sur une base comportant des réservations ou des profils du personnel.
4. Vérifier que DEV contient 2 profils actifs (réception + F&B), que les réservations DEV sont toujours vides, puis se connecter sur la [page Render de test](https://restomanager-v3-supabase-integration.onrender.com/login.html) avec les identifiants `reception` et `admin-fb` et les **mots de passe DEV**.
5. Tester un cycle complet : réservation fictive Réception → synchronisation Restaurant → installation → changement de table → libération → annulation/suppression de la réservation fictive, en comparant avant/après le nombre de réservations sur PROD.

Ne jamais créer d'utilisateurs directement avec des insertions SQL dans `auth.users` : passer par Supabase Auth pour que ses validations, identités et secrets soient correctement initialisés.

## Activation des profils de test — 2026-11-09
- Deux utilisateurs Auth DEV créés et confirmés, puis profils `reception` et `fb_admin` activés sur la même configuration du restaurant que la version de production.
- Vérifications SQL : DEV = 2 profils, 23 tables, 0 réservation ; production = 2 profils, 86 réservations (instantané au moment du contrôle).
- Connexion des deux comptes au navigateur et tests fonctionnels de bout en bout **non encore vérifiés** : nécessitent les mots de passe DEV détenus uniquement par l'utilisateur.
- Ne pas utiliser les comptes PROD sur Render ; l'interface de la branche Render est routée vers le projet DEV via `restomanager-env.js`.
