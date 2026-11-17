# RM-014.2 — Glissement publié sur V3 puis MAIN

**Publication terminée le 17/11/2026.** [Ouvrir l’application](https://dylanl-dev.github.io/RestoManager/v3-connected.html?release=rm014.2). Version `2026.11.16-rm014.2`, canal `main`.

L’utilisateur a explicitement demandé « Ok mes sur main est v3 », après présentation de la version Render et des six CI DEV réussies. Cette autorisation est consignée par #169 ; elle ne prétend pas à une recette physique détaillée des appareils du restaurant.

## Résultat

- Glissement à gauche ou à droite pour retirer une notification, avec possibilité d’annuler. Bouton Retirer pour PC, clavier et accessibilité.
- Préférence conservée sur cet appareil, isolée par compte/établissement/rôle ; ses autres onglets se mettent à jour. Aucune modification de réservation, notification serveur ou lecture partagée.
- Les nouvelles modifications d’une réservation réapparaissent. Les alertes de connexion et mises à jour restent accessibles ; Quoi de neuf ? conserve son historique.
- Le défilement vertical, les autres actions, les brouillons et les fonctions existantes restent protégés. Un échec du stockage garde la notification visible avec une explication.

## Livraison contrôlée

| Cible | PR | Candidat testé | Fusion |
| --- | --- | --- | --- |
| V3, en premier | [#170](https://github.com/DylanL-Dev/RestoManager/pull/170) | `321f3dfcd1fb2711c3d3cf516a3ae1b6227208b9` | `b8f7a397fd35541e13d222421e43b0025ba13ead` |
| MAIN, ensuite | [#171](https://github.com/DylanL-Dev/RestoManager/pull/171) | `413c9355aff7379f4800fea111325fdcdd8efb49` | `a74e7ed9cab740b215e27946d75da35181f4b0e2` |

Les deux cibles et les deux candidats ont l’arbre identique `c9963f3c4809527b4d393b61959141f1f25f3de6`. Les branches de livraison partent de chaque cible ; aucune fusion globale de DEV. Source du complément : DEV `b6e6603`, code `bfbc5bc`, tests `b590cc6`, PR #167, Render `dep-dbtnn3mk1f9s7397811g`.

Six fichiers applicatifs modifiés : modèle, styles/rendu des notifications, HTML versionné, manifeste et clé PWA. Canal et historique de production conservés, précache 71 fichiers. Les modules de connexion PROD, `creator-auth.js`, `login.html`, `v3-connected-auth.js` et lockfile ont conservé leurs empreintes, y compris les ressources publiques avant/après. SDK npm 2.57.0 et Playwright 1.56.1 inchangés. Aucune migration, changement de droits, configuration ou donnée Supabase ; aucune réservation, clôture ou message fictif réel.

Sauvegardes : `backup/rm0142-v3-before-20261117` (`c5ef487`) et `backup/rm0142-main-before-20261117` (`f17e6ea`). [Manifeste du paquet production](https://github.com/DylanL-Dev/RestoManager/blob/main/docs/releases/RM0142_RELEASE_MANIFEST_20261117.json).

## Tests et captures

Le paquet réellement destiné à la production a réussi : 136 fichiers de syntaxe, 188 tests Node, 14 combinaisons de glissement, 14 de régression du centre, 24 groupes de cycle de vie et 12 groupes PWA. Deux rôles et sept largeurs de 360 à 1920 px ; gestes tactiles Chromium réels, souris/clavier, annulation, rechargement, nouveaux événements, panne de stockage et isolation. Les scénarios utilisent une frontière en mémoire ou un PostgreSQL jetable, sans trafic vers les bases hébergées.

| Cible | Workflows tous réussis |
| --- | --- |
| V3, 3/3 | [Publication/intégrité et unités](https://github.com/DylanL-Dev/RestoManager/actions/runs/44015885174), [Gestion/Assistance](https://github.com/DylanL-Dev/RestoManager/actions/runs/44015885246), [Notifications/gestes/PWA](https://github.com/DylanL-Dev/RestoManager/actions/runs/44015885207) |
| MAIN, 6/6 | [Publication/intégrité et unités](https://github.com/DylanL-Dev/RestoManager/actions/runs/44015900117), [Gestion/Assistance](https://github.com/DylanL-Dev/RestoManager/actions/runs/44015900113), [Notifications/gestes/PWA](https://github.com/DylanL-Dev/RestoManager/actions/runs/44015900134), [Salles](https://github.com/DylanL-Dev/RestoManager/actions/runs/44015900112), [Navigateurs](https://github.com/DylanL-Dev/RestoManager/actions/runs/44015900098), [Recette étendue / PostgreSQL isolé](https://github.com/DylanL-Dev/RestoManager/actions/runs/44015900232) |

Captures du paquet production après retrait et confirmation Annuler : [mobile 390 px](https://github.com/DylanL-Dev/RestoManager/blob/main/docs/releases/preuves/rm0142/removed-fb_admin-390.png), [tablette 768 px](https://github.com/DylanL-Dev/RestoManager/blob/main/docs/releases/preuves/rm0142/removed-fb_admin-768.png), [PC 1440 px](https://github.com/DylanL-Dev/RestoManager/blob/main/docs/releases/preuves/rm0142/removed-fb_admin-1440.png). La comparaison avant/glissement/après figure dans les artefacts `rm014-notifications-responsive-and-pwa` des workflows ci-dessus, avec un avant issu de la branche cible réelle. [Comparaison et conception initiales du complément](RM014_DISMISS_20261116.md).

## Publication publique

[GitHub Pages 44016361568](https://github.com/DylanL-Dev/RestoManager/actions/runs/44016361568) : **completed / success** sur la fusion MAIN `a74e7ed`. Les 22 vérifications HTTP sont conformes aux empreintes du paquet testé : 18 fichiers distincts, trois URL d’assets versionnées et le lien d’entrée `release=rm014.2`. L’entrée canonique et le manifeste confirment la version et le canal ; l’historique n’invente aucune publication DEV et conserve l’annonce de production RM-014.1.

[Preuve machine complète : CI, Pages et empreintes avant/après](preuves/rm0142-publication-20261117.json).

La publication technique est vérifiée ; aucun parcours robot authentifié n’a été exécuté sur les données réelles. La confirmation utilisateur sur la version publique reste distincte et n’a pas été inventée. Aucun effacement de cache global ni actualisation forcée d’une saisie n’a été ajouté : la mise à jour conserve les protections PWA validées.
