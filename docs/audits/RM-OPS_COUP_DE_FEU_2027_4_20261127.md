# RM-OPS — Intégration Coup de feu v2027.4

Base DEV `09ec277`. Branche `codex/rm-ops-coup-de-feu-2027-4`. Suivi [#266](https://github.com/DylanL-Dev/RestoManager/issues/266).

## Ressources et cache

Les deux ressources fournies sont copiées à l’identique et chargées après le pack UX avec `?v=2027.4`. Les blocs v8 et v9 étaient déjà absents du pack sur cette base. Le cache PWA `restomanager-shell-20261126-rmsec0304b-rmuxpack11fix2-startup1-coupdefeu2027-4` inclut les deux ressources, également déclarées dans le manifeste de distribution.

| Ressource | SHA-256 |
| --- | --- |
| `rm-coupdefeu.css` | `ff566f006f0c5b20c39f11a1a149083051b7383ca4d2d684721650e0c106d514` |
| `rm-coupdefeu.js` | `ffb3f61b83239b53be42a385b54a88d4ac4a1e76e2efade14cec416dcc411c58` |

Les ajustements de contraste, d’accessibilité et de largeur sont dans la feuille Express. Le calcul d’horaire de la couche fournie prend minuit comme référence en service connecté. Le service connecté affiche le compteur natif des couverts attendus à quinze minutes et masque les regroupements, décomptes et barres issus de ce calcul. Les pastilles de salles utilisent l’instantané Express de l’établissement actif.

## Libération et annulation

- En simulation, le verrou du navigateur protège la lecture, la libération et l’annulation. La simulation de l’établissement est stockée localement et partagée entre ses onglets du même navigateur. La couche fournie sélectionne le premier jeu fictif stocké. Si le premier jeu appartient à un autre établissement, le module Express garde cette fiche fermée et refuse l’action.
- En service connecté, Coup de feu et « Tables occupées » partagent l’action métier. La proposition appelle la transition de statut existante pour libérer, sous le verrou d’établissement, après vérification du statut, de la version et des tables. L’annulation est liée au compte à l’origine de la libération, valable huit secondes et refusée si une table est réoccupée ou désactivée.
- L’annulation restaure les horodatages de l’installation. Les règles d’accès et le signal de synchronisation existants restent appliqués. Le justificatif privé sert à borner l’annulation. Il est supprimé à l’annulation, au prochain nettoyage lors d’une libération pour le même établissement ou avec la réservation.
- La capacité serveur `quick_release` conditionne l’accès à la nouvelle opération sur DEV. En son absence, Coup de feu dirige vers le mode complet, qui utilise l’appel existant.

## Validation et mise en service

- 491 tests unitaires. Les scénarios Chromium ciblés couvrent les six largeurs du guide en clair et sombre, le clavier et le passage, T1 avec Martin, chambre 237, à +9 min, puis la libération et l’annulation vues depuis deux onglets.
- Le parcours connecté est exercé dans deux contextes Chromium indépendants sur une RPC fictive. Les deux appels atteignent la RPC, un seul est accepté et le second ouvre le bandeau d’erreur. Le parcours sans la capacité serveur vérifie le retour en mode complet.
- Le test `node tests/postgres/rm-ops-quick-release.cjs` rejoue le schéma de référence DEV sur PostgreSQL 17 jetable. Il vérifie deux transactions concurrentes et l’incrément de révision de l’action existante, ainsi que l’interdiction d’annuler pour un autre compte, après réoccupation ou après expiration.
- La proposition SQL se trouve dans `supabase/proposals/rm-ops-quick-release/`. Sa validation sur le schéma hébergé et l’essai final sur deux appareils avec Realtime DEV demandent une autorisation distincte. Aucune migration n’est appliquée sur un service hébergé.

## Simulation réservée à DEV

La version v2027.4 a été publiée sur Render DEV avec la fusion `9798357`. Pour les futures promotions, le bouton « Simuler un service » et la création d’un service fictif exigent le canal DEV sur le domaine Render de DEV ou une adresse locale de recette. Les pages de V3 et MAIN portent le canal `main`. Un autre hôte reste bloqué même si sa page annonce le canal DEV. [Déploiement v2027.4](https://dashboard.render.com/static/srv-dbm8o15g1s2s73cemju0/deploys/dep-dc50jeui0phs73bu5fn0).

Les tests couvrent GitHub Pages, un autre hôte Render et une copie de la page publiée sur localhost. L’accès actuel à Coup de feu reste limité à ses hôtes existants. Là où il est accessible, le service partagé continue de fonctionner quand la simulation est bloquée. Le paquet de publication exclut le module de simulation. Le cache PWA versionné conserve le module uniquement dans le cache de développement.
