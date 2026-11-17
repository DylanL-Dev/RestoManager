# RM-016.1 — Didacticiel et bouton Nouveautés, livraison V3 puis MAIN

Le propriétaire valide RM-016 sur le clone Render : « Ok c’est parfait […] une fois réglé […] tout sur main et v3 ». Le correctif demandé concerne le bouton Voir les nouveautés de Gestion. La promotion des deux branches est autorisée ; aucune modification Supabase n’est nécessaire.

## Résultat

Deux niveaux, guides des vrais écrans par métier, aide recherchable, progression par identité/parcours/version et trois exercices dans une iframe isolée sans réseau. Les règles Restaurant/Réception et les protections de saisie sont conservées. RM-012 dépend de sa capacité serveur ; RM-015 reste masquée.

Le bouton Voir les nouveautés avait une classe stylée uniquement à l’intérieur de Salles. Une classe propre lui donne un fond vert, des arrondis, une icône Lucide, une hauteur tactile de 48 px, une largeur mobile adaptée et un focus visible clair/sombre. L’ouverture de Quoi de neuf ? utilise le même comportement existant.

[Rapport pédagogique, limites et 36 captures comparatives](../audits/RM016_LEARNING_20261117.md) ; [conception et droits](../audits/RM016_LEARNING_DESIGN_20261117.md). Les artefacts du workflow RM-016 ajoutent les captures du bouton sur mobile, tablette et PC, pour les deux rôles.

## Livraison ciblée et conservation de la production

Source RM-016 validée : DEV `4ca84fb`, candidat `8f560e3`, huit workflows réussis, PR #180 et Render LIVE. Correction et autorisation : PR #181. Aucune fusion globale de DEV.

Départs : V3 `219256a27d47ed9dd46e4c8cdab98609b25852a5`, MAIN `76e3884c1a096acc2effd80555ca7d4884146730`. Sauvegardes distantes `backup/rm016-v3-before-20261117` et `backup/rm016-main-before-20261117`. Branches `release/rm016-v3` et `release/rm016-main`.

Canal main, version **2026.11.17-rm016.1**, une annonce de production couvrant la formation et le correctif ; historique des vraies publications conservé. La version DEV RM-016 n’est pas inventée comme une ancienne publication de production. Cache distinct production, ajout des deux modules du didacticiel, aucune configuration DEV embarquée.

Connexions, authentification, navigation protégée, dépendances npm et lockfile de production préservés. Les modules authentifiés ne changent que leur import versionné du didacticiel/moteur de maintien. [Manifeste et empreintes](RM016_RELEASE_MANIFEST_20261117.json). Aucune migration, aucune écriture Supabase, aucune réservation/clôture/message fictif dans une base réelle.

## Validation

Le candidat production a passé localement la syntaxe (148 fichiers) et les 207 tests Node. Le workflow RM-016 vérifie 65 groupes Playwright aux largeurs 360/390/430/768/1024/1440/1920, pour Restaurant et Réception : vrais sélecteurs/libellés, clavier, thèmes, progression, erreurs, absence de mutations, protection des saisies, isolement des exercices et bouton Nouveautés réellement stylé et ouvrable au clavier.

Les suites complètes de chaque branche doivent réussir avant fusion ; les liens et résultats du candidat exact sont consignés dans les PR de livraison. Ordre : intégration du correctif DEV et clone Render, V3, puis MAIN, puis vérification du déploiement GitHub Pages et des ressources publiques. Un statut CI vert n’est pas à lui seul une preuve de publication.

## Vérification utilisateur

Ouvrir Aide → Mes premiers pas ou M’entraîner. Dans Gestion → Quoi de neuf ?, vérifier le bouton vert arrondi et l’ouverture de l’historique. Si une mise à jour est proposée, terminer d’abord la saisie avant de l’accepter. Les exemples fictifs restent exclusivement dans les exercices isolés.

Le propriétaire a validé le clone ; aucune observation de nouveaux employés n’est prétendue. La progression demeure locale à l’appareil. Le registre de guides est prévu pour être enrichi lors des prochaines évolutions importantes, avec contrôle des rôles, disponibilité et versions de parcours.
