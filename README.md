# RestoManager

Application statique de réservation et de gestion des salles, avec éditeur de plan
2D/3D. Le stockage local existant est conservé ; aucun service Supabase n'est intégré.

## Démarrage et tests

Node.js 22 ou supérieur et Python 3 sont nécessaires pour les commandes de développement.

```sh
npm ci
npm test
npm run serve
```

Ouvrir http://localhost:8000. Dans un second terminal, lancer les scénarios navigateur :

```sh
npm run test:browser:install
npm run test:browser
```

Chromium système est utilisé s'il existe dans `/usr/bin/chromium`, sinon celui installé
par Playwright. `CHROMIUM_PATH`, `BROWSER_BASE_URL`, `BROWSER_ARTIFACTS` et
`PLAYWRIGHT_MODULE` permettent d'adapter l'exécution. Les résultats JSON et captures
sont placés par défaut dans `/tmp/restomanager-artifacts`. Les tests utilisent des
contextes de navigateur isolés et des données de démonstration.

`npm run screenshots` reproduit les [captures PC et mobile](docs/screenshots) avec un
plan de démonstration indépendant. Le workflow GitHub valide les tests Node et les
scénarios Chromium à chaque PR vers `main` et sur la branche de mission.

## Éditeur

Gestion du restaurant → Modifier le plan. Un toucher sélectionne, glisser déplace.
Les poignées dimensionnent et tournent ; les boutons permettent aussi des rotations
45°/90°. Sur PC, tracer un rectangle sur le fond sélectionne plusieurs objets ;
Maj/Ctrl-clic ou « Sélection multiple » au doigt complètent la sélection.

Deux doigts zooment et déplacent le plan. Le bouton central souris déplace la vue.
« Vue complète » recadre le plan. Les propriétés rapides sont à droite sur PC,
les détails dans un panneau inférieur sur smartphone. Le magnétisme est désactivable.

Raccourcis : flèches 10 cm, Maj/flèches 1 cm, Ctrl/Cmd A/D/Z/Maj Z/Y/S,
Suppr et Échap. L'historique conserve 60 opérations du brouillon, y compris les
formulaires et changements de dimensions des salles. Enregistrer valide le brouillon ;
Annuler l'abandonne après confirmation. Les tables liées aux réservations ou à
l'historique restent protégées.

## Données et 3D

Le format v4 utilise les mètres et le centre des objets. Les versions v1–v3 sont
migrées en mémoire sans modifier le JSON enregistré ; avant la première sauvegarde
v4, le contenu historique est copié dans
`restomanager_floor_plan_v1_backup_before_v4`. La clé principale reste
`restomanager_floor_plan_v1`. Réservations et historique conservent leurs clés.
Un contenu illisible n'est pas écrasé ; une erreur de sauvegarde conserve le brouillon
et les données en mémoire. Fermer un brouillon non enregistré déclenche un avertissement.

La 3D utilise [Three.js r180 local](vendor/three/README.md), chargé à la demande,
avec maillages instanciés, matériaux simples et petites étiquettes de numéros.
Elle représente l'emprise du mobilier et de ses assises, comme le dessin 2D.
En cas d'indisponibilité ou perte de WebGL, la 2D reste utilisable.

## Validation et hébergement

[L'audit et les résultats par lot](docs/mission-3.md) détaillent les corrections.
La [matrice de validation](docs/manual-validation.md) distingue les scénarios
automatisés des vérifications sur appareils physiques encore nécessaires : les
objectifs 60 FPS PC et 30 FPS smartphone ne sont pas certifiés par une émulation.

GitHub Pages existant utilise une autre branche (`codex/mission-3-service-tables`).
Sa configuration reste intacte : cette mission fournit une prévisualisation locale
et des captures, sans déployer automatiquement les changements ni fusionner `main`.
