# RM-015 — Raccordement de Turnstile au clone DEV

Date : 21 novembre 2026. Travail exclusivement issu de DEV ; aucune publication MAIN/V3 ni modification Supabase PROD.

## Résultat préparé

Le widget Cloudflare « RestoManager » a été créé par l'utilisateur en mode Managed, sans pré-clearance, pour les noms d'hôte `dylanl-dev.github.io` et `restomanager-v3-supabase-integration.onrender.com`. Un nom d'hôte se renseigne sans `https://` ni chemin.

La clé **publique** est ajoutée au runtime du portail DEV et à la configuration du paquet officiel préparé. La clé **secrète** a été enregistrée directement par l'utilisateur dans les secrets du projet Supabase DEV, sous `RM015_TURNSTILE_SECRET`. Elle n'a pas été transmise dans la conversation, lue par l'assistant ou enregistrée dans le dépôt. Le paquet officiel conserve `activated=false` : connaître sa clé publique ne l'ouvre pas.

La branche `feature/rm015-turnstile-configuration` part du commit DEV `353359f604eb036b4600d494253195b4b9695799`. Une sauvegarde distante de cette base précède les modifications : `backup/rm01510-before-turnstile-20261121`.

## Configuration et protections

- Le constructeur et le navigateur valident le format de la clé publique DEV. Les champs de secrets restent refusés dans la configuration publiable. La liaison DEV/PROD déjà préparée est conservée.
- La vérification progressive existante s'affiche désormais sur DEV lorsque le serveur la demande. Les limites, les identifiants de maintien et les protections contre les doublons sont conservés.
- Le texte de confidentialité ajoute, quand Turnstile est configuré, une explication de son rôle et des informations techniques qu'il peut traiter, avec un lien vers la politique Cloudflare. Les coordonnées et notices personnalisées du restaurant ne sont pas remplacées.
- Aucun horaire, plafond de couverts, statut de réservation, table ou droit salarié n'est modifié. Les emails restent désactivés. La version applicative RM-015.10 est conservée pour cette configuration.

## Contrôle humain sans réservation

L'écran de contrôle est [prévu ici sur DEV](https://restomanager-v3-supabase-integration.onrender.com/tests/manual/rm015-turnstile.html), après la livraison de cette branche. Il n'est lié à aucun menu client et n'est pas inclus dans le paquet officiel : celui-ci exclut tout le dossier `tests/`.

Le bouton « Vérifier la protection » ouvre le widget, puis demande une confirmation au serveur. Un succès visuel du widget seul ne suffit pas pour annoncer une validation.

Le serveur accepte l'action `verify-widget` **uniquement lorsque son environnement est DEV**, fixé par le code d'entrée déployé. Un champ `environment` dans la requête ne peut pas modifier ce choix. En mode production, cette action est refusée avant tout RPC. L'écran refuse également l'hébergement officiel.

Cette action ne peut appeler que le compteur anti-abus `rm015_rate_v1`, dans un compartiment distinct `verify`, limité à 12 appels par 15 minutes et par empreinte réseau. Elle appelle ensuite Siteverify avec la clé secrète du serveur, l'action attendue `reservation` et le nom d'hôte autorisé. Elle ne transmet aucune commande au RPC métier `rm015_gateway_v1` et ne crée ni réservation, ni demande client, ni maintien de table, ni email. Le compteur technique est la seule écriture en base associée au contrôle.

Le jeton du fournisseur reste éphémère en mémoire et n'est ni affiché, ni journalisé, ni enregistré dans le stockage du navigateur. Une annulation, un refus du serveur ou une indisponibilité de Cloudflare ne produit pas de message de réussite.

## Vérifications locales

| Contrôle | Résultat |
| --- | --- |
| Tests unitaires et contrats existants | 67 fichiers réussis |
| Syntaxe JavaScript et modules | 211 fichiers, aucune erreur |
| Construction du portail connecté | 20 fichiers statiques, API DEV uniquement |
| Paquet officiel préparé | 137 empreintes, portail fermé, emails désactivés |
| Interfaces de préparation officielle | 20 scénarios, 22 audits axe ; 360, 390, 430, 768, 1024, 1440 et 1920 px |
| Écran de contrôle DEV | 7 scénarios, 7 audits axe ; 390, 768 et 1440 px |
| Contrat serveur de contrôle | Refus en production et depuis une origine étrangère ; refus d'un jeton invalide ; confirmation explicite d'un jeton valide ; aucun appel RPC métier |

Les widgets et réponses serveur de ces tests d'interface sont des fixtures isolées. Aucun test automatique local de ce tableau ne crée de données dans une base partagée. Les suites GitHub complètes, dont les 15 scénarios de synchronisation Auth/REST/Realtime isolés, sont suivies dans la Pull Request.

Le bouton du nouvel écran change d'état sans fondu de couleur : un audit avait détecté une baisse temporaire du contraste lors de sa réactivation. Le correctif reste limité au style de cet outil ; aucune règle d'accessibilité n'est désactivée.

Captures avec fournisseur simulé : [mobile](preuves/rm015-turnstile-20261121/widget-verified-390.png), [tablette](preuves/rm015-turnstile-20261121/widget-verified-768.png), [PC](preuves/rm015-turnstile-20261121/widget-verified-1440.png).

## Limite du contrôle automatisé avec le vrai fournisseur

Des essais sur le domaine Render réel ont atteint le contrôle Cloudflare, mais le navigateur automatisé n'a pas terminé le widget. Aucun clic automatique sur une vérification humaine n'a été tenté. Aucun succès Siteverify réel n'est donc revendiqué à ce stade.

L'environnement d'exécution utilise plusieurs adresses de sortie réseau : deux ont été constatées, sans extraire leurs valeurs, pendant les premières sondes. Cela explique pourquoi quatre requêtes successives n'atteignaient pas immédiatement le seuil progressif par adresse. Le contrôle dédié évite de dépendre de ce seuil et n'utilise aucune opération de réservation pour vérifier le fournisseur.

L'ancienne sonde envoyait uniquement des brouillons explicitement invalides, sans identité d'opération ; le code les rejetait avant le RPC métier. Aucun maintien ni réservation n'a été créé. Les essais sont arrêtés au profit du contrôle humain dédié.

La [preuve de cette limite](preuves/rm015-turnstile-20261121/real-provider-automation-limited.json) est conservée séparément des réussites avec fixtures. Une confirmation depuis le navigateur habituel de l'utilisateur reste nécessaire avant de conclure sur le fonctionnement réel du couple de clés.

## Recette après livraison DEV

1. Ouvrir l'écran de contrôle DEV depuis un navigateur habituel.
2. Toucher ou cliquer sur « Vérifier la protection » et terminer la vérification Cloudflare si elle demande une intervention.
3. Attendre le message « La protection Cloudflare fonctionne. Le serveur a confirmé la vérification. »
4. En cas de refus, conserver le message visible, sans partager de clé secrète ni de jeton. Une limite de tentatives demande d'attendre ; elle ne doit pas être contournée.

Le contrôle ne demande aucune réservation fictive, chambre, nom, email ou coordonnée de client.

## État des autres environnements

La [préparation RM-015.10](RM01510_PREPARATION_PRODUCTION_20261121.md) a été fusionnée dans DEV par la PR #195 et publiée sur Render au commit `353359f604eb036b4600d494253195b4b9695799` : déploiement `dep-dc0o6uek1f9s739oue40`, version `2026.11.21-rm015.10-dev`. 115 ressources servies correspondaient aux sources examinées. Les contrôles réels en lecture ont réussi sur sept largeurs ; la démonstration isolée a été parcourue sur trois formats. L'API DEV a été mise à jour en version 8, puis vérifiée en lecture et sur ses refus CORS/méthode/format, avant cette extension du contrôle.

La présente extension nécessite de livrer le nouveau handler sur DEV. Elle n'ajoute **aucune migration**. Les six migrations officielles préparées restent inchangées et non appliquées à PROD. Ni l'API PROD, ni ses secrets, ni MAIN, ni V3 ne sont modifiés par cette livraison.

Les contrôles consultatifs du clone ont aussi été lus sans modifier le schéma. Ils signalent des éléments déjà présents, indépendants de cette configuration : [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [fonctions SECURITY DEFINER accessibles à authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protection contre les mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [index de clés étrangères](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [index inutilisés](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) et [politiques permissives multiples](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies). Aucun élargissement de droits ni changement d'authentification n'est réalisé pour faire disparaître ces avis.
