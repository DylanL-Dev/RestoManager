# RestoManager

Application web de réservation et de suivi du service en restaurant. La V3 d'intégration utilise **Supabase** pour partager les réservations, les salles, les tables et les états entre les postes Restaurant et Réception.

## Application actuelle

- **Intégration V3 Supabase** : [ouvrir l'application](https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html) — `v3-connected.html`.
- **Version officielle au restaurant** : branche `feature/refonte-service-responsive-v3` ; ne pas modifier dans les travaux d'intégration.
- **Branche de développement de référence** : `feature/v3-supabase-full-clone`.
- Les pages `index.html` et `service-v3.html` redirigent vers `v3-connected.html` sur cette branche.

## Fonctionnalités conservées

- Réservations (clients hôtel et extérieurs), recherche et notes/allergies.
- Suivi des tables : libres, réservées, attendues, installées et libérées.
- Gestion des salles et des tables (numéro, capacité, disponibilité), **sans ancien éditeur graphique 2D/3D ni catalogue de mobilier**.
- Fusions de tables, choix intelligents, passages, indicateurs d'affluence.
- Rôles Réception et Restaurant, synchronisation Supabase, contrôle de disponibilité avant validation.
- Historique, rapports et clôture de service.

La gestion opérationnelle des tables dépend de `service-v3-table-store.js`, `service-v3-table-admin.js` et `reservation-engine.js`. Le fichier `service-v3-table-store.js` conserve une **lecture de migration** des anciennes données stockées localement : ce mécanisme de compatibilité ne doit pas être supprimé, même si l'ancien éditeur graphique n'existe plus.

## Développement et tests

Prérequis : Node.js 22 ou plus et Python 3 pour un serveur HTTP local.

```sh
npm ci
npm test
npm run serve
```

Ouvrir `http://localhost:8000/v3-connected.html`. La connexion et les fonctionnalités partagées nécessitent un compte autorisé et la disponibilité du projet Supabase.

Les tests Node ciblent les règles métier, les réservations, les suggestions de tables et la synchronisation. La suppression des anciens tests du mobilier, de Three.js et de l'éditeur graphique ne remplace pas les tests navigateur des parcours V3 : ceux-ci restent à compléter.

## Protection des données et mises en production

- Ne jamais modifier la base Supabase partagée dans une simple opération de nettoyage frontend.
- Contrôler les migrations, les politiques RLS et les autorisations des fonctions RPC avant toute nouvelle fonctionnalité SQL.
- Ne pas fusionner la branche d'intégration vers la version officielle sans validation terrain.
- L'intégration de nouvelles fonctionnalités multirestaurants doit prévoir des réglages propres à chaque établissement et des tests avec données isolées.

## Retrait de l'ancien éditeur de salle

Le nettoyage 2D/3D supprime les scripts et dépendances historiques (Three.js, éditeur graphique et mobilier), leurs captures et leurs tests obsolètes. Il **ne supprime ni les salles et tables V3, ni les associations aux réservations, ni la compatibilité de migration des données**.

Les anciennes implémentations restent consultables dans l'historique Git et les branches historiques ; elles ne sont pas chargées par la V3 Supabase.
