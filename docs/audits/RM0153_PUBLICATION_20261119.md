# RM-015.3 — Réglages, lien public et QR code

Priorité choisie explicitement par le propriétaire : « Finaliser les réglages, le lien public et le QR code du Restaurant ». Suite de l’issue [#173](https://github.com/DylanL-Dev/RestoManager/issues/173), après l’activation technique DEV des PR #186 et #187.

Branche `feature/rm015-publication-tools`, issue de DEV `74e04569b5c47ef5814255544f66a3f7b521d2f3`. Sauvegarde Git distante `backup/rm0153-dev-before-20261119` sur ce même commit. Livraison DEV uniquement ; MAIN et V3 restent inchangées.

## Résultat

Gestion → Réservations en ligne propose un espace « Préparer et partager » : état enregistré du portail, informations manquantes avant ouverture, accès aux réglages, lien public enregistré, copie et QR code PNG. Le tout reste dans les accordéons RM-013, avec les couleurs de RestoManager, les icônes Lucide locales et un affichage mobile/tablette/PC.

| Avant | Après |
| --- | --- |
| Cases et champs sans contrôle de préparation visible | Cinq repères : adresse, personnes, délais, confidentialité/contact, annulation |
| Lien simple en bas des réglages | Adresse enregistrée visible, copie, ouverture et QR code correspondant |
| Pas de QR téléchargeable | PNG calculé localement, avec zone blanche autour du code et marquage DEV |
| Ouverture par simple sauvegarde | Vérification des informations puis confirmation explicite « Oui, ouvrir sur DEV » |
| Fermeture peu expliquée | Confirmation rappelant que les réservations et liens existants restent conservés |
| Bornes de champs parfois différentes du serveur | Mêmes limites : maximum 1–50, horizon 1–180 jours, délai avant venue 0–1440 min, annulation 0–2880 min |

Le Restaurant peut enregistrer une préparation incomplète en gardant le portail fermé. Aucun maximum ni texte juridique officiel n’est créé à sa place. Les champs requis pour l’ouverture sont expliqués et leurs erreurs restent accessibles, y compris dans la rubrique de confidentialité repliée. Un délai enregistré hors des choix habituels, par exemple 75 minutes, est conservé. Le défaut d’une heure ne remplace jamais un réglage existant.

Le lien et le QR utilisent exclusivement le slug **enregistré**. Une saisie non enregistrée ne modifie pas les supports partagés. Un changement d’adresse existante demande une confirmation et conserve le refus serveur tant que des liens clients l’utilisent. Un conflit de version conserve la saisie ; le rechargement des réglages reste explicite.

## Sécurité et données

- Aucune migration nécessaire. Aucun changement de projet, secret, rôle, RLS ou configuration Supabase partagée. Les écritures de paramètres continuent de passer par la RPC existante `rm015_staff_v1`, avec ses contrôles Restaurant/Réception et sa traçabilité.
- Aucune réservation, clôture, demande ou configuration fictive créée dans les données partagées. Toutes les mutations de test sont dans PostgreSQL éphémère, réseau désactivé.
- Réception conserve la consultation et peut actualiser le suivi. Les réglages, l’ouverture et les outils de partage sont réservés au Restaurant. Aucun nouveau droit serveur.
- Changement de compte : suppression du lien/QR affiché et refus du retour tardif d’une copie. État serveur non vérifié : boutons de partage et de modification bloqués ; actualisation encore possible.
- Lien canonique du restaurant uniquement : aucun fragment de gestion, jeton personnel, clé, identifiant salarié, note ou coordonnée client. Aucun service externe de QR, aucune connexion tierce et aucun envoi d’email.
- QR généré avec `qrcode-generator@1.4.4`, copie locale inchangée, licence MIT et SHA-256 vérifiés. `jsqr@1.4.0` et `pngjs@7.0.0` servent uniquement aux tests. Les dépendances sont fixées et enregistrées dans le lockfile.
- Le téléchargement contient un vrai PNG décodable, pas une icône ou une image décorative. Le code n’est pas recouvert par un logo ; le marquage DEV reste hors de sa zone blanche.
- Les nouveaux scripts et le générateur sont dans le cache salarié PWA. Les artefacts publics restent limités à leurs 8/13 fichiers existants. Le service worker attend toujours une mise à jour sûre et protège les formulaires RM-011.

## Validation et preuves

Les résultats locaux, captures et résultats CI finaux sont consignés dans le dossier `preuves/rm0153-20261119` et dans la Pull Request. Les tests couvrent : préparation fermée ; absence d’ouverture avec confidentialité manquante ; annulation au clavier et retour du focus ; ouverture confirmée ; fermeture sans perte de réservation ; lecture du lien client après fermeture ; droits Réception ; version concurrente ; conservation d’une saisie ; copie du dernier lien enregistré ; décodage indépendant des PNG aux sept largeurs ; réseau indisponible ; générateur de QR indisponible ; presse-papiers refusé ; déconnexion pendant une copie ; thèmes clair/sombre.

Largeurs : 360, 390, 430, 768, 1024, 1440, 1920 pixels. Les captures utilisent un restaurant fictif et une API locale : leurs QR sont des exemples, pas des supports à distribuer. Générer le QR de l’établissement depuis Gestion sur Render DEV. Aucun essai avec de vrais employés ou clients n’est revendiqué.

## Résultats locaux

- 61 fichiers de tests unitaires passent, dont six nouveaux cas sur les limites, la préparation fermée, la séparation des restaurants, les liens sans jeton personnel et le décodage QR.
- 182 fichiers JavaScript passent le contrôle syntaxique. Builds publics : 8 et 13 fichiers, sans nouveau composant salarié dans les artefacts publics.
- Campagne connectée complète : 21 scénarios, 42 audits axe réussis. Campagne complémentaire de publication après les derniers ajustements : 7 scénarios, 15 audits axe, incluant le thème sombre. Zéro requête externe ; toutes les mutations métier dans PostgreSQL éphémère.
- Le workflow CI exécute la campagne complète sur la source finale : 21 scénarios et 43 audits avec le contrôle sombre ajouté. Son résultat et le déploiement Render sont consignés dans la description finale de la Pull Request.

| Format | Préparation fermée | Lien et QR enregistrés |
| --- | --- | --- |
| Mobile 390 | [Voir](preuves/rm0153-20261119/publication-prepare-390.png) | [Voir](preuves/rm0153-20261119/publication-390.png) |
| Tablette 768 | [Voir](preuves/rm0153-20261119/publication-prepare-768.png) | [Voir](preuves/rm0153-20261119/publication-768.png) |
| PC 1440 | [Voir](preuves/rm0153-20261119/publication-prepare-1440.png) | [Voir](preuves/rm0153-20261119/publication-1440.png) |

[Thème sombre PC](preuves/rm0153-20261119/publication-dark-1440.png). Pour comparaison : [anciens réglages mobile](preuves/rm0152-activation-20261119/restaurant-settings-390.png). Les noms, adresses et QR de ces captures sont fictifs et isolés.

## Fichiers principaux

- `service-v3-publication-model.js` : limites, validation, préparation, URL canonique et matrice QR.
- `service-v3-publication.js` : panneau de publication, copie, export PNG et protection du changement de contexte.
- `service-v3-public-booking.js/.css` : formulaire, confirmations, erreurs accessibles et styles clairs/sombres.
- `vendor/`, package/lockfile : générateur local, licence et versions exactes ; lecteurs PNG/QR utilisés par les tests seulement.
- `v3-connected.html`, `sw.js`, `app-release.json` : chargement des ressources, cache PWA et nouveauté DEV.
- Tests unitaires, intégration Playwright et assertion de version du cache RM-011 : couverture et non-régressions.

## Recette Render DEV

1. Ouvrir https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html avec son compte Restaurant DEV. Accepter la mise à jour proposée après avoir enregistré ses saisies en cours.
2. Gestion → Réservations en ligne : consulter « Préparer et partager ». Le badge reflète les réglages enregistrés, pas une case encore en cours de modification.
3. Compléter les véritables informations de l’établissement et enregistrer en laissant « Accepter les réservations en ligne » décoché pour préparer le portail sans l’ouvrir. Ne pas saisir des données fictives dans l’établissement partagé.
4. Une adresse enregistrée fait apparaître le lien et le QR. « Copier le lien » et « Télécharger le QR code » utilisent cette adresse, même pendant une autre saisie non enregistrée. Le PNG porte le marquage DEV.
5. Pour une ouverture intentionnelle sur DEV, renseigner les informations requises, cocher l’acceptation, enregistrer puis confirmer. Les horaires et le pourcentage d’arrivées restent ceux de Gestion. Les emails restent désactivés.
6. Pour les réservations d’essai, utiliser la démonstration isolée ou les tests locaux/CI ; ne pas créer de réservations fictives dans DEV partagé.

## Limites conservées

Ce lot prépare le partage sur DEV ; il ne publie aucun portail officiel sur MAIN/V3/PROD. Les mentions juridiques, la conservation, le domaine public et un éventuel prestataire email restent des décisions de l’établissement. Un QR marque une URL et ne certifie pas que le canal est ouvert ni qu’un créneau est disponible. La disponibilité et la réservation sont toujours vérifiées par le serveur. Les notifications, demandes de groupe et le maintien d’une heure suivent les mécanismes déjà livrés.

## Corrections de la première campagne CI

La première campagne n’est pas comptée comme réussie : le workflow unitaire historique n’installait pas les dépendances de décodage QR et le numéro de version de l’entrée HTML n’avait pas encore été aligné sur le nouveau manifeste. Le workflow installe désormais le lockfile avec npm ci. La page et le manifeste portent la même version ; un contrôle unitaire vérifie aussi leur canal et leur identité avant livraison. Les protections de preuve de publication RM-014 restent inchangées.

Après correction : **280 tests unitaires passent**, ainsi que les **14 parcours RM-014** (deux rôles × sept largeurs), incluant navigation vers les nouveautés, états de lecture, historique, clavier, contrastes et thème sombre.
