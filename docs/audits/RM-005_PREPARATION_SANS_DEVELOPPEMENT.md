# RM-005 — mise à jour groupée : horaires et liste des réservations (cadrage, aucun développement engagé)

**Périmètre groupé demandé et approuvé par le responsable le 10/11/2026 : intégrer dans RM-005 les horaires par établissement, l'amélioration du message d'heure invalide et la refonte de la liste des réservations.** Le développement et la publication restent à effectuer et à valider séparément. La demande existante la plus explicite est [l'issue #3](https://github.com/DylanL-Dev/RestoManager/issues/3) : horaires par restaurant, clôture automatique et changement de journée configurables. Le README reprend ce besoin pour les restaurants nocturnes.

Le contexte initial de cette issue évoque un changement de journée à 01:00. Il est historique : RM-001 impose désormais la cohérence à **00:00 Paris**. Une nouvelle règle de journée ne doit pas réintroduire ce décalage sans spécification et validation explicites.

## Périmètre fonctionnel à faire valider

- Conserver les débuts/fins de réservation des services et leur configuration par établissement.
- Distinguer heure de clôture et journée affichée ; définir explicitement le comportement des services franchissant minuit.
- Permettre une clôture automatique configurable avec rattrapage serveur et clôture manuelle conservée ; ne pas clôturer silencieusement une réservation active.
- Présenter aux collaborateurs une prévisualisation compréhensible des dates et réglages ; réserver la modification au rôle Restaurant autorisé et définir la lecture Réception.
- Conserver les dates/heures réelles des réservations et l'historique. Aucun recalcul rétroactif implicite.


## Retour terrain Réception — 10/11/2026 (à inclure dans le prochain incrément de validation des horaires)

- Lors de la **modification d’une réservation existante**, un horaire saisi hors de la plage autorisée est actuellement insuffisamment signalé à l’utilisateur Réception.
- Harmoniser avec la **création d’une réservation** : champ heure en état d’erreur bien visible (rouge, icône Lucide), message explicite et accessible précisant l’heure saisie et les plages actuellement autorisées, en tenant compte de la configuration du restaurant et du service sélectionné.
- Appliquer le même comportement sur les formulaires de modification **Réception et Restaurant**, sur mobile, tablette et PC, sans perturber les autres champs ni supprimer les notes/allergies déjà saisies.
- Empêcher l’enregistrement d’une heure invalide **côté interface et côté serveur** ; ne pas considérer le seul encadrement rouge comme une protection métier. Le cas des horaires après minuit doit suivre le futur contrat RM-005.
- Tests d’acceptation : avant ouverture, entre services, après dernière réservation autorisée, exactement aux bornes, après minuit pour un établissement nocturne ; correction de l’heure puis enregistrement réussi ; aucune perte de saisie ou de réservation.
- **Statut : demande enregistrée pour cadrage, pas encore développée, ni testée, ni publiée.** La correction d’accès initialement constatée sur le PC Réception était une erreur de frappe résolue : ne pas la confondre avec ce défaut d’affichage.

## Volet B — Refonte de la liste des réservations (demande validée pour RM-005)

**Intention terrain :** la liste Réservations actuelle affiche de grandes cartes verticales et disperse les informations, ce qui oblige à faire défiler et ralentit la lecture sur les PC de Réception et Restaurant. La nouvelle maquette est une **référence de principe**, pas une spécification figée des statuts, icônes ou chiffres.

- Sur PC : **tableau compact, une ligne par réservation**, colonnes heure, client/chambre, couverts, table(s), indicateurs, statut et actions ; en-tête et colonnes bien alignés, tri et recherche rapides.
- Sur tablette et smartphone : adaptation responsive sans tableau horizontal illisible ; cartes compactes ou lignes reconfigurées, boutons accessibles au tactile, informations essentielles prioritaires.
- **Notes** : icône Lucide reconnaissable, aperçu au clic/toucher (et au survol sur PC en option) ; note complète dans la fiche. Ne jamais perdre de texte lors d'une modification concurrente.
- **Allergies/intolérances** : signalement distinct, très visible et accessible, avec libellé textuel explicite et détail au clic ; ne jamais dépendre de la couleur seule, ni cacher une information critique au simple survol. Un indicateur d'absence de donnée ne signifie pas « aucune allergie ».
- Ligne ouvrant la fiche détaillée, menu « ⋯ » pour les actions secondaires, sans multiplication de gros boutons ; les actions et contrôles serveur restent conformes aux rôles Réception et Restaurant.
- Filtres cohérents avec les **vrais statuts métier** (attendus, installés, terminés, tous) et compteurs non ambigus ; conserver les accès à la recherche et au suivi existants.
- Préserver les réservations, leurs dates, l'historique, les affectations, les notes, les allergies, la synchronisation Realtime et les fusions ; ne pas créer de statut nouveau parce qu'il figurait dans une image illustrative.
- Vérification comparative avant/après sur écran de Réception PC, Restaurant PC, tablette et téléphone ; clavier, lecteurs d'écran, navigation tactile, débordement horizontal et performance avec longue liste.

## Volet C — Client de passage : choix de table avant installation (retour terrain 10/11/2026)

**Anomalie actuelle rapportée :** le parcours « Installer un passage » associe trop tôt la création du passage à un état « installé / présent ». Le personnel doit pouvoir proposer au client **au minimum deux tables réellement disponibles** (standard établissement) et changer la table pressentie **avant** qu'il soit effectivement installé.

### Comportement cible à spécifier et tester

1. À l'arrivée d'un client sans réservation, l'équipe **Restaurant uniquement** indique les couverts et accède au choix de table ; afficher au moins **deux options compatibles lorsque la disponibilité réelle le permet**. Ne jamais inventer une seconde option si une seule table est libre ; expliquer clairement la disponibilité limitée.
2. L'utilisateur peut consulter ou changer les propositions (table simple ou fusion compatible) sans inscrire prématurément « présent/installé », ni enregistrer une fausse heure d'installation. Réutiliser les contrôles de capacité, créneau et disponibilité du moteur de réservation.
3. La simple sélection d'une table ne doit **pas** être assimilée à l'installation. Distinguer état de **préparation/sélection temporaire** et installation définitive sans réintroduire le statut « arrivé » supprimé du flux métier. Un maintien de courte durée peut être envisagé pour empêcher une collision, mais doit expirer ou être libéré à l'abandon ; valider le modèle exact avant de coder.
4. Au clic sur **« Installer le passage »**, revérifier atomiquement la disponibilité côté serveur ; seulement alors créer/finaliser l'objet métier dans son état installé, enregistrer l'heure réelle d'installation, occuper la table et synchroniser Restaurant/Réception.
5. Pouvoir abandonner le parcours sans créer de passage « fantôme », sans laisser de table occupée ou verrou bloqué ; présenter clairement les changements de disponibilité intervenus pendant la sélection.
6. Ne pas donner à la Réception le droit d'installer un passage, de choisir manuellement une table ou de libérer les tables. Garder l'interface cohérente avec les formulaires et icônes Lucide existants.

**Tests d'acceptation DEV :** 1/2/3 propositions disponibles, refus de table incompatible, changement de table avant confirmation, deux comptes concurrents sur une même table, abandon/expiration du maintien, installation une seule fois, heure réelle correctement enregistrée, aucune ligne « présent » avant validation, affichage Realtime et contrôle des permissions serveur/RLS. Tester sur PC/tablette/mobile et avec une fusion de tables autorisée.

**Statut :** ajout au périmètre groupé RM-005 pour étude technique et validation ; aucun code métier modifié, aucune publication V3/MAIN/production.

## Politique de livraison groupée RM-005

Une seule **évolution de produit** et une livraison finale coordonnée, mais **commits de travail distincts et traçables** pour Volet A (horaires / règles / serveur), Volet B (liste UI), Volet C (passage et choix de table), tests et documentation. Ne pas confondre « une seule grosse mise à jour » avec « un seul commit géant » : le diagnostic et le rollback doivent rester possibles.

Ordre : (1) audit des dépendances, (2) contrat horaires/minuit et garde-fous serveur, (3) validation des heures dans les formulaires, (4) refonte compacte de la liste sur DEV, (5) parcours passages et choix de tables sur DEV, (6) tests unitaires, SQL/RLS, Playwright et recette manuelle des deux rôles sur PC/tablette/mobile, (7) **demande de validation explicite avant toute publication**.

La V3 officielle, MAIN et Supabase production restent inchangés durant le développement. Un push sur la branche DEV peut déclencher un déploiement automatique **DEV Render uniquement** ; aucun push de publication V3/MAIN ni migration production sans accord distinct. Toute anomalie bloquante suspend l'ensemble RM-005 ; conserver les possibilités de retour arrière par volet.

## Dépendances et risques

Le modèle `restaurant_hours`, les RPC de clôture, la source serveur de temps/révision, les conversions Europe/Paris, le tableau de service, les filtres de réservation, Realtime, RLS, le cache et la PWA doivent partager le même contrat. Risques principaux : mélange date réelle/journée métier, disparition visuelle d'un client encore installé après minuit, double clôture, rattrapage après coupure, changement d'heure été/hiver, privilèges inter-établissements et anciens onglets conservant une règle précédente.

## Ordre proposé, sans exécution

1. Après clôture de l'audit, faire confirmer que l'issue #3 est bien RM-005 et réduire si nécessaire son premier incrément. Définir les cas minuit, services J+1, clients encore installés, DST et historique avant toute implémentation.
2. Spécifier le contrat de configuration par établissement et les droits Restaurant/Réception ; arrêter les critères d'acceptation sur PC/mobile et deux sessions.
3. Concevoir les prérequis SQL et le rattrapage serveur idempotent sur une base isolée, sans migration partagée.
4. Développer un seul incrément DEV, avec heure serveur et règles communes aux réservations/tables ; préserver RM-001–RM-004.
5. Tester les frontières temporelles, conflits, coupures/reprises, doublons de clôture et isolation de deux établissements ; réaliser ensuite la recette DEV et demander la validation utilisateur.
6. Préparer séparément la livraison et les éventuelles migrations production. Chaque fusion, publication ou application SQL reste à autoriser explicitement.

**Aucune ligne EN COURS DEV de RM-005 n'est ouverte, aucun code métier n'est écrit et aucune migration n'est préparée ou appliquée au titre de RM-005 dans cette mission.**
