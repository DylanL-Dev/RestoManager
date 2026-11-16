# RM-014 — Centre de notifications RestoManager

Branche de travail `feature/rm014-notification-center`, base DEV `e3a5daa`. Issue [#158](https://github.com/DylanL-Dev/RestoManager/issues/158). **DEV seulement, sans publication V3/MAIN ni écriture en base distante.**

## Lot 1 — Audit et direction retenue

| Source existante | Droits / persistance | Problème et décision |
| --- | --- | --- |
| `service-v3-reminders.js` : retard, départ estimé, pression des tables | Retard/départ Restaurant ; disponibilité deux rôles ; ancien report local global | Ancien panneau petit, recréé chaque minute ; lecture absente ; noms et actions de mutation mêlés. Rappels calculés, identités stables, lecture et report isolés par compte/restaurant ; action principale de navigation protégée. |
| `service-v3-fb-alerts.js` : créations, modifications, annulations Réception | Restaurant `fb_admin`, tables existantes et RLS ; `read_at` serveur | Événements répétés, erreur jamais remise à zéro, pas d’état de chargement, pas de filtre établissement explicite. Conserver les écritures `read_at` et les RLS ; ajouter filtre établissement, états et course de sessions protégée. |
| `service-v3-refresh.js`, `service-v3-screens.js` | RM-011-A avant fermeture du maintien, cache et rechargement | Réutiliser le garde-fou, renforcer les vérifications pendant l’attente et ne jamais recharger un formulaire sale pour une mise à jour. |
| `sw.js` | Cache réseau prioritaire ; ancienne racine `/RestoManager/` fixe | Installation activée automatiquement ; cache différent sur Render et Pages. Racine dérivée du scope, activation explicite protégée, conservation des ressources d’un onglet encore ouvert. |
| RM-012 | Aucun événement publié | API d’enregistrement de source, droits et durée de vie documentés ; exemple uniquement dans le harnais. Aucune règle de clôture ajoutée. |

### Choix UX

Une cloche, un flux ; trois groupes au maximum, pas d’onglets. « À votre attention » avant « Votre service », puis une carte « Nouveautés ». Filtre facultatif « Non lues ». Lecture explicite et action principale unique ; lire un rappel urgent ne le résout pas. Résolution calculée depuis le snapshot autorisé. Le report est limité aux rappels retard/départ, avec accès aux rappels reportés.

Le compteur compte uniquement les identités actives non lues non reportées, jamais les lignes dupliquées. Les événements successifs d’une même réservation sont regroupés en conservant le dernier contexte. Les aperçus ne contiennent pas de notes/allergies. Aucune réservation n’est modifiée depuis la cloche : « Voir la réservation » conduit au parcours existant, avec sa confirmation et ses droits.

Mobile : vrai dialogue plein écran au-dessus de la barre basse. Tablette : tiroir de 480 px. PC : tiroir droit de 460 px, application visible derrière. En-tête et pied fixes, contenu défilant ; cibles 44 px, Échap, focus initial et restitution, Tab contenu par le dialogue natif, réductions d’animations et palette sombre.

### Références consultées le 16/11/2026

- [Apple HIG Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications.md) : pertinence, discrétion, contexte utile, éviter les répétitions. L’identité Apple n’est pas reproduite.
- [Material 3 badges](https://m3.material.io/components/badges/overview) : référence du compteur ; page exigeant JavaScript, pas utilisée comme preuve détaillée consultable.
- [WAI-ARIA APG dialog modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) : dialogue nommé, contenu extérieur inerte, cycle Tab, Échap, restitution du focus.
- [WCAG 2.2 — taille des cibles](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) : minimum 24 px ; choix de 44 px ici pour le service tactile. Contraste, états textuels et focus ne dépendent pas seulement de la couleur.
- Changelog Supabase et documentation JS Filters consultés : aucun changement de SDK ou schéma nécessaire ; les marqueurs existants restent protégés par les RLS, avec filtre explicite de l’établissement.

Prototype réel : [HTML isolé](maquettes/rm014.html), styles partagés avec le futur centre ; données fictives, sans backend. Les captures avant utilisent le vrai frontend DEV de base, le même viewport et les mêmes scénarios isolés que les captures finales.

## Validation finale

En cours ; les résultats, captures et limites seront ajoutés après les cinq lots.


## Lot 2 — Unification du service

Projection pure `service-v3-notification-model.js` : identité, type, source, groupe, priorité, titre, aperçu, date, action, lecture, report, réservation liée et références serveur. Événements regroupés par réservation ; priorité maîtrisée ; rappels recalculés depuis le snapshot. Une table installée la veille reste signalée après minuit. Les créations de réservations déjà terminées/annulées cessent de polluer le service ; les annulations récentes restent consultables.

Le dialogue natif remplace l’ancien petit panneau. Il conserve le focus pendant les rafraîchissements identiques ; une synchronisation ne marque rien comme lu. Le marqueur serveur est conservé pour Réception→Restaurant ; lectures et reports des rappels sont locaux, isolés par établissement, utilisateur et rôle. Les entrées locales expirent après 30 jours ; les événements non lus après 7 jours et lus après 48 h. Les états de chargement/erreur sont explicites ; une erreur de source n’est jamais transformée en « aucune notification ».

Les mutations de réservation ont été retirées du centre au profit d’un lien vers le parcours existant. Les actions de retard et de libération restent disponibles dans leurs écrans métier. La navigation passe par `RestoScreens.request` (et non `show`) pour respecter les brouillons.

## Lot 3 — Versions publiées et mise à jour sûre

`app-release.json` est une source publique versionnée, avec canal explicite `dev` ou `main`, identifiant unique, date, titre, 3–5 changements, impact utilisateur et indication de rechargement. Cette branche porte **dev**. Une future livraison MAIN devra adapter seulement le canal et son historique réellement publié, pas copier la configuration DEV. La page `v3-connected.html` porte la même version et le même canal en métadonnées.

Le client ne propose une mise à jour qu’après deux réponses réseau sans cache : manifeste valide **et** page effectivement publiée portant exactement la même version et le même canal. Le SW contourne explicitement le cache pour ces deux contrôles. Un manifeste candidat seul, une publication incohérente, un canal différent, une panne ou une absence de réseau ne déclenchent aucune fausse annonce. L’historique vérifié reste consultable hors ligne avec une explication ; un retour vers une version antérieure n’est pas présenté comme une nouvelle version. La version courante n’est annoncée que pendant 30 jours ; sa lecture reste isolée par compte/établissement, l’historique reste dans Gestion.

`RestoAppRefresh.request` centralise le bouton historique et « Mettre à jour ». Les deux passent par `RestoScreens.confirmLeaveForRefresh` RM-011-A **avant** de toucher au maintien temporaire. Une mise à jour appelle ce même garde-fou avec `preserveDraft` : aucun choix de jeter la saisie ; elle reste intacte et l’utilisateur peut reprendre puis réessayer. Vérification/récupération/enregistrement de réservation, édition en cours de sauvegarde et formulaire signalé `aria-busy` bloquent le rechargement. L’état est revérifié après les attentes ; une libération de maintien échouée ne recharge plus silencieusement.

Le SW utilise sa racine effective (Render `/`, Pages `/RestoManager/`), précharge l’entrée et ses dépendances locales, ne s’active pas automatiquement sur un onglet existant, ne réclame pas les clients et ne supprime pas leurs caches pendant leur utilisation. Avant l’activation explicite il consulte **toutes** les fenêtres de son scope par MessageChannel : saisie, opération ou fenêtre ancienne qui ne répond pas → mise à jour reportée. Seule la fenêtre demandeuse se recharge ; aucun autre onglet n’est rechargé de force. Les fenêtres d’une ancienne version sans ce protocole devront être fermées avant l’activation. Le rafraîchissement des données du menu compte conserve son propre parcours sans rechargement de l’application.

## Lot 4 — Informations importantes et extension RM-012

Seuls des états réels de synchronisation/consultation et les anomalies actuellement calculées alimentent le canal prioritaire. Ni compteur fictif, ni communication d’exploitation inventée, ni nouvelle règle de clôture. Les données disponibles restent visibles avec une mise en garde lors d’une panne ; l’état disparaît après rétablissement. Le chargement des événements Réception est suivi séparément de la synchronisation des réservations ; un succès efface l’ancienne erreur.

L’API `RestoNotifications.registerSource` et son [contrat détaillé](RM014_SOURCE_CONTRACT.md) préparent RM-012, sans l’activer. Rôles, établissement, identité stable, état résolu et expiration sont filtrés. Le seul exemple de service à régulariser utilisé à l’exécution est dans le harnais fictif. Aucun schéma supplémentaire n’est nécessaire : pas de migration proposée ni appliquée, aucune modification de RLS.
