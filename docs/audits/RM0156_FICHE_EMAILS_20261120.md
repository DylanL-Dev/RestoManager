# RM-015.6 — Fiche publique du restaurant et emails préparés

Suite autorisée au retour utilisateur « Ok tu fait ça » : compléter la présentation publique du restaurant, préparer les emails sans les activer, et valider les parcours. Référence : [RM-015 / issue #173](https://github.com/DylanL-Dev/RestoManager/issues/173). [Pull Request #191 vers DEV](https://github.com/DylanL-Dev/RestoManager/pull/191).

Branche `feature/rm015-public-restaurant-profile`, issue de DEV `9e2ade15ef32c6cc60228b2b57d0ca81ea27ca41`. Sauvegarde distante `backup/rm015-profile-before-20261120` sur ce même commit, avant modification. MAIN, V3 et Supabase PROD inchangées.

## Résultat fonctionnel

| Avant | Après |
| --- | --- |
| Nom interne affiché publiquement, sans présentation éditoriale | Nom public facultatif, sans renommer le compte ni changer le lien/QR |
| Texte générique uniquement | Présentation facultative de la cuisine et du restaurant, retours à la ligne conservés |
| Aucune coordonnée pratique sur la page client | Adresse, téléphone cliquable et lien d’itinéraire, uniquement si renseignés |
| Horaires visibles seulement au choix d’une date | Dépliant hebdomadaire « Horaires de réservation », issu de la configuration de service |
| Emails préparés sommaires | Récapitulatif lisible, état exact, lien personnel et coordonnées publiques ; toujours aucun envoi |

Gestion → Réservations en ligne → Réglages du portail → Fiche du restaurant. La carte reprend les dépliants, couleurs, champs et icônes Lucide existants. Les quatre champs sont facultatifs : nom public (180 caractères), présentation (1200), adresse (300), téléphone (40). L’enregistrement suit la version et la confirmation actuelles du formulaire ; une erreur conserve la saisie. Le téléphone invalide identifie le champ à corriger, et le focus s’y déplace. Les explications de champs sont associées par `aria-describedby`, les libellés par `aria-labelledby`.

Aucune information du restaurant de démonstration n’est codée dans cette architecture. Une valeur vide ne fabrique ni adresse ni téléphone. Le nom public vide reprend le nom actuel de l’établissement. Le changement du nom public ne modifie pas son URL enregistrée ni les liens des réservations existantes.

Les coordonnées sont du texte, jamais du HTML injecté. Le lien d’appel ne peut utiliser que `tel:` avec un numéro validé ; l’écriture internationale avec `(0)` est adaptée pour l’appel. Le lien d’itinéraire encode l’adresse et ouvre Google Maps uniquement à la demande, sans carte intégrée ni requête préalable.

## Horaires réels, sans ambiguïté

Le serveur lit `restaurant_hours.weekly_schedule`, également lu par le calcul des créneaux RM-015. Il publie seulement les sept jours, les services ouverts/fermés et leurs premières/dernières arrivées, en heure de Paris. La colonne finale est la dernière réservation autorisée, pas l’heure de fermeture du restaurant. L’interface le précise.

Aucun horaire n’est modifié par cette fonctionnalité. Aucun plafond, pourcentage d’arrivée, détail de table ou réservation n’est exposé. Si le planning hebdomadaire est absent ou invalide, aucune plage n’est inventée : le dépliant public est masqué. Les fermetures exceptionnelles et disponibilités d’une date restent vérifiées par le moteur existant lors du choix et de l’enregistrement.

Un rafraîchissement des horaires met à jour l’aperçu en lecture seule dans Gestion sans remplacer une saisie éditoriale en cours. Le rôle Réception ne voit pas ces réglages et le serveur refuse ses modifications. Deux utilisateurs qui enregistrent la même version ne peuvent pas s’écraser silencieusement.

## Emails préparés, non activés

Les messages de confirmation, demande en attente, modification et annulation présentent un récapitulatif et un seul bouton principal, « Consulter ma réservation ». Ils conservent une version texte. Les demandes de groupe ne disent pas qu’elles sont confirmées. Une modification refusée ou expirée indique explicitement que la réservation initiale est conservée. Les cas de remplacement par le Restaurant gardent le contrat existant.

Le lien personnel demeure dans le fragment de l’URL. Le domaine doit être HTTPS, sans identifiants, recherche ni ancien fragment. Le jeton, le nom public de l’URL, la date, l’heure, le nombre de personnes et les états sont vérifiés avant construction. Les textes éditoriaux sont échappés et les retours à la ligne sont retirés du sujet. Aucune chambre, table attribuée, note interne ou allergie n’apparaît. Aucune image distante, police externe, inscription marketing ou balise de suivi n’est ajoutée.

L’envoi reste désactivé. Aucun worker n’est déployé, aucun fournisseur, expéditeur ou secret n’est créé. Un fournisseur manquant ne déclenche pas d’appel réseau. L’activation future demandera de choisir le prestataire, valider le domaine et l’adresse d’expédition, examiner les durées et données transmises, puis traiter explicitement la file existante avant mise en service. Les aperçus HTML de recette utilisent uniquement `.test` et un faux jeton.

## Migration préparée et impacts

`supabase/migrations/20261120074140_rm015_public_restaurant_profile.sql`, créée avec la CLI Supabase 2.81.3. Appliquée et réappliquée sur PostgreSQL 17 éphémère, réseau désactivé. Aucun changement appliqué à Supabase DEV partagé ou PROD.

- Ajout de `private.rm015_settings.public_profile`, objet JSON privé vide par défaut, avec limite de taille, clés autorisées, types, longueurs et téléphone validés côté serveur.
- Deux fonctions privées sous le rôle technique restreint existant : validation de cet objet et projection des horaires. Aucune exécution accordée à `anon`, `authenticated` ou `service_role` sur ces fonctions privées.
- Extension des RPC staff/publique/mail existantes : projection minimale, contrôle du rôle et de l’établissement, version et idempotence conservés. Les anciens formulaires qui omettent le profil conservent les informations enregistrées.
- Audit `public_profile_change` avec acteur, date réelle, ancien et nouvel objet. Aucune migration des contenus clients, réservations, tables ou horaires ; aucune modification des photos ou politiques Storage.
- Temps d’attente de verrou borné à 5 s, statement à 30 s. Les grants temporaires de création du rôle technique sont retirés dans la transaction. Aucun privilège public supplémentaire ni clé nouvelle.
- L’Edge Function DEV `rm015-public` devra être mise à jour après application autorisée de la migration : son filtre de réponse ajoute uniquement `publicProfile` et `openingHours`. Vault et les paramètres emails restent inchangés.

La carte de Gestion n’apparaît qu’avec le contrat serveur `profileEnabled`. Le code est compatible avec le serveur précédent, mais il ne faut pas annoncer une fonctionnalité disponible sur Render avant migration et vérification. Pour éviter un nouveau décalage entre interface et activation, l’ensemble reste sur la branche de la PR jusqu’à accord d’activation DEV.

## Validation

- 302 cas unitaires réussis, y compris le retour du module statique depuis le cache hors connexion et l’exclusion des pages publiques de ce cache. `npm test` : 63 fichiers réussis.
- 192 fichiers JavaScript contrôlés sans erreur de syntaxe. Builds public démo/connecté : 8 et 15 fichiers autorisés. Les deux entrypoints Edge passent le contrôle Deno 2.5.6.
- 9 groupes SQL spécifiques : migration additive appliquée deux fois, validation des données et espaces de téléphone, rôles/établissements, version/idempotence, deux écritures concurrentes, audit, projection publique, horaires réels et conservation des données.
- Campagne navigateur complète : **50 scénarios réussis, 97 audits axe sans violation des règles exécutées**, aux largeurs 360, 390, 430, 768, 1024, 1440 et 1920. Aucun débordement horizontal détecté ; zéro requête externe et zéro opération de fixture encore en cours à la fin.
- Les scénarios couvrent les parcours de réservation, perte de réponse/reprise, expiration, modifications de groupe et refus, Restaurant/Réception, QR code décodé après téléchargement, formulaires/conditions, import/retrait de photo, nouvelle fiche, horaires actualisés sans perte de saisie, texte hostile non interprété et quatre modèles d’email sur trois formats.

Les 97 audits correspondent aux écrans et périmètres indiqués dans [results.json](preuves/rm0156-20261120/results.json), pas à une certification d’accessibilité exhaustive. Le premier test ciblé a révélé qu’un texte d’aide était inclus dans le nom accessible d’un champ ; l’association explicite du libellé et de la description corrige ce problème. Une revue a aussi trouvé le module `.mjs` précaché mais exclu du secours réseau : le Service Worker le prend désormais en charge, sans modifier l’exclusion du portail public. Ces corrections disposent de validations et les premières tentatives ne sont pas comptées comme campagne finale.

La campagne historique SQL et les validations CI finales sont ajoutées à la PR après leur terme.

## Captures de recette isolée

| Format | Gestion — fiche | Page client | Email confirmé | Demande en attente |
| --- | --- | --- | --- | --- |
| Mobile 390 | [Voir](preuves/rm0156-20261120/restaurant-profile-390.png) | [Voir](preuves/rm0156-20261120/public-profile-390.png) | [Voir](preuves/rm0156-20261120/email-confirmed-390.png) | [Voir](preuves/rm0156-20261120/email-pending-390.png) |
| Tablette 768 | [Voir](preuves/rm0156-20261120/restaurant-profile-768.png) | [Voir](preuves/rm0156-20261120/public-profile-768.png) | [Voir](preuves/rm0156-20261120/email-confirmed-768.png) | [Voir](preuves/rm0156-20261120/email-pending-768.png) |
| PC 1440 | [Voir](preuves/rm0156-20261120/restaurant-profile-1440.png) | [Voir](preuves/rm0156-20261120/public-profile-1440.png) | [Voir](preuves/rm0156-20261120/email-confirmed-1440.png) | [Voir](preuves/rm0156-20261120/email-pending-1440.png) |

Les noms, adresses, numéros et liens localhost/`.test` sont exclusivement fictifs. Ne pas les distribuer. Les captures publiques montrent un planning hebdomadaire de fixture modifié volontairement pour prouver qu’il suit la source ; ce n’est pas le planning d’un restaurant réel. Les champs de date natifs peuvent suivre la langue du navigateur de recette.

Les aperçus HTML sont également conservés pour [confirmation](preuves/rm0156-20261120/email-confirmed.html), [attente](preuves/rm0156-20261120/email-pending.html), [modification](preuves/rm0156-20261120/email-modified.html) et [annulation](preuves/rm0156-20261120/email-cancelled.html). Ils ne déclenchent aucun envoi.

## Principaux fichiers modifiés

| Domaine | Fichiers |
| --- | --- |
| Données et sécurité | Nouvelle migration, filtre `_shared/rm015-gateway.mjs`, tests PostgreSQL et support éphémère |
| Gestion | `service-v3-portal-profile.js`, formulaire/publication, CSS et chargement dans `v3-connected.html` |
| Page client | `public-restaurant-profile.mjs`, `reservation/live.html`, `live.mjs`, `portal.css` |
| Emails préparés | `_shared/rm015-mail.mjs`, tests de contenus et aperçus isolés |
| Livraison et régressions | Build allowlist, `sw.js`, `app-release.json`, tests unitaires/navigateur et workflow RM-015 |

## Recette Render DEV après activation autorisée

1. Ouvrir [Render DEV](https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html), enregistrer toute saisie puis accepter la mise à jour.
2. Restaurant → Gestion → Réservations en ligne → Réglages du portail → Fiche du restaurant.
3. Renseigner uniquement les véritables informations que l’établissement souhaite publier et enregistrer. Ne pas modifier le nom du lien pour vérifier le nom public. Ouvrir le lien public déjà enregistré.
4. Contrôler nom, présentation, appel, itinéraire et horaires de réservation sur téléphone et ordinateur. Comparer les plages et jours fermés aux paramètres du service. Aucune réservation d’essai n’est nécessaire.
5. Vider un champ facultatif et enregistrer seulement si ce retrait est réellement souhaité : sa donnée disparaît publiquement. Un nom public vide reprend le nom interne sans changer le lien.
6. Avec un compte Réception, vérifier l’absence des réglages. Les opérations autorisées sur les réservations existantes restent inchangées.
7. Les emails restent désactivés : vérifier leurs captures et aperçus locaux, sans tenter d’envoi ni créer de réservation fictive.

## Limites et étape suivante

Les contrôles automatisés ne remplacent pas des essais avec de vrais employés ou des clients. Aucun essai de ce type n’est revendiqué. Les rendus d’emails sont testés dans Chromium ; la compatibilité Outlook/Gmail/Apple Mail et la délivrabilité devront être validées lors du choix du prestataire. Aucun email réel n’a été envoyé.

Le stockage de photo hébergé n’est pas sollicité par ces nouveaux scénarios : les régressions photo utilisent un transport contrôlé et les vraies politiques SQL d’une base isolée. Aucun profil, utilisateur, réservation ou clôture fictive n’a été créé dans une base partagée.

Accord d’activation DEV requis par [#173 §9.C](https://github.com/DylanL-Dev/RestoManager/issues/173) : « aucun changement PROD ni Supabase DEV partagé sans accord explicite ». L’accord demandé porte seulement sur cette migration additive et le contrat API DEV ; aucune promotion MAIN/V3 ni activation email.
