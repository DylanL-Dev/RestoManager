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
