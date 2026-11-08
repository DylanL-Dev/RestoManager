# Application SQL Mission 2 et Mission 3 — 8 novembre 2026

L’application au projet d’intégration `tnsrkargogckgtsxipwd` a été explicitement autorisée par le responsable. Aucune fusion de la PR ni publication Render n’est comprise dans cette autorisation.

## Exécution et données conservées

- Réussi : migration `20261108115320_mission2_mission3_reservation_safety_atomic`, appliquée vers 11 h 53 UTC.
- Les scripts Mission 2 puis Mission 3 ont été exécutés dans une transaction unique ; seuls leurs `begin`/`commit` extérieurs ont été remplacés par cette enveloppe atomique.
- Un verrou bref des 15 tables applicatives protégeait la comparaison avant/après. Des empreintes calculées dans la base ont confirmé l’identité de tous les champs métier, en excluant uniquement la nouvelle colonne technique `edit_version`. Une différence aurait annulé la transaction.
- 76 réservations conservées, toutes avec un UUID de version distinct ; 23 tables dont 22 actives, 98 affectations, une salle, deux établissements. Aucune réservation de test n’a été créée dans le projet partagé.
- Les 41 politiques RLS initiales restent identiques. La nouvelle politique de lecture de révision est limitée au rôle serveur et à son établissement.
- Les quatre RPC publiques V4/synchronisation/reprise ont le propriétaire `resto_service_writer`, un `search_path` vide et des droits d’exécution pour `authenticated`, sans exécution anonyme. Le rôle propriétaire n’est ni superutilisateur ni BYPASSRLS.
- Les écritures directes de réservations, affectations, tables, maintiens et fusions sont fermées, y compris les ACL de colonnes. Les droits de configuration des salles et horaires restent présents sous leurs règles RLS.
- Les contrats de synchronisation et de consultation d’une clé absente ont été appelés en lecture seule dans les contextes Restaurant/Réception. Résultat : capacités `reservation_edits:4`, `booking_recovery:1`, `snapshot:1`, clé `missing`. Ces contrôles ne constituent pas un essai fonctionnel complet avec deux navigateurs sur le projet partagé.

## Compatibilité avec l’administrateur Supabase

Une première demande de confirmation du connecteur a expiré. La tentative suivante a échoué avec `42501`, sans laisser les migrations appliquées : le propriétaire de fonctions doit disposer du droit `CREATE` sur son schéma lors de `ALTER FUNCTION ... OWNER TO`. L’administrateur Supabase est propriétaire mais n’est pas superutilisateur, différence absente de la première simulation locale.

Les deux scripts conservent désormais les permissions initiales, accordent les seuls droits de schéma nécessaires dans leur transaction, puis les rétablissent avant commit. Les autres sessions ne voient jamais cette permission transitoire. Le contrôle final confirme que le rôle serveur ne possède `CREATE` ni sur `public` ni sur `private`, et que les ACL de ces schémas correspondent exactement à leur état précédent.

Six nouveaux scénarios reproduisent un administrateur non superutilisateur : application, réapplication, rollback sur erreur et conservation d’un éventuel droit préexistant. Aucun compte ni privilège administratif n’est créé sur le projet partagé pour ces tests.

## Sauvegarde et preuves

Un export des définitions, propriétaires, ACL, colonnes, contraintes, index, triggers et RLS a été conservé hors du dépôt, sans données clients ni mot de passe. Sa reconstruction puis la restauration d’un export SQL de schéma dans une seconde base isolée ont réussi. Il s’agit d’une sauvegarde de schéma et permissions, pas d’une sauvegarde complète des données ni d’une validation de PITR Supabase.

L’enveloppe SQL, les empreintes SHA-256 des deux scripts et les journaux sont conservés dans le dossier temporaire de cette session. Une erreur injectée après Mission 3 a confirmé le rollback de l’ensemble Mission 2 + Mission 3. La répétition finale avec les privilèges non superutilisateur a réussi.

Commandes exécutées :

```sh
npm run test:syntax
npm test
MISSION3_POSTGRES_IMAGE=restomanager-mission3/postgres:17-bookworm-flattened npm run test:mission3:postgres
```

Résultats locaux : 89 fichiers vérifiés sans erreur de syntaxe, 25 fichiers de tests réussis, 54 scénarios PostgreSQL réussis. La suite complète HTTP/Auth/Realtime/navigateurs avait également réussi en CI sur le précédent commit `f80e3a1` ; le changement de compatibilité des migrations relance cette CI sur la branche dédiée.

Les contrôles de santé Supabase ne signalent aucune anomalie. Les catégories d’avertissement de sécurité sont identiques avant et après : RPC Security Definer destinées aux collaborateurs, audit de réinitialisation sans politique de lecture, protection contre les mots de passe compromis non activée. Références : [fonctions exposées](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Aucun réglage Auth supplémentaire n’a été modifié.

## Suite à autoriser séparément

Render sert toujours `4432417`, déploiement `dep-dbnge3rm8hqs73c5776g`. Les anciens clients d’édition V3 sont désormais refusés pour éviter les écrasements. Il faut publier le frontend compatible pour disposer de la correction d’affichage et des éditions V4.

La PR reste dédiée à `feature/v3-supabase-full-clone`, sans fusion. Le service Render suit automatiquement cette branche d’intégration : sa fusion peut déclencher une publication et nécessite donc une autorisation explicite de publication, ainsi que la validation de la PR. `main` et la branche officielle du restaurant restent inchangées.

Un retour arrière ne doit pas réactiver les anciennes éditions sans contrôle de version. En cas de difficulté, maintenir la consultation seule et privilégier une correction en avant. Toute restauration de données ou publication est une opération distincte à autoriser.
