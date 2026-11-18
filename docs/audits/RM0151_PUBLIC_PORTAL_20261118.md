# RM-015.1 — Portail public de réservation, recette DEV

Une nouvelle entrée publique indépendante permet d’essayer tout le parcours sans compte : restaurant, personnes, date, midi/soir, horaire, coordonnées fictives, récapitulatif, confirmation simulée, consultation, modification et annulation confirmée. Aucun email, maintien de table ou réservation réelle n’est envoyé/créé.

[Architecture, audit de l’existant, frontières de sécurité et travaux RM-015.2](RM0151_PUBLIC_ARCHITECTURE_20261118.md).

## Écrans et choix visuels

Identité RestoManager : vert/blanc, arrière-plan clair, cartes arrondies, ombre légère, Lucide local et champs tactiles. Sur PC/tablette, présentation et réservation sont côte à côte ; sur téléphone, un lien d’accès direct mène au formulaire. Les étapes suivantes se concentrent sur une seule carte avec retour, récapitulatif et conservation de la saisie. Les dates/heures sont validées dans le fuseau Europe/Paris ; la présentation native du champ date dépend du navigateur et de sa langue.

La maquette annoncée n’a pas été reçue et n’est pas présente dans l’issue #173. Il est donc impossible de comparer sa composition ou d’annoncer une reproduction fidèle. Cette proposition applique les contraintes écrites. L’image est une illustration SVG originale, explicitement identifiée, pas une photographie prétendue du restaurant. Les informations réelles non fournies (logo officiel, coordonnées, carte, horaires, disponibilités, conditions) ne sont pas inventées. Le nom demandé sert de fiche de démonstration dans le registre multi-établissements.

### Captures de référence

| Format | Présentation et venue | Coordonnées | Confirmation | Annulation |
| --- | --- | --- | --- | --- |
| Mobile 390 px | [Voir](preuves/rm0151-20261118/welcome-390.png) | [Voir](preuves/rm0151-20261118/contact-390.png) | [Voir](preuves/rm0151-20261118/confirmation-390.png) | [Voir](preuves/rm0151-20261118/cancelled-390.png) |
| Tablette 768 px | [Voir](preuves/rm0151-20261118/welcome-768.png) | [Voir](preuves/rm0151-20261118/contact-768.png) | [Voir](preuves/rm0151-20261118/confirmation-768.png) | [Voir](preuves/rm0151-20261118/cancelled-768.png) |
| PC 1440 px | [Voir](preuves/rm0151-20261118/welcome-1440.png) | [Voir](preuves/rm0151-20261118/contact-1440.png) | [Voir](preuves/rm0151-20261118/confirmation-1440.png) | [Voir](preuves/rm0151-20261118/cancelled-1440.png) |

## Résultats automatisés locaux

- `npm run test:syntax` : **160 fichiers, aucun échec**.
- `npm test` : **247 tests réussis, aucun échec**, dont 12 nouveaux tests RM-015.1. Les tests métier existants restent inclus.
- `npm run test:public-demo:browser` : **13 groupes Playwright réussis**. Sept parcours complets aux largeurs **360, 390, 430, 768, 1024, 1440, 1920** ; six groupes complémentaires sécurité/ergonomie/PWA.
- **36 audits axe-core WCAG 2 A/AA et 2.1 AA sans violation détectée** : présentation, formulaire, récapitulatif, confirmation, dialogue d’annulation aux sept largeurs, puis texte agrandi.
- Clavier : lien d’évitement, champs/radios natifs, action d’étape, focus sur le titre, erreur liée au champ et focus sur la première erreur, retour sans perte de coordonnées, boîte de dialogue avec cycle de focus et Échap. Réduction des animations respectée. Texte doublé sans débordement horizontal.
- Disponibilités fictives : dates passées/hors horizon, service fermé, horaire non proposé, nombre de personnes et configurations indépendantes ; aucune fausse quantité de places disponibles.
- Gestion locale : actualisation, modification avec révision, refus des révisions périmées, annulation idempotente, modification après annulation refusée, lien inconnu/autre session/autre établissement/expiré refusé, exemple expiré effacé à sa lecture, stockage interdit et reprise en mémoire expliquée.
- Sécurité : aucune requête métier, aucune globale salariée, aucun SDK/secret dans les sources publiques ; notes HTML affichées en texte ; `connect-src 'none'` empêche une tentative d’accès au bridge interne avant toute requête HTTP. Artefact séparé limité à huit fichiers publics.
- PWA : véritable service worker interne installé sur une origine locale isolée ; aucune mise en cache publique, aucun tableau de bord renvoyé pour une navigation publique hors connexion, aucun accusé salarié exigé d’un onglet public.

[Résultats machine](preuves/rm0151-20261118/results.json). Le workflow dédié et les workflows historiques de non-régression sont lancés sur la PR DEV ; leurs résultats et les preuves de déploiement exactes sont consignés dans la PR avant publication du clone.

Corrections révélées par les vérifications : contraste des textes secondaires et étapes, structure sémantique de la liste récapitulative, cycle clavier du dialogue, débordement avec texte doublé, et frontière du secours hors connexion. Aucun test n’utilise de vraies données ou identités salariées.

## Fichiers concernés

| Groupe | Rôle |
| --- | --- |
| `reservation/index.html`, `portal.css`, `portal.js`, `dining.svg` | Entrée publique, styles, parcours accessible et illustration locale |
| `reservation/model.js`, `demo.js` | Configurations multi-établissements, dates/validation et adaptateur exclusivement fictif |
| `sw.js` | Exclusion explicite du chemin public des caches, du secours et des vérifications de mise à jour salariés |
| `scripts/build-public-demo.cjs`, `.gitignore` | Artefact de publication séparé, non activé en production |
| `tests/rm015-public.test.cjs`, `tests/browser/rm015-public.cjs` | Tests de contrat/sécurité et parcours visuels |
| `package.json`, `package-lock.json` | Commandes de validation et axe-core 4.10.3, uniquement dépendance de test ; versions Supabase/Playwright inchangées |
| `.github/workflows/rm015-public-demo.yml` | Recette isolée et artefacts, PR vers DEV uniquement |
| `docs/audits/RM0151_*`, preuves, `docs/RELEASE_TRACKER.md` | Architecture, résultats, captures, QR de recette et suivi de livraison |

## Recette Render DEV

1. Ouvrir [L’Épicerie — portail de démonstration](https://restomanager-v3-supabase-integration.onrender.com/reservation/?restaurant=a-lepicerie-rouen). Aucun compte nécessaire. Vérifier le bandeau de démonstration.
2. Choisir des personnes, une date et un service ; les horaires sont illustratifs. Le midi du samedi/dimanche est fermé dans **cette configuration fictive**, sans prétendre décrire le restaurant réel.
3. Choisir un horaire proposé. Continuer avec Camille Exemple et `camille@example.test`, accepter les conditions de l’exercice, vérifier le récapitulatif et terminer la réservation fictive.
4. Vérifier la référence `DEMO-…`, l’absence de promesse d’email et de réservation réelle. Ouvrir le lien de gestion dans **le même onglet**, actualiser et modifier le nombre de personnes. Vérifier le nouveau récapitulatif.
5. Revenir au lien, demander l’annulation, fermer la confirmation avec Échap, puis confirmer volontairement. L’exemple est annulé et ne peut plus être modifié.
6. Essayer [Le Jardin, deuxième établissement fictif](https://restomanager-v3-supabase-integration.onrender.com/reservation/?restaurant=le-jardin-demo) : nom, personnes et horaires diffèrent. Un lien du premier établissement ne doit rien révéler dans le second.
7. Essayer les retours, le clavier, la confidentialité, le téléphone/tablette/PC et un lien inconnu. À expiration ou dans une autre session, le lien doit être refusé sans récapitulatif.

QR de recette : [L’Épicerie](preuves/rm0151-20261118/qr-a-lepicerie-rouen.svg) · [Le Jardin](preuves/rm0151-20261118/qr-le-jardin-demo.svg). Ils encodent les URL publiques DEV de chaque restaurant, jamais un lien client. [Destinations, générateur et empreintes](preuves/rm0151-20261118/qr-links.json). Génération locale python-qrcode 8.2, sans bibliothèque ajoutée au portail ; lecture par appareil photo réelle encore à vérifier lors de la recette.

## Limites et suite

Tests Chromium automatisés et simulation tactile, pas d’essai avec de vrais clients, de lecteur d’écran humain, de Safari/iOS réel ni d’audit d’accessibilité certifié. Les textes et repères sont vérifiés automatiquement ; une observation de débutants reste nécessaire.

L’aperçu ne peut pas créer une vraie réservation. Les données sont fictives et locales à la session ; les liens ne sont pas signés/vérifiés par un serveur, ne sont pas multi-appareils et ne constituent aucune garantie de disponibilité ou de sécurité serveur. L’onglet public fonctionne indépendamment des tableaux de bord ; le clone DEV sert encore les fichiers statiques internes déjà protégés par leur authentification. L’artefact public distinct est préparé pour une future origine dédiée.

La phase RM-015.2 doit implémenter et valider l’API, les disponibilités transactionnelles communes, quotas, maintiens/idempotence, liens serveur, protections anti-abus, emails, source Web/notifications, configuration officielle et RGPD. Aucune migration dans cette phase, aucune modification Supabase partagée, aucune activation V3/MAIN ou production.
