# RM-014 — Livraison ciblée V3 puis MAIN (16/11/2026)

Le propriétaire a validé Render DEV, y compris le correctif de navigation, et demandé : « C’est parfait on valide on déploie sur V3 et main ». Source validée : code `7863f13`, DEV `12ce881`, Render `dep-dbtj12ei0phs73dgbk10` LIVE, version `2026.11.16-rm014.1`.

## Contenu et séparation

Treize fichiers applicatifs : centre/cloche, projection des notifications, source d’événements existante, lecture/report, historique des nouveautés, actualisation protégée, navigation, icônes et PWA. Aucune fusion globale de DEV. Les différences `v3-connected-auth.js` et `service-v3-reservations.js` se limitent au contexte des notifications et à l’exposition de l’état de sauvegarde ; les modules de connexion restent ceux de production.

Canal `main` dans l’entrée et le manifeste. L’historique de production contient la livraison actuelle complète RM-014.1 et la version RM-013-A réellement publiée ; la version exploratoire RM-014 exclusivement DEV n’est pas annoncée comme publication antérieure en production. Les changements décrivent les fonctions effectivement livrées.

Le cache `restomanager-shell-20261116-prod-rm014.1` utilise le scope effectif. Son précache de 71 ressources exclut `restomanager-env.js`, absent de production, et chaque ressource existe dans le paquet. Les mises à jour restent volontaires, avec garde RM-011-A et refus de l’activation si une autre fenêtre contient une saisie/opération ou ne répond pas. Aucune fenêtre n’est rechargée de force.

Les deux modules Supabase PROD, `creator-auth.js`, `login.html` et le lockfile sont identiques à leurs bases. La dépendance npm Supabase reste 2.57.0. Aucune migration, RLS, RPC, configuration de restaurant ou donnée n’est copiée/modifiée ; aucun message, réservation ou clôture d’essai distant.

## Tests et protection

Les tests d’interface existants sont conservés et les trois suites RM-014 ajoutées. Les fixtures des canaux/cache acceptent les deux environnements ; les assertions sur le mauvais canal, les états, les vrais contenus d’historique et les brouillons restent actives. Les captures avant sont prises depuis la base de la PR réelle, puis les captures après depuis le candidat exact.

Contrôles requis avant fusion : syntaxe, tests Node, deux rôles aux sept largeurs, carte/pied/Gestion/allers-retours, 24 groupes de cycle de vie, 12 groupes PWA avec vrai worker et deux fenêtres, régressions de Gestion/Assistance et autres workflows propres à V3/MAIN. Les frontières de données sont en mémoire ou dans des piles jetables ; aucun accès aux données PROD.

Un test d’intégrité supplémentaire vérifie les empreintes protégées, la concordance canal/version et les dépendances du précache. [Manifeste de livraison](RM014_RELEASE_MANIFEST_20261116.json).

## Sauvegardes et ordre

- V3 avant livraison : `e5e98ca879628cf6efa8ed0e4542f2a97e3bda1f`, sauvegarde `backup/rm014-v3-before-20261116`.
- MAIN avant livraison : `a8915f9d04e51914d25280e910c3d60b4a027fd2`, sauvegarde `backup/rm014-main-before-20261116`.
- Branches filles séparées pour les deux cibles. Tests avant fusion ; V3 d’abord, MAIN ensuite. Contrôler GitHub Pages réellement servi, manifeste et fichiers sans cache obsolète.

Les résultats exacts et références de CI/publication sont consignés dans les PR de livraison et dans le registre officiel DEV. Les captures DEV et le [rapport du correctif validé](https://github.com/DylanL-Dev/RestoManager/blob/feature/v3-supabase-full-clone/docs/audits/RM014_NEWS_NAVIGATION_20261116.md) restent consultables. La publication technique ne vaut pas confirmation utilisateur de l’affichage sur tous les appareils physiques.


## Validation locale du paquet de production

Syntaxe : 135 fichiers sans erreur ; tests Node : 184 réussis ; notifications : 14 combinaisons ; cycle de vie : 24 groupes ; vrai service worker/deux fenêtres : 12 groupes. Exécution avec les dépendances verrouillées de production (SDK npm 2.57.0, Playwright 1.56.1), données en mémoire et réseau externe bloqué. Les deux branches candidates portent le même arbre de fichiers ; les contrôles GitHub de chaque cible restent requis avant fusion.
