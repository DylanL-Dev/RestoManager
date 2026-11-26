# RM-OPS — Intégration DEV d’Express et du moteur de placement

Candidat de recette sur `codex/rm-ops-integration`, à partir de DEV `608fba9`, Express #271 `3c6caf7` et moteur #270 `4cdfafa6`. Les entrées des deux lots au registre et leurs scripts de test sont conservés. [Coordination #247](https://github.com/DylanL-Dev/RestoManager/issues/247#issuecomment-7191509951) · [Revue croisée #270](https://github.com/DylanL-Dev/RestoManager/blob/4cdfafa62d53fb3bac2ed0a4a0de8abbb40cd643/docs/audits/RM-OPS_INTEGRATION_EXPRESS_MOTEUR_20261126.md)

## Parcours et protections

- Le service partagé utilise `placement-express-adapter.mjs` pour afficher les propositions de placement, les déplacements du dossier et les tables candidates d’un passage. Le filtre limite les options visibles. Le moteur évalue les contraintes sur le plan complet de l’établissement. Express affiche l’origine et la destination d’un changement de salle et conserve les états enregistrés des tables.
- La façade lit les instantanés cohérents de l’établissement authentifié avec le rôle Restaurant. La perte de connexion ou la resynchronisation suspend les nouveaux aperçus du service partagé. Si la fiche ou le plan change, un aperçu devenu périmé exige un nouveau choix. Lors d’un changement de session, le cockpit efface l’ancien contexte et attend l’instantané correspondant.
- `EXPRESS_WRITES_ENABLED` est désactivé dans l’adaptateur. La façade connectée renvoie `EXPRESS_WRITE_DISABLED` pour `seat` et `walkIn`, y compris si le serveur annonce `placement: 4`. Le cockpit affiche les aperçus du service partagé et les confirmations restent dans la simulation. Les actions existantes du mode complet gardent leur propre parcours.
- Avec la RPC v3, l’installation peut réussir sur la table réaffectée par un autre pupitre. Le signal `SEATED_ELSEWHERE` arrive après l’écriture. La mise en service d’Express dépend de la validation du correctif serveur `seat_reservation_v1`, de la capacité associée et de la recette sur appareils. [Constat et proposition #265](https://github.com/DylanL-Dev/RestoManager/issues/265#issuecomment-7190887437)

## Chargement PWA

Les scripts modifiés et les imports Express utilisent la même version `20261126-rmops-integration1`. Le cache inclut la façade, l’adaptateur, les modules de lecture et de simulation et la feuille de style. Hors ligne, la PWA consulte en priorité le cache du worker courant et conserve la recherche de ressources des anciennes fenêtres. Le contrôle des brouillons et l’activation explicite du worker suivent la séquence existante. La liste du paquet statique de recette contient les dépendances du cache. Le manifeste de version publié et le routage des environnements sont conservés. `v3-connected.html`, `sw.js` et la liste d’actifs sont à coordonner avec le lot CSP #260 lors d’une éventuelle intégration ultérieure.

## Recette combinée

Le jeu représente 200 couverts en quatre vagues, dont 30 couverts de passage omis dans l’instantané. L’essai navigateur utilise une tablette et un téléphone dans deux contextes distincts. Ils consultent T4 simultanément, reçoivent la mise à jour d’un dossier et invalident leurs anciens aperçus. La recette couvre Prestige sans table, le choix inter-salles, la coupure, le passage en aperçu, le retour au brouillon du mode complet, les rôles et deux établissements avec des numéros de table identiques.

Les essais navigateur du cockpit utilisent un transport fictif avec compteur de mutations et accès extérieur bloqué. La recette moteur exerce sa voie d’écriture uniquement avec un serveur local fictif prévu à cet effet. La configuration réelle du candidat fait l’objet d’un test distinct de refus d’écriture, avec la capacité serveur simulée. Les tests PostgreSQL répliquent le catalogue versionné dans un conteneur jetable sans réseau. Les 28 cas, dont la course v3 et le correctif proposé, y réussissent.

| Suite locale | Résultat |
| --- | --- |
| `npm run test:syntax` | 272 fichiers contrôlés |
| `npm test` | 95 fichiers, 474 assertions et cas avec le détail du runner |
| `npm run test:display` | 17 contrôles d’affichage, 10 groupes Express et 7 scénarios moteur dans Chromium |
| `npm run test:mission3:browser` | 110 contrôles de non-régression des rôles et écrans équipe |
| `npm run test:notifications:browser` | 14 groupes de vérification |
| `npm run test:notifications:pwa` | 12 groupes, racine et sous-chemin `/RestoManager` |
| `npm run test:rm-ops:postgres` | 28 cas sur PostgreSQL 17 isolé |
| `npm run prepare:production` | 145 fichiers préparés localement, portail fermé |

La validation des appareils physiques, l’activation de l’écriture Express et la validation du correctif sur un environnement partagé relèvent d’une étape séparée.
