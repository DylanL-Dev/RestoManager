# RestoManager — sauvegarde chiffrée de Supabase PROD depuis GitHub

**Statut : automatisation préparée ; PAS ENCORE EXÉCUTÉE.**
**Branches officielles MAIN et RestoManager-V3 NON MODIFIÉES.**
Branche GitHub d'opérations uniquement : `ops/supabase-prod-encrypted-backup-20261113`.

## Principe

Un workflow GitHub Actions **à déclenchement contrôlé** exporte les schémas PostgreSQL `public`, `private`, `auth`, `storage` et `supabase_migrations` depuis Supabase PROD, projet `tnsrkargogckgtsxipwd`.

- **Lecture uniquement** : `pg_dump` + `pg_restore --list`, aucune migration ni écriture.
- **Contrôle de la cible** : seuls hôte/identifiant de PROD et port 5432 (direct ou Session Pooler) sont acceptés.
- **Chiffrement** : GnuPG avec la clé publique du projet (empreinte `23BC77EE84DB2A7BDA5106A05F61D5D401F8E50B`). Le fichier privé de déchiffrement doit rester **hors GitHub**, sur le téléphone/ordinateur du propriétaire.
- **Fichier transmis** : uniquement `.tar.gz.gpg`, jamais `production.dump` ou le contenu des réservations.
- **Expiration des artefacts** : 14 jours ; télécharger le fichier chiffré et le conserver en endroit privé.
- **Contrôle minimal automatique** : `pg_restore --list` fonctionne, les données des tables `public.reservations` et `auth.users` sont présentes dans l'archive.

## La seule configuration GitHub nécessaire

Dans le dépôt GitHub, accéder à **Settings → Secrets and variables → Actions → New repository secret**.

Créer un secret nommé **`RM_SUPABASE_PROD_DB_URL`**.

La valeur doit être la chaîne **Postgres Connection string → Session pooler** du projet PROD Supabase, avec son mot de passe intégré de manière compatible URL, port **5432**. Aller dans le Dashboard Supabase du projet `tnsrkargogckgtsxipwd` et utiliser **Connect → Session pooler**. **Ne jamais copier cette valeur dans une conversation, un ticket, un fichier GitHub ou une capture.** Ne pas utiliser la clé publique Supabase (anon key) : il faut bien l'URL PostgreSQL.

Si le mot de passe de la base n'est pas connu, **ne pas le réinitialiser sans vérifier les effets sur les applications existantes**.

## Démarrage de l'export

Le workflow réagit **uniquement** à une modification du fichier `ops/backup-request.txt` sur cette branche d'opérations. Ce déclenchement par `push` fonctionne sans modifier le workflow de MAIN. Il ne peut pas être activé par une simple discussion.

Après création du secret GitHub et conservation de la clé privée personnelle, le propriétaire prévient l'assistant qui met à jour ce fichier sur la branche d'opérations. GitHub exécute alors le workflow. Aucun changement sur MAIN ou V3.

Le fichier `ops/backup-request.txt` n'est pas créé tant que la connexion nécessaire n'est pas configurée, pour éviter un essai inutile.

## Où retrouver l'export

GitHub → dépôt RestoManager → **Actions** → workflow « RM - Sauvegarde chiffree Supabase PROD » → dernière exécution → **Artifacts**.

Télécharger l'archive **chiffrée** et conserver aussi la clé privée de récupération personnelle (non présente dans le dépôt). La réussite GitHub doit être vérifiée : ne jamais considérer l'export comme effectué tant que le job n'est pas vert et que l'artefact n'existe pas.

## Déchiffrement et vérification ultérieure, sur un ordinateur sûr

```sh
gpg --import RestoManager_CLE_PRIVEE_RESTAURATION_RM005.asc
gpg --output backup-package.tar.gz --decrypt restomanager-prod-AAAAmmjjTHHMMSSZ.tar.gz.gpg
mkdir restaure
tar -xzf backup-package.tar.gz -C restaure
cd restaure
sha256sum -c checksums.sha256
pg_restore --list production.dump
```

Ces commandes **n'écrivent pas dans Supabase PROD**. Il reste à essayer une vraie restauration dans un environnement PostgreSQL/Supabase jetable avant un GO RM-005.

## Limites et sécurité

- La copie est un **dump logique**, pas un snapshot transactionnel de toutes les ressources Supabase.
- L'archive inclut les tables Auth et les **métadonnées** Storage, mais pas le contenu binaire des fichiers stockés par le service Storage, ni secrets d'environnement, paramètres Auth et Edge Functions.
- Les rôles PostgreSQL globaux ne sont pas nécessairement exportés. Prévoir la reconstruction/vérification des rôles et grants d'une cible de restauration.
- Les cinq schémas sont exportés en un seul `pg_dump`, ce qui évite de mélanger plusieurs instants entre les tables ; cela n'empêche pas des modifications pendant le service.
- Une sauvegarde **restaurable** suppose la conservation de la clé privée, une archive téléchargeable et un essai de restauration isolé.
- Si une vérification échoue, le job doit échouer sans envoyer de fichier non chiffré.
- L'opération ne publie ni RM-005 ni RM-006. **Aucune migration PROD sans nouvelle autorisation explicite.**

Documents officiels :
- https://supabase.com/docs/guides/platform/backups
- https://www.postgresql.org/docs/17/app-pgdump.html
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
