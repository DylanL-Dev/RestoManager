# Snapshot de sécurité DEV — audit du 10 novembre 2026

`dev-snapshot-20261110.sql` contient un export **en lecture seule** des définitions des 58 fonctions applicatives, des ACL de tables/colonnes, des 47 politiques RLS et des 24 liaisons de triggers de Supabase DEV `lykoybacslvmhtzftqsf`.

Ce fichier est une fixture de test, **pas une migration**. Ne jamais l'appliquer à un projet hébergé. Il ne contient ni utilisateur, ni réservation, ni mot de passe, ni hash de mot de passe, ni jeton. Les deux comptes et les deux restaurants des tests sont générés localement.

Le schéma de tables/contraintes et les composants Auth sont reconstruits par les runners existants. Le snapshot rejoue ensuite les fonctions, propriétaires, RLS, ACL et triggers DEV ; il supprime d'abord les politiques/triggers locaux concernés afin de ne pas conserver des protections supplémentaires absentes du snapshot. Il ne représente pas une sauvegarde intégrale de la base DEV.

```sh
npm ci
npm run test:audit:dev:postgres
npm run test:audit:dev:supabase
```

Le premier runner crée son propre PostgreSQL sans réseau et n'accepte pas d'URL de base distante. Le second crée Auth, PostgREST et Realtime sur loopback, avec des JWT réels et le SDK 2.119.0 du frontend. Son navigateur refuse les hôtes distants. Le callback SQL pointe seulement sur le conteneur possédé par ce runner.

Dans la suite HTTP, le snapshot est chargé **après** le test de réapplication des migrations : celles-ci ne peuvent ainsi remplacer silencieusement les règles DEV testées ensuite. Les cas négatifs vérifient les réponses de refus et l'absence de changement des réservations/affectations. Installation et libération ont aussi des contrôles positifs Restaurant.

Les deux tests de consultation avant migration précèdent volontairement le replay du snapshot. Les scénarios API et navigateurs suivants sont ceux qui valident les règles DEV capturées.

Le snapshot est daté et immuable pour la preuve historique. Une modification ultérieure des RPC/RLS/ACL/triggers DEV nécessite une nouvelle comparaison ou un nouvel export de test ; les succès de ce snapshot ne certifient pas un futur schéma différent.
