# RM-OPS-02 — Recette du Mode Coup de feu

Expérience Codex du 26 novembre 2026 sur la base DEV `608fba9`. La tablette du pupitre est prioritaire. Le mode Express est un écran de l’espace Restaurant connecté. Le bouton **Mode complet** rend visibles l’écran et le formulaire précédents avec leurs valeurs.

[Mission #266](https://github.com/DylanL-Dev/RestoManager/issues/266) · [Coordination #247](https://github.com/DylanL-Dev/RestoManager/issues/247) · [Synthèse de la revue #268](https://github.com/DylanL-Dev/RestoManager/issues/268#issuecomment-7180366728)

## Deux sources d’affichage

| Source | Comportement |
| --- | --- |
| Service partagé | Le rôle Restaurant ouvre Express en consultation dans l’environnement DEV. Recherche dans le service courant, élargissement sur demande, vue de salle, synthèse d’affluence et situations à vérifier. Les événements existants de connexion et d’instantané actualisent la vue sans reconstruire la recherche. Si la connexion se coupe, la dernière vue et son heure restent visibles. |
| **Simuler un service** | Le même écran affiche un jeu fictif. Parcours direct depuis la réservation, dossier **À reprendre**, deux suggestions si compatibles, choix d’une autre table, résumé de l’échange et installation. Le passage utilise nombre de couverts, type de client et table constatée. Les opérations restent dans le stockage fictif de l’appareil. |

La reprise d’un accompagnement est locale à l’onglet pour ce candidat. Le jeu d’entraînement peut être partagé entre les onglets d’un même navigateur lorsque Web Locks et le stockage local sont disponibles. Les autres contextes utilisent une simulation en mémoire. La bascule d’affichage garde le brouillon du mode complet dans le DOM. La Réception garde ses écrans habituels.

## Contrat d’intégration

Le mock utilise la forme de l’[aperçu moteur v1](https://github.com/DylanL-Dev/RestoManager/issues/265#issuecomment-7189972432) pour le placement : `ok`, `kind`, `reservationId`, `targetTables`, `changes`, `warnings` et `fingerprint`. Si la table ou l’échange change, le cockpit garde la réservation ouverte et demande un nouveau choix. La simulation sérialise les opérations entre onglets, recalcule l’aperçu et reconnaît une installation déjà appliquée. Une coupure bloque les actions pendant la consultation. Le test en deux onglets vérifie cette logique locale.

Le mock couvre la place prévue, le déplacement direct et l’échange simple 214/215. Il affiche le motif de refus pour une table incompatible, une occupation déclarée, un maintien ou une fusion protégée. Le passage simulé utilise une table et conserve l’horaire du jeu fictif. Les chaînes de déplacements, les fusions en écriture, les exceptions de second occupant et les confirmations de départ demandent les contrats moteur correspondants. L’utilisation des RPC et la recette PostgreSQL/Realtime du nouveau parcours relèvent de l’intégration commune.

## Recette isolée

Le service fictif cumule **200 couverts, 76 groupes, quatre vagues et deux salles**. Il comprend 30 couverts de passage dans le scénario que l’interface ne reçoit pas. Les tables sans signal physique affichent « Aucun client enregistré » et un client installé au-delà de sa durée estimée reste à vérifier.

```sh
npm ci
npm run test:syntax
npm test
npm run test:express:browser
```

Les tests Express utilisés par `test:display` ouvrent la vraie entrée `v3-connected.html` avec un service isolé. Ils vérifient le parcours 214/215, la reprise, **Autre table**, le passage, la conservation du brouillon, le conflit entre onglets, la coupure, la mise à jour d’un instantané et les droits d’affichage Restaurant/Réception. Le serveur de test compte les mutations inattendues et le navigateur bloque les requêtes externes. Les captures et contrôles axe sont produits sur le scénario de confirmation. Les résultats détaillés sont publiés dans le brouillon GitHub et #266.

Les commandes CI et les captures utilisent des données fictives. Une validation sur les appareils du pupitre et le raccordement au serveur sont les étapes suivantes de la recette.
