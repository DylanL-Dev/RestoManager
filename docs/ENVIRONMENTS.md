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
**À FAIRE :** Render utilise encore le projet Supabase de PRODUCTION. Ne pas utiliser Render pour simuler des réservations tant que son frontend ne pointe pas vers `lykoybacslvmhtzftqsf` et que le compte de test n'a pas été validé. Les deux projets SQL sont séparés, mais les frontends ne le sont pas encore.

## Workflow de mise à jour
1. Écrire des migrations SQL versionnées dans Git pour toute évolution de schéma ; ne jamais faire un copier/coller aveugle de la base ou de données réelles.
2. Tester la migration sur DEV avec les identifiants propres à DEV, y compris les politiques RLS et la synchronisation.
3. Valider la version sur RestoManager-V3, puis faire des PRs ciblées vers `main` pour le code.
4. Après sauvegarde et revue des migrations, appliquer à PROD uniquement les modifications de schéma validées. Ne jamais recopier les tables des réservations de DEV dans PROD.
5. Vérifier la santé des deux bases, les permissions et les fonctionnalités clés après le déploiement.

## Point important sur l'historique des migrations
PROD contient 34 migrations historiques Supabase. Le nouveau projet DEV a été reconstitué à partir d'un instantané structurel et dispose d'un historique distinct. **Ne pas effectuer un `supabase db push` automatique entre ces projets sans d'abord établir un historique de migrations cohérent et contrôler le diff.** Une correspondance du schéma ne signifie pas une correspondance de l'historique des migrations.

Aucune clé secrète ni mot de passe ne doit être stocké ici ou dans les fichiers publics GitHub Pages.
