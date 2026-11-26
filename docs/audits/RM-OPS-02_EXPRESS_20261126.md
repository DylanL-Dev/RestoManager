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

## Navigation entre les salles

Suite du [cadrage #266](https://github.com/DylanL-Dev/RestoManager/issues/266#issuecomment-7190857861) dans le brouillon #271. Le sélecteur propose **Toutes les salles** et les salles actives de l’instantané. Le filtre agit sur le plan et les propositions fictives. La recherche, le dossier et les valeurs de saisie d’un passage sont conservés pendant la navigation. Si une salle est désactivée pendant le service, Express revient à la vue d’ensemble et conserve le dossier.

Chaque salle affiche le nombre de tables configurées et, si elles diffèrent, les tables actives. Les compteurs montrent les tables prévues, les installations déclarées et les départs à vérifier. Un départ à vérifier est déjà compté dans les installations déclarées. L’affluence concerne l’ensemble du service. Une salle vide affiche **Aucune table configurée** et un accès aux autres salles reste disponible pendant le choix. Les états affichés décrivent les pointages reçus et les réservations prévues.

L’adaptateur fictif privilégie la salle prévue dans la vue d’ensemble. Une salle ciblée filtre les suggestions validées par le simulateur. Si la table se trouve ailleurs, le parcours affiche la salle d’origine et la destination avant l’installation. Les fusions restent représentées dans la consultation. La simulation conserve le refus d’installer une fusion et laisse le contrat de placement multi-table à #265.

### Isolation du cockpit

La lecture conserve la source de service authentifiée existante. La préparation de l’instantané associe les horaires, la configuration et les attributions au même identifiant d’établissement. Express compare cet identifiant à celui de la session avant de lire plan, réservations ou paramètres. Un instantané en retard provenant d’un autre établissement, ou un instantané aux identifiants incohérents, laisse Express en attente. Le changement d’identité efface le filtre, la recherche, la sélection, les reprises et le formulaire fictif. Le simulateur conserve son stockage par établissement.

Le contrôle de session et des lectures côté serveur reste celui du service existant. La recette de ce lot vérifie le cockpit et sa réaction aux événements de synchronisation avec un transport simulé. Les permutations et passages restent en simulation.

### Recette inter-salles

- Scénario de 200 couverts sur deux salles avec tables et une salle active vide. Couverture unitaire de 0/1/N salles, des tables toutes prévues ou toutes déclarées occupées et du traitement des fusions par le simulateur.
- Parcours navigateur en 360, 390, 768, 834 et 1440 px. Consultation d’une salle vide, navigation au clavier, proposition inter-salles, repli vers toutes les salles, conservation du brouillon du mode complet et du passage, contrôle axe et thème sombre.
- Deux établissements fictifs aux salles et numéros identiques mais aux réservations, états et seuils distincts. Vérification de l’isolation de leurs simulations et du changement de contexte dans le même document, suivi de l’arrivée d’un instantané tardif puis d’un instantané mixte.
- Mise à jour du plan pendant le service, salle désactivée, table retirée, vue de consultation hors connexion, retour réseau et rôle Réception.

Les captures `express-salles-390.png`, `express-salles-834.png` et `express-salles-1440.png` sont produites par `npm run test:express:browser`. `express-salles-834-prestige.png` montre le cas d’une salle configurée sans table dans les données fictives. Le bilan et l’artefact CI sont suivis dans #266 et #271.
