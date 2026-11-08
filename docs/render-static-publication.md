# Render — publication statique avec liste blanche

## Pourquoi modifier la publication

Au 8 novembre 2026, le service Render `restomanager-v3-supabase-integration` suit
`feature/v3-supabase-full-clone` et utilise :

- Build : `echo 'Publishing full V3 source without filtering assets'`
- Publish Directory : `./`
- Auto-Deploy : activé

Cette configuration publie la racine du dépôt au lieu d'un artefact construit. Elle risque donc
de rendre accessibles les scripts SQL, les fichiers de tests, les documents techniques et
d'autres fichiers qui ne sont pas nécessaires au navigateur. Il s'agit d'un **risque de
publication non filtrée** démontré par la configuration ; l'accès HTTP à chaque fichier
interne n'a pas été validé depuis une session distante.

## Correction préparée

- `scripts/public-files.json` : liste blanche explicite des 65 assets de navigation autorisés.
- `scripts/build-public.cjs` : construit `dist/` uniquement depuis cette liste.
- `scripts/verify-public.cjs` : vérifie la correspondance exacte, les fichiers interdits,
  les références locales `script/link/img` des fichiers HTML et l'intégrité des copies.
- `npm run test:static` : construction + vérification reproductibles.
- Workflow `V3 static publication safety` : Node 22, validation et artefact public inspectable.

**Pas de changement des identifiants Supabase, des RPC, des données ou de la logique des réservations.**
`dist/` est généré et ne doit pas être ajouté à Git (ajouter `dist/` dans `.gitignore`).
La liste blanche doit être modifiée explicitement pour publier un nouvel asset lors d'une
prochaine évolution de l'interface.

## Basculement de Render — procédure avec contrôle humain

**Ne pas fusionner ni changer Render avant que la CI du correctif soit verte.**

1. Vérifier que la Pull Request dédiée ne modifie pas les fonctions métier et que
   `npm run test:static`, les tests existants et les contrôles de sécurité passent.
2. Sur Render, dans le service `restomanager-v3-supabase-integration`, **désactiver
   temporairement Auto-Deploy** avant la fusion de la Pull Request. Ne pas modifier la
   branche de déploiement.
3. Fusionner la Pull Request vers `feature/v3-supabase-full-clone`. Comme Auto-Deploy est
   désactivé, le site live ne doit pas basculer lors de cette fusion.
4. Dans Render, modifier **Build Command** en `npm run build:static` et **Publish Directory**
   en `dist` (sans `./`).
5. Lancer **un déploiement manuel**, vérifier que le commit exact attendu est `live`
   et que le build indique `Publication statique : 65 fichiers autorisés dans dist/.`.
6. Vérifier les entrées `/`, `/login.html`, `/v3-connected.html`, CSS, JS, manifestes
   et images depuis un navigateur privé et un navigateur mobile.
7. Vérifier que des chemins comme `/supabase/scripts/mission3_validation_integration.sql`,
   `/tests/browser/table-display.cjs`, `/docs/mission3-validation-integration.md`,
   `/package.json` et `/scripts/build-public.cjs` ne retournent **plus le fichier
   demandé** (réponse 404 ou réponse de fallback non sensible, sans le contenu source).
8. Avec comptes autorisés **sans créer de réservations réelles de test**, comparer les
   écrans Tables, Réservations, Ajouter, Service et Gestion entre Restaurant et Réception.
   Une vérification de création/édition en bout de chaîne s'effectue seulement sur un
   environnement isolé avec des comptes et réservations fictifs.
9. Réactiver Auto-Deploy **seulement après** contrôle de la nouvelle chaîne de build.

**Ne pas considérer le basculement comme terminé si un ancien appareil affiche encore
des assets dépareillés ou si un fichier interne reste consultable.**

## Validation d'intégration fonctionnelle

Avant un score de qualité final, couvrir :
- Deux comptes indépendants, Restaurant et Réception, avec actualisation Realtime.
- Une réservation fictive sur environnement isolé, une modification concurrente,
  l'abandon d'un maintien et une réponse de confirmation perdue.
- Affichage des tables à 390×844, 768×1024 et 1440×900.
- Conservation des retards à 12:01, fuseau Europe/Paris.
- Création de PDF, filtres, sélection de salle, historique et clôture.
- Test de restauration de données hébergées / plan PITR (à décider séparément).
- Temps de chargement et charge simultanée mesurés, plutôt que score supposé.

## Retour arrière

Conserver la version `live` précédente et le commit GitHub. Si le nouveau déploiement
échoue, garder Auto-Deploy désactivé, corriger l'artefact ou restaurer un déploiement
compatible. **Éviter de revenir durablement à `publishPath: ./`**, qui réintroduit la
publication non filtrée. Ne jamais revenir à des RPC d'édition non versionnées.

## Limites

Les tests du build ne prouvent pas que Render a appliqué les nouveaux paramètres,
ni que le navigateur authentifié fonctionne sur tous les appareils. La modification du
Build Command et du Publish Directory exige un accès à la configuration du service Render ;
les outils disponibles dans cette session ne permettent pas de modifier ces deux paramètres.
