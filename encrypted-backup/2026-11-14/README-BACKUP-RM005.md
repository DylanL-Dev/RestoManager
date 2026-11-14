# RM-005 — sauvegarde applicative PROD chiffrée (14/11/2026)

**Attention : sauvegarde applicative chiffrée créée, mais restauration intégrale NON encore testée.** Cette copie n'est pas un `pg_dump` complet et ne remplace pas les sauvegardes natives Supabase.

## Périmètre et méthode

Les données ont été capturées par **SELECT PostgreSQL** et chiffrées **dans Supabase PROD même, avant de quitter la base**, avec `extensions.pgp_pub_encrypt` et la clé publique PGP d'empreinte `23BC77EE84DB2A7BDA5106A05F61D5D401F8E50B`. La clé privée correspondante a été transmise au propriétaire séparément, **jamais publiée sur GitHub**. Le test de chiffrement/déchiffrement d'une chaîne fictive a réussi avec cette clé.

| Fichier chiffré | Contenu | Taille texte original (avant chiffrement) | SHA-256 du JSON en clair |
|---|---|---:|---|
| `rm005-prod-public-private-17-tables.pgp.asc` | 16 tables `public` + `private.booking_drafts_v3` | 208 413 octets | `786dca56d278699b36794b35e3b6737eca68c4029c4545d2dd922dbe29a372ff` |
| `rm005-prod-auth-users-identities-storage-metadata.pgp.asc` | `auth.users`, `auth.identities`, `storage.buckets`, `storage.objects` | 5 704 octets | `3ffdc0a8b0dbe3cc6a4f5f74132ad3794d91f60883fe9e9d09b428503e73f686` |

L'ensemble de l'export des 17 tables applicatives a été réalisé dans **une seule instruction SELECT**, garantissant une image MVCC cohérente de ce périmètre au moment de sa lecture ; le second export est un autre instant de lecture.

La clé de récupération privée est `RestoManager_CLE_PRIVEE_RESTAURATION_RM005.asc` fournie **uniquement au propriétaire**. L'export chiffré est inutilisable sans elle.

## Contrôle minimum effectué

- Présence réelle des deux fichiers GitHub : **vérifiée**
- Début de bloc **PGP MESSAGE** : **vérifié**
- Test de déchiffrement PGP par la clé privée, sur texte fictif chiffré dans Supabase : **PASS**
- Déchiffrement des deux exports réels et comparaison des SHA-256 : **PAS ENCORE RÉALISÉS**
- Restauration des JSON dans une copie isolée du schéma PROD : **PAS ENCORE RÉALISÉE**

## Déchiffrer le jour où une récupération est nécessaire

Sur un ordinateur privé et sûr, importer la clé privée puis déchiffrer chaque fichier GitHub :

```sh
gpg --import RestoManager_CLE_PRIVEE_RESTAURATION_RM005.asc
gpg --output data-public-private.json --decrypt rm005-prod-public-private-17-tables.pgp.asc
gpg --output auth-and-storage-metadata.json --decrypt rm005-prod-auth-users-identities-storage-metadata.pgp.asc
sha256sum data-public-private.json auth-and-storage-metadata.json
```

Les JSON contiennent des clés `tables`, `captured_utc`, `scope` et `format`. Le format est **un export de lignes JSON**, pas un SQL directement restaurable ; pour réimporter, utiliser la structure réelle des tables, les identifiants, contraintes et ordonnancer les références étrangères. Un essai sur une base de test est requis avant restauration sur PROD.

## Limitations

- Structure complète, extensions, politiques RLS, fonctions, rôles, secrets Supabase, configuration Auth, historiques et sessions Auth, fichiers binaires Storage : **non inclus intégralement dans ces deux fichiers**.
- Les branches de sauvegarde de code MAIN/V3 constituent un complément, mais ne remplacent pas les parties manquantes d'un dump PostgreSQL intégral.
- Aucune donnée n'a été modifiée sur Supabase PROD pour produire cette sauvegarde.
- Ne jamais mettre la clé privée de récupération en dépôt, copier le texte JSON déchiffré dans GitHub, ou publier les secrets.
- Conserver aussi une copie privée des deux fichiers chiffrés et de la clé dans deux endroits distincts.

**Cette sauvegarde réduit sensiblement le risque de perte de données métier lors de RM-005, mais n'autorise pas à affirmer une capacité de restauration complète de Supabase PROD.**
