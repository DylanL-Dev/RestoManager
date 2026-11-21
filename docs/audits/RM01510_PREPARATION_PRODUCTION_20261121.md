# RM-015.10 — Préparation de production et synchronisation réelle

Date : 21 novembre 2026. Livraison préparée, **aucune publication officielle**.

## État de livraison

Branche `feature/rm015-production-preparation`, issue de DEV (`feature/v3-supabase-full-clone`) au commit `f01e01e83d7143b25e28bec9ff90296a02e3d409`. Sauvegarde distante préalable : `backup/rm015-before-production-prep-20261121`, au même commit.

Le portail DEV déjà publié reste celui de RM-015.9 sur <https://restomanager-v3-supabase-integration.onrender.com>. Cette préparation ne déploie ni l'API DEV ni Render. MAIN, V3 et les données de Supabase PROD ne sont pas modifiés. Aucun client fictif, maintien ou réservation de test n'est créé dans une base partagée.

Les tests de synchronisation sont nécessaires : des captures ou des réponses API simulées ne prouvent pas que le portail, les tableaux de bord et les appareils reçoivent les mêmes changements. Cette livraison ajoute cette vérification sur une pile locale réelle, en plus des tests existants.

## Comportements préparés

- Un paquet officiel distinct de la recette DEV, produit par `npm run prepare:production`. Le portail est **fermé par défaut**, sans appel au backend. Les réglages Restaurant refusent aussi son ouverture lorsque cet artefact indique « closed ».
- Une liaison explicite entre l'hébergement officiel, son chemin et le projet Supabase PROD. Un fichier de configuration DEV copié sur le site officiel est refusé avant connexion. Le code source de l'API DEV conserve sa cible DEV ; le paquet serveur officiel possède une entrée dédiée liée à PROD.
- Une liste explicite des fichiers publiables. Le dossier `site/` exclut SQL, tests, scripts, documentation, dépendances de développement et configuration privée. Le reçu `release.json` conserve les empreintes SHA-256, le commit source, les branches officielles examinées et l'état fermé.
- Un historique « Quoi de neuf ? » qui conserve les annonces de MAIN et ajoute une annonce officielle, sans importer les annonces intermédiaires de DEV. Le cache de l'application possède une version distincte.
- Des liens et QR codes officiels sans mention « DEV ». Les téléchargements PNG sont décodés indépendamment dans les tests et pointent vers la bonne URL, y compris pour le parcours Hôtel.
- Une vérification Cloudflare Turnstile progressive après le seuil anti-abus existant. Le jeton est vérifié côté serveur avec l'action `reservation` et le nom d'hôte autorisé. Erreur, expiration, annulation ou fournisseur inaccessible : aucune poursuite de la réservation ; le choix du client reste présent. Une reprise conserve l'identifiant de maintien initial et ne boucle pas.
- Aucun jeton de vérification n'est enregistré dans le stockage du navigateur. Le secret reste côté serveur. Une API officielle activée refuse de fonctionner sans secret anti-abus configuré.
- Les emails restent désactivés. Le client conserve son lien personnel pour retrouver sa réservation ; le champ email reste masqué selon le parcours publié.

Le fondu d'entrée du formulaire commençait à 60 % d'opacité et pouvait diminuer temporairement le contraste lors d'un audit. L'animation conserve son déplacement discret avec une opacité constante. Aucune règle axe n'a été désactivée pour contourner ce problème.

## Vérification préalable de production, en lecture seule

Le script [preflight.sql](../../supabase/production/rm015-preflight.sql) est enveloppé dans une transaction `READ ONLY`.

L'exécution sur le catalogue PROD a vérifié les objets, privilèges et publications, sans lire de réservation ni de coordonnées client. [Résultat conservé](preuves/rm015-production-20261121/production-catalog-readonly.json) :

- Les neuf prérequis métier sont présents : édition, fusions, classement des tables, verrouillage des mutations, horaires hebdomadaires, limites d'arrivées, régularisation, Storage et Vault.
- Le schéma privé RM-015 et ses fonctions ne sont pas encore installés.
- Les réservations, affectations, maintiens et changements de service sont publiés pour Realtime.
- Les quatre tables critiques ont RLS activé ; `anon` ne possède pas de droit SELECT direct sur elles.

Cela établit les prérequis du catalogue, pas le bon fonctionnement d'une future installation hébergée. Aucun secret Vault ni contenu métier PROD n'a été extrait.

## Migrations préparées et impacts

Le paquet contient uniquement les six migrations RM-015 déjà utilisées sur DEV, dans cet ordre. Aucune nouvelle migration métier n'est inventée pour cette préparation.

| Migration | Impact attendu après autorisation |
| --- | --- |
| `20261118190351_rm015_secure_public_booking.sql` | Tables privées de paramètres, demandes, idempotence, limitation, audit et file email ; liens Web sur réservations/maintiens ; fonctions serveur et rôle privé dédié. Les écritures publiques passent par le backend. |
| `20261119084919_rm015_dev_runtime_vault.sql` | Lecture d'une configuration Vault fixe par un RPC réservé au backend. Le nom historique contient `dev`, mais le SQL ne crée aucune clé ni configuration DEV. |
| `20261119085721_rm015_backend_auth_permissions.sql` | Permissions étroites nécessaires au rôle de traitement et à l'identité authentifiée, sans élargissement de l'accès public aux données internes. |
| `20261119182041_rm015_portal_cover_media.sql` | Bucket public dédié `rm015-covers`, uniquement pour des photos volontairement publiques, WebP et 2 Mio maximum. Droits d'écriture limités au personnel autorisé de son établissement ; protection des métadonnées et des autres buckets. |
| `20261120074140_rm015_public_restaurant_profile.sql` | Présentation publique validée par établissement, horaires et audit des changements de profil/photo. |
| `20261120173728_rm015_public_hotel_guests.sql` | Distinction Hôtel/Extérieur dans la demande ; chambre et nom requis pour Hôtel. Cette déclaration ne vérifie pas un séjour dans un logiciel hôtelier. |

Ces migrations étendent et remplacent certaines fonctions métier ; ce n'est pas une simple copie de fichiers statiques. Elles ne créent pas de réservations de démonstration, n'activent pas les restaurants et ne réécrivent pas leurs horaires. Le bucket est un nouvel objet partagé et ses règles doivent être examinées avant application.

Elles sont testées sur une base éphémère isolée. Le paquet les range dans `migrations/`, **hors** du dossier `supabase/migrations/` du projet CLI préparé : aucun `db push` global ne doit entraîner l'application des anciennes migrations spécifiques à la recette DEV. Ne pas importer un dump DEV, ses paramètres, clés, photos ou réservations.

## Résultats locaux

| Vérification | Résultat |
| --- | --- |
| `npm test` | 67 fichiers de tests réussis. |
| `npm run test:syntax` | 209 fichiers contrôlés, aucune erreur. |
| Constructions démonstration et portail connecté | 8 et 20 fichiers statiques respectivement. |
| Construction officielle | Paquet produit, portail fermé et emails désactivés ; liste de fichiers et empreintes dans son reçu. |
| Deno 2.5.6 | Vérification des entrées API DEV et officielle préparée. |
| Synchronisation réelle | **15 scénarios réussis**, 390, 768 et 1440 px, sur Auth + PostgREST + Realtime locaux. |
| Préparation officielle et anti-abus | **20 scénarios réussis**, **21 audits axe**, aux largeurs 360, 390, 430, 768, 1024, 1440 et 1920 px. |

Les résultats JSON et captures sont dans [le dossier de preuves](preuves/rm015-production-20261121/). Les workflows de la Pull Request rejouent les suites de non-régression existantes et les deux nouveaux jobs de préparation/synchronisation ; leur état final est indiqué dans la Pull Request.

### Synchronisation effectivement exercée

Pour chacun des trois formats, le navigateur utilise le vrai formulaire public, son handler HTTP, la base locale, les connexions Auth réelles et deux sessions salariées distinctes. Les tests constatent la réception de trames WebSocket `postgres_changes`, puis le rendu dans les deux interfaces sans actualisation manuelle.

1. Création Web : une réservation, affectation réelle d'une table, affichage côté Restaurant et Réception, compteurs du jour corrects ; absence d'accès depuis un autre établissement.
2. Modification Restaurant : Extérieur vers Hôtel, chambre 204, heure 21 h 15 et journée suivante. Réception et lien personnel reçoivent le changement ; les compteurs et tables de la journée précédente restent cohérents. Les notes internes ne sont pas exposées au client.
3. Réception déconnectée avec une saisie ouverte : un changement Restaurant concurrent arrive à la reconnexion ; le conflit est présenté et la saisie conservée.
4. Annulation publique : mise à jour des deux sessions, disparition de l'occupation active. Les liens d'affectation historiques peuvent être conservés volontairement ; leur présence ne signifie pas qu'une table reste bloquée.
5. Groupe de quatre : demande de confirmation visible au Restaurant, refus réel des droits Réception, deux validations Restaurant simultanées aboutissant à une seule réservation et un état client cohérent.

Les délais locaux observés pour la création jusqu'aux deux états salariés sont de 443, 748 et 587 ms. Ce sont des observations de cette exécution, **pas une garantie de délai en production**. Les courses pour la dernière table, l'idempotence et les limites d'arrivées restent également couvertes par la suite SQL RM-015 existante.

### Limites des vérifications

- Tous les clients sont fictifs, dans des conteneurs locaux éphémères avec clés locales et ports liés à `127.0.0.1`. Les navigateurs bloquent les destinations hors de cette pile. Aucun événement Realtime ni RPC métier n'est simulé dans les 15 scénarios de synchronisation.
- Le calendrier de service et des navigateurs commence demain à minuit ; Auth émet des jetons locaux de deux jours uniquement pour cette horloge contrôlée. Ce réglage de test n'est pas un changement de durée des sessions réelles.
- Les 20 scénarios de préparation utilisent des réponses API et un widget anti-abus explicitement simulés. Ils vérifient les comportements d'interface et les refus, **pas le compte Cloudflare réel**. Les captures de ce widget sont identifiées comme simulations.
- Les politiques photo sont exercées en SQL avec un schéma Storage de test. Le service HTTP Storage hébergé, le déploiement Edge réel et le chemin proxy/IP du futur hébergement ne sont pas exercés par cette pile locale.
- Aucune séance avec de vrais employés ou clients n'est revendiquée.

## Procédure de passage officiel, à exécuter seulement après validation

1. Relire les six migrations et ce rapport. Revérifier les têtes MAIN et V3 avant publication : les bases examinées figurent dans `deployment/rm015-production.json` et le reçu. Une évolution des branches impose une nouvelle comparaison.
2. Depuis un checkout propre du commit validé, exécuter `npm ci`, les contrôles puis `npm run prepare:production`. Contrôler `release.json` : `workingTreeDirty=false`, `portalActivated=false`, `emailDeliveryEnabled=false` et empreintes attendues.
3. Après **autorisation explicite de modification de Supabase PROD**, effectuer la sauvegarde opérateur habituelle, refaire le précontrôle en lecture seule, puis appliquer seulement les six migrations répertoriées. Arrêter à la première divergence ou erreur ; ne pas exécuter un `db push` de toute la branche DEV.
4. Préparer une configuration Vault propre à PROD : `schema=1`, `environment=production`, projet officiel, `enabled=false`, `emailEnabled=false`, origines officielles exactes, clés AES/HMAC et secret de limitation nouvellement générés. Ne pas réutiliser les clés DEV. Garder la variable serveur d'arrêt `RM015_ENABLED=false` pendant l'installation.
5. Déployer uniquement le paquet backend préparé, avec sa configuration `verify_jwt=false`, après autorisation. Exemple : `supabase --workdir dist/rm015-production functions deploy rm015-public --project-ref tnsrkargogckgtsxipwd`. Aucun `--prune`, aucun worker email. L'identité backend reste réservée au serveur ; aucune clé privée ne va dans `site/`.
6. Après autorisation V3/MAIN, publier uniquement le contenu de `dist/rm015-production/site/` par le processus officiel. L'URL gratuite existante examinée est <https://dylanl-dev.github.io/RestoManager/>. Le site officiel est hébergé par GitHub Pages ; Render est actuellement l'aperçu DEV. Ne pas publier le dépôt complet, ses rapports ou ses sources SQL sur Pages. Aucun workflow de cette livraison ne réalise cette publication automatiquement.
7. Vérifier d'abord le site officiel fermé : connexion salariée au bon projet, navigation, historiques, aucune requête au projet DEV, aucune ouverture publique. Configurer chaque restaurant avec ses propres informations réelles, contact confidentialité, conditions, photo publique et limites ; laisser sa case d'ouverture désactivée.
8. Configurer le vrai widget Cloudflare pour le nom d'hôte officiel, sa clé publique et son secret serveur. Valider le proxy de confiance et l'en-tête IP avec la documentation du déploiement. Tester le fournisseur réel sans créer de réservation fictive dans les données réelles. Le compte/widget et les clés ne sont **pas disponibles dans cette livraison**.
9. L'ouverture publique demande une validation distincte : construire le site avec `activated=true` et la vraie clé publique, déployer la configuration serveur approuvée, retirer l'arrêt global pour lire le runtime Vault validé, puis ouvrir uniquement les établissements validés. Contrôler disponibilité, gestion par lien personnel et synchronisation lors d'une réservation réelle autorisée. Les emails peuvent rester désactivés.

L'installation fermée et l'ouverture à de vrais clients sont donc deux étapes différentes. La préparation est testable ; l'ouverture officielle reste conditionnée aux clés anti-abus, à la configuration réelle et aux autorisations de publication et de base partagée.

## Repli

Fermer les nouvelles demandes dans les paramètres de l'établissement conserve normalement la gestion de ses liens existants. En cas d'incident général, `RM015_ENABLED=false` coupe immédiatement toute l'API publique, y compris ces liens : rétablir le service après diagnostic. Ne pas supprimer les tables, clés de déchiffrement ou réservations pour revenir à une interface antérieure. Conserver les migrations additives et les traces ; restaurer uniquement le paquet statique précédemment validé si nécessaire.

## Captures

Les vues salariées viennent de la vraie pile locale fictive. Les vues officielles fermées viennent du paquet généré. Les vues anti-abus portent un fournisseur simulé ; les vues QR sont une fixture technique du composant de partage, pas une maquette complète du tableau de bord.

| Format | Tables après création | Réception après changement | Portail officiel fermé | Vérification simulée |
| --- | --- | --- | --- | --- |
| Mobile 390 | [Capture](preuves/rm015-production-20261121/web-today-tables-390.png) | [Capture](preuves/rm015-production-20261121/web-modified-reception-390.png) | [Capture](preuves/rm015-production-20261121/production-closed-390.png) | [Capture](preuves/rm015-production-20261121/production-verification-390.png) |
| Tablette 768 | [Capture](preuves/rm015-production-20261121/web-today-tables-768.png) | [Capture](preuves/rm015-production-20261121/web-modified-reception-768.png) | [Capture](preuves/rm015-production-20261121/production-closed-768.png) | [Capture](preuves/rm015-production-20261121/production-verification-768.png) |
| PC 1440 | [Capture](preuves/rm015-production-20261121/web-today-tables-1440.png) | [Capture](preuves/rm015-production-20261121/web-modified-reception-1440.png) | [Capture](preuves/rm015-production-20261121/production-closed-1440.png) | [Capture](preuves/rm015-production-20261121/production-verification-1440.png) |

