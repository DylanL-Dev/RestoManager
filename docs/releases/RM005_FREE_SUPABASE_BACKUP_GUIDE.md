# RM-005 — Sauvegarde manuelle gratuite Supabase PROD (avant publication)

**Statut : procédure prête, sauvegarde réelle NON EFFECTUÉE / NON VÉRIFIÉE.**
Date de rédaction : 13 novembre 2026.
Projet de production ciblé : `tnsrkargogckgtsxipwd`.
**N'exécuter aucun script de migration RM-005, aucune fusion MAIN/V3 et aucune commande destructrice avant validation de la sauvegarde.**

## Pourquoi cette méthode

Sur Supabase Free, les sauvegardes automatiques accessibles via le Dashboard ne sont pas incluses.
Supabase recommande une sauvegarde manuelle avec le **Supabase CLI** et la conservation d'une copie hors site.
Documentation officielle :
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/reference/cli/introduction

Le dépôt GitHub et les copies de branches Git **ne sauvegardent pas** les données Supabase.

## Avant de commencer (ordinateur Windows, macOS ou Linux)

1. Installer la version à jour du **Supabase CLI** depuis la documentation officielle.
2. Installer et démarrer **Docker Desktop** (utilisé par la commande `db dump` du Supabase CLI).
3. Utiliser un **nouveau dossier local hors dépôt Git**, destiné uniquement aux sauvegardes, par exemple `Documents/RestoManager-Backups/2026-11-13`.
4. Ne jamais envoyer le mot de passe de base, la chaîne PostgreSQL, ni les fichiers `.sql` contenant des réservations dans un message, un ticket, GitHub, ou un dépôt public.
5. Vérifier dans le Dashboard Supabase que la cible du projet est bien **PROD** et non `lykoybacslvmhtzftqsf` (DEV). Ne pas réinitialiser un mot de passe en production sans planifier l'impact sur ses connexions existantes.

## Commandes (à lancer dans le dossier dédié, **pas** dans le dépôt Git)

Sur Windows PowerShell, dans un dossier de sauvegarde fraîchement créé :

```powershell
supabase --version
supabase init
supabase login
supabase link --project-ref tnsrkargogckgtsxipwd
supabase db dump --linked -f roles.sql --role-only
supabase db dump --linked -f schema.sql
supabase db dump --linked -f data.sql --data-only --use-copy -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

- `supabase init` initialise **uniquement le répertoire local** ; aucune base distante modifiée.
- `supabase link` lie ce répertoire au projet PROD ; l'opération doit viser le bon projet.
- Les commandes `db dump` lisent et exportent le schéma, les rôles et les données. **Ne jamais lancer `db reset` ou `db push` vers PROD pour réaliser une sauvegarde.**
- Le CLI peut demander une authentification ou le mot de passe PostgreSQL localement ; **ne les transmettez jamais à ChatGPT**.
- À chaque export, vérifier que la commande indique un succès et ne présente aucune erreur.

> Selon la version exacte du CLI, `--remote` est la syntaxe recommandée (v3) ; `--linked` reste accepté pour compatibilité. En cas de doute, lancer `supabase db dump --help` pour vérifier les options disponibles.

## Vérification sur Windows PowerShell

```powershell
Get-Item .\roles.sql, .\schema.sql, .\data.sql | Select-Object Name, Length, LastWriteTime
Get-FileHash .\roles.sql, .\schema.sql, .\data.sql -Algorithm SHA256
```

Les trois fichiers doivent exister, avec une taille plausible non nulle ; conserver leurs SHA-256 pour un contrôle ultérieur. Un hash et une taille valides **ne prouvent pas** qu'une restauration complète fonctionnerait. Tester une restauration vers une **instance isolée** avant d'autoriser le déploiement.

## Limites importantes

- Le `supabase db dump` standard **exclut les schémas administrés** par Supabase, notamment `auth` et `storage`. La sauvegarde des rôles/schéma/données métier **n'est donc pas une image complète de tous les utilisateurs, objets Stockage et paramètres du projet**.
- Si RestoManager dépend de comptes Supabase Auth, d'objets Storage, de politiques personnalisées sur ces schémas, de secrets ou d'Edge Functions, une procédure complémentaire de sauvegarde/restauration doit les prendre en compte.
- Pour une restauration à l'identique, contrôler aussi les politiques RLS, grants, fonctions SQL, migration history, publications Realtime et paramètres Auth. Les migrations Git ne remplacent pas ces éléments.
- Conserver la sauvegarde **chiffrée** dans au moins deux endroits privés (par exemple PC + support externe chiffré). Ne pas conserver de dump de données clients dans GitHub.
- Pour obtenir une sauvegarde cohérente juste avant la bascule, réduire au maximum les écritures pendant l'export ou prendre une copie au moment de la fenêtre de maintenance. Les 3 dumps sont successifs et ne constituent pas un instantané transactionnel commun.

## Condition de GO

La publication RM-005 est **bloquée** tant qu'un export daté avec contenu métier et les compléments nécessaires n'a pas été contrôlé, qu'un chemin de restauration n'a pas été testé et que le propriétaire n'a pas donné son accord explicite.

Le fait que les deux branches Git aient été sauvegardées et que les tests CI soient verts **ne suffit pas à déclarer la production sécurisée**.

## Si l'utilisateur n'a qu'un téléphone

On peut continuer le travail sur la **branche de préparation** et les tests CI, sans payer Supabase ni toucher PROD. Pour obtenir la sauvegarde réelle, prévoir un ordinateur (ou, après conception et revue de sécurité, un workflow CI manuel stockant une sauvegarde **chiffrée** hors dépôt, avec secrets protégés). Ne pas improviser un export de données sensibles dans la conversation.
