# RM-015.2 — Activation technique DEV, 19 novembre 2026

Autorisation explicite du propriétaire : migration et configuration de l’API sur **Supabase DEV uniquement**, emails désactivés. Branche `feature/rm015-dev-activation`, issue de DEV `cd4b8f2b81bd89d193e55c542fd7f74b1fd21ba6`. Sauvegarde Git distante `backup/rm0152-dev-before-activation-20261119` sur ce même commit.

## Migration métier appliquée

Projet vérifié : `lykoybacslvmhtzftqsf`, **RestoManager-DEV**, PostgreSQL 17.11. Aucun changement PROD, MAIN ou V3.

La migration `20261118190351_rm015_secure_public_booking.sql`, déjà validée sur base éphémère et revue dans la PR #185, est appliquée. Les six tables privées ont RLS activée et forcée ; le rôle technique n’a ni LOGIN ni BYPASSRLS. Les RPC backend sont inaccessibles à anon/authenticated. La RPC salariée conserve ses contrôles Restaurant/Réception.

Les empreintes des sept ensembles métier sont identiques avant/après : réservations, affectations, tables, horaires, maintiens salariés, clôtures et profils. Aucune réservation, clôture ou maintien fictif créé dans DEV. Aucun restaurant activé par la migration. Preuves : `preuves/rm0152-activation-20261119/dev-schema-before.json` et `dev-schema-after.json` (définitions SQL et empreintes uniquement, aucune donnée personnelle ni clé).

## Configuration chiffrée supplémentaire : impacts avant application

Le connecteur déploie les fonctions mais ne propose pas de gestionnaire de secrets Edge. La configuration spécifique utilise donc **Supabase Vault, déjà installé dans DEV**. Aucun changement de ses secrets existants ni de sa clé de chiffrement.

Migration additive `20261119084919_rm015_dev_runtime_vault.sql`, créée avec la CLI : une RPC sans argument, `rm015_runtime_config_v1()`, lit exclusivement le secret nommé `rm015_runtime_v1`. EXECUTE est révoqué à PUBLIC/anon/authenticated et accordé au seul service_role. Le rôle PostgreSQL appelant doit réellement être service_role et `auth.uid()` doit être nul. Le moteur Web et les salariés ne reçoivent aucun accès à la vue générale de Vault. Aucun secret ni configuration d’établissement ne figure dans la migration.

La configuration a été générée côté serveur : clés AES et HMAC aléatoires de 256 bits, clé active versionnée, origine exacte Render DEV, identité du projet DEV, emails désactivés. Le secret est conservé chiffré par Vault, jamais dans Git, le navigateur, Render statique ou les logs applicatifs. La clé serveur Supabase provient des variables automatiques de l’Edge ; elle n’est pas récupérée par l’agent. L’API vérifie son projet avant tout accès au backend et refuse les configurations étrangères, incomplètes ou activant les emails. Cache mémoire maximal de 30 secondes, échec fermé après expiration et coupure immédiate avec `RM015_ENABLED=false`.

La migration supplémentaire a passé huit groupes de tests PostgreSQL isolés : réapplication, permissions anon/salarié/backend, refus hors contexte, secret absent, absence d’accès à un autre secret ou à la vue Vault, search_path et ACL. Le Vault de ce test est une vue de simulation : ce test ne prétend pas simuler son chiffrement réel.

## Vérification de l’entrée réseau

Le premier appel de profil a détecté `permission denied for schema auth`. Sur Supabase, postgres n’a pas de GRANT OPTION sur ce schéma géré : le GRANT initial de la migration n’a pas été effectif. La migration additive `20261119085721_rm015_backend_auth_permissions.sql` réutilise à l’identique l’expression de l’identité vérifiée dans auth.uid(), sans dépendance au schéma Auth : lecture de request.jwt.claim.sub, puis de request.jwt.claims.sub. Elle remplace ses appels dans les seules fonctions RM015 du rôle technique et dans le trigger de sérialisation partagé `private.lock_direct_service_mutation_v1()`, qui s’exécute aussi sous ce rôle. Aucun accès Auth, héritage authenticated, nouveau SECURITY DEFINER ou privilège salarié n’est accordé. Identité, propriétaire, ACL et search_path des fonctions sont conservés. L’héritage d’ownership pour l’installateur est temporaire dans la transaction, puis désactivé. La fixture des tests métier retire expressément USAGE de auth au rôle technique pour reproduire les ACL hébergées ; les tests vérifient que le droit reste absent, puis exercent les contrôles d’identité et métier avec la correction réappliquée deux fois.

Sonde temporaire en lecture, sans journalisation d’IP ou de corps : requêtes depuis l’extérieur puis depuis l’Edge elle-même, afin de ne pas dépendre du proxy de l’environnement de développement. L’en-tête X-Forwarded-For forgé est remplacé ; un CF-Connecting-IP forgé est rejeté en HTTP 403 par l’infrastructure. L’en-tête CF-Connecting-IP présent est retenu avec un seul saut. La sonde a été remplacée par l’API finale ; aucun diagnostic réseau ne subsistera dans sa réponse.

## Ouverture métier distincte

Le responsable Restaurant doit renseigner Gestion → Réservations en ligne : adresse publique, nombre maximal, mentions de confidentialité, contact et conditions, puis décider de l’ouverture. Aucun maximum, texte juridique ou horaire n’est inventé. Le délai des groupes reste une heure par défaut. Les emails et le worker d’envoi restent désactivés/non déployés. Les essais créant des demandes restent exclusivement isolés.

## État technique et validations

La fonction `rm015-public`, version 4, est ACTIVE sur DEV (SHA de bundle `6405b7df5eeb1d52caf0f5643cc47f0424d3e0c73c74cf94e7b389398f9b6543`). La configuration Vault est chargée et validée par l’API. GET → 405 ; origine étrangère → 403 ; profil d’un établissement non configuré → 503 UNAVAILABLE, sans ouvrir le canal. Les quatre RPC backend, y compris le lecteur de configuration, refusent réellement une clé publique en HTTP 401 / SQL 42501. Le rôle technique n’a toujours aucun USAGE sur auth ni aucune appartenance à un autre rôle.

Historique hébergé créé par MCP (ses versions reflètent l’heure d’application, pas le nom local) :

| Fichier local | Version hébergée | Nom |
| --- | --- | --- |
| 20261118190351_rm015_secure_public_booking.sql | 20261119084656 | rm015_secure_public_booking |
| 20261119084919_rm015_dev_runtime_vault.sql | 20261119085516 | rm015_dev_runtime_vault |
| 20261119085721_rm015_backend_auth_permissions.sql | 20261119090411 | rm015_backend_auth_permissions |

Ne pas utiliser un db push ou réparer l’historique à l’aveugle : cette correspondance doit être prise en compte lors d’une future réconciliation CLI.

| Contrôle local | Résultat |
| --- | --- |
| Unitaires | 60 fichiers passent ; 9 nouveaux cas configuration/runtime passent aussi en exécution directe |
| Syntaxe JavaScript | 178 fichiers, zéro erreur |
| Deno 2.5.6 | Les deux entrypoints passent le contrôle de types |
| PostgreSQL métier, réseau coupé | 27 groupes passent, y compris ACL hébergées, concurrence, quota d’arrivées, une heure et DST |
| PostgreSQL configuration, réseau coupé | 8 groupes passent ; Vault représenté par une vue de test |
| Playwright connecté local + vrai PostgreSQL jetable | 13 scénarios, 27 audits axe, zéro requête externe |
| Largeurs testées | 360, 390, 430, 768, 1024, 1440, 1920 px |
| Appels directs RPC depuis la clé publique DEV | Quatre refus 401 / 42501, aucun accès aux secrets |

Captures fonctionnelles issues exclusivement de données fictives isolées :

| Format | Client | Réglages Restaurant |
| --- | --- | --- |
| Mobile 390 | [Voir](preuves/rm0152-activation-20261119/client-venue-390.png) | [Voir](preuves/rm0152-activation-20261119/restaurant-settings-390.png) |
| Tablette 768 | [Voir](preuves/rm0152-activation-20261119/client-venue-768.png) | [Voir](preuves/rm0152-activation-20261119/restaurant-settings-768.png) |
| PC 1440 | [Voir](preuves/rm0152-activation-20261119/client-venue-1440.png) | [Voir](preuves/rm0152-activation-20261119/restaurant-settings-1440.png) |

Résultats JSON et catalogue final dans le même dossier. Les tests CI complets sur le commit de la PR et l’état LIVE du déploiement Render sont consignés dans la description finale de la Pull Request. Aucun essai avec de vrais clients n’est revendiqué.

## Avis de sécurité Supabase

Après activation, aucun avertissement anon sur une nouvelle RPC. Le contrôle signale 22 fonctions SECURITY DEFINER salariées : 21 préexistantes, plus rm015_staff_v1 intentionnellement autorisée aux salariés avec profil actif et contrôles serveur Restaurant/Réception. Révoquer son exécution casserait cette fonction. Voir [le contrôle et les options](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Les deux avis préexistants restent inchangés : [audit de reset avec RLS sans policy, donc accès refusé](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), et [protection des mots de passe compromis désactivée](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Aucun réglage Auth global n’a été modifié.

## Recette sur Render DEV

1. Ouvrir https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html et se connecter avec son compte Restaurant DEV habituel.
2. Gestion → Réservations en ligne : le nouvel espace apparaît grâce à la capacité serveur. Consulter les réglages. Ne pas enregistrer de valeurs de démonstration dans l’établissement partagé.
3. Le responsable peut renseigner ses véritables maximum, adresse publique, confidentialité, contact et conditions. Le délai par défaut est 60 minutes ; horaires et pourcentage restent ceux de Gestion. L’ouverture exige une action explicite.
4. Ouvrir la page publique via le lien de Gestion après cette configuration. Tant que le Restaurant n’est pas configuré/ouvert, https://restomanager-v3-supabase-integration.onrender.com/reservation/live.html?restaurant=a-lepicerie-rouen affiche un état indisponible sans créer de demande. Ce slug dans l’URL est une référence d’aperçu, pas un restaurant inscrit automatiquement en base.
5. Pour essayer librement sans écriture partagée : https://restomanager-v3-supabase-integration.onrender.com/reservation/?restaurant=a-lepicerie-rouen conserve la démonstration RM-015.1 entièrement isolée. Les captures du parcours connecté complet proviennent du banc de test isolé.
6. Aucune tentative de réservation, modification, annulation ou clôture fictive sur DEV partagé. Les recettes avec écritures sont exécutées par les tests locaux/CI ou dans un futur établissement de bac à sable réellement séparé.

## Désactivation et rotation

Fermer les nouvelles demandes dans Gestion conserve les liens de gestion existants. En incident, un administrateur peut mettre `enabled:false` dans le seul secret Vault RM015 (effet après au plus 30 secondes), ou utiliser `RM015_ENABLED=false` dans les secrets Edge pour une coupure immédiate. Ne jamais copier ce secret dans Git/Render statique ni l’afficher dans un terminal partagé. Pour une rotation AES, ajouter une nouvelle version et changer activeKey ; conserver les anciennes clés tant que des liens en dépendent. Ne pas supprimer la migration ni les données pour revenir à un ancien frontend.


## Correctif de la recette Render

La recette en ligne a repéré un détour dans le lien de repli : sans slug, la démonstration demandait encore de choisir un restaurant. Les deux liens du parcours connecté ciblent désormais explicitement l’établissement de démonstration existant. Ce choix concerne uniquement le bac à sable local, pas la configuration multi-établissements du serveur. Le script est versionné pour renouveler son cache. Un scénario Playwright supplémentaire vérifie qu’un restaurant fermé propose ce repli, puis ouvre directement le nombre de personnes, sans réservation en base.

Après ce correctif : **14 scénarios connectés et 28 audits axe passent** sur PostgreSQL éphémère, ainsi que 178 contrôles syntaxiques et le build DEV. Preuve : `preuves/rm0152-activation-20261119/isolated-browser-results-after-links.json`.
