# Refonte RestoManager — interface de service V3

Branche : `feature/refonte-service-responsive-v3`. Base : `codex/mission-3-floor-editor-2d-3d`.

## Décisions produit validées

- Conserver l'identité RestoManager existante : fond clair, bleu marine, accents dorés, logo et typographie cohérents.
- Mettre de côté **dans l'interface de service** la 3D, le mobilier et les commandes avancées de l'éditeur. Ne pas supprimer leur code, leurs données ni les migrations.
- Remplacer le plan miniature comme vue de service principale par une **grille de cartes rectangulaires responsive** : deux colonnes sur téléphone si lisibles, trois à cinq sur tablette selon la largeur, davantage sur ordinateur. Pas de défilement horizontal ni de débordement.
- Chaque carte affiche sans ouverture : **numéro**, **statut textuel**, nombre de personnes et/ou capacité min–max, heure d'arrivée prévue si pertinente. Ne jamais se reposer sur la couleur seule.
- États : LIBRE, ATTENDUS, ARRIVÉS, PRÉSENTS, INDISPONIBLE. PARTIS s'applique à la réservation terminée dans l'historique ; la table elle-même redevient LIBRE si aucun autre blocage ne s'applique.
- Fiche table en panneau inférieur mobile, actions contextuelles rapides : enregistrer l'arrivée, installer, libérer avec confirmation, annuler une libération après vérification des conflits.
- Création d'un **client de passage sans réservation** : nombre de couverts obligatoire, nom facultatif, table ou fusion compatible, horaire et durée ; même contrôle de conflits que les réservations.
- Ajout et suppression de tables sans plafond arbitraire ; numéro unique dans la salle ; capacités minimum et maximum configurables, entiers positifs et min <= max. Ne pas supprimer une table affectée à des réservations actives ou futures ; préserver l'historique.
- Fusion temporaire de deux tables ou plus : somme des capacités par défaut, capacité effective modifiable et validée ; verrouiller toutes les tables membres pendant la réservation, séparer sans perte de données. Les fusions futures ne doivent pas bloquer le présent.
- Tableau de bord dérivé de l'état réel : clients présents, attendus, arrivés, places disponibles **maintenant**, capacité totale, tables libres/occupées, couverts servis, taux d'occupation. Le calcul de disponibilité future est distinct et dépend du créneau et des fusions.
- Navigation mobile à accès direct : Service, Réservations, Tables, Gestion ; recherche client/chambre/table, filtre par salle, panneau de fiche sans quitter la liste.

## Règles de sécurité et migration

1. Inventorier les structures persistées, les statuts et les références de tables avant toute modification.
2. Garder les IDs de table stables ; éviter toute réinitialisation du stockage local.
3. Ne jamais compter deux fois les capacités des tables fusionnées.
4. Ne pas compter les places vides d'une table occupée comme des places librement attribuables.
5. Lors d'une annulation de libération, vérifier les réservations concurrentes et refuser avec explication en cas de conflit.
6. Conserver le moteur de réservation existant et ses contraintes (durée, horaires, collisions) jusqu'à adaptation testée.
7. Ne pas changer la branche de déploiement GitHub Pages ni fusionner dans main sans validation.

## Ordre d'implémentation

- Lot A : grille responsive et statuts textuels, fiches de table et navigation.
- Lot B : gestion tables illimitée, min/max, suppression sécurisée.
- Lot C : clients de passage et fusion de tables avec validation des créneaux.
- Lot D : statistiques temps réel et disponibilité par horaire.
- Lot E : tests Android/tablette/desktop, clavier, lecteurs d'écran, persistance et régressions.

## Critères de validation

- À 360 px, numéros et libellés des cartes restent lisibles sans zoom ni débordement.
- L'état de chaque table est explicite même en niveaux de gris.
- Les clients de passage apparaissent dans les couverts et l'historique.
- La fusion empêche les doubles attributions.
- L'annulation d'une libération ne crée jamais de conflit.
- Une table supprimée ne détruit aucun historique.
- Les statistiques sont recalculées à chaque transition de statut.
- L'éditeur 2D/3D reste récupérable ultérieurement.

## Périmètre fonctionnel obligatoire — validation du 3 novembre 2026

**Aucune régression fonctionnelle acceptée** : la V3 remplace l'interface, pas les fonctionnalités métier. Ne pas considérer le projet terminé tant que les fonctions existantes et nouvelles ne sont pas disponibles depuis la V3.

### Réservations
- Créer, modifier, annuler et supprimer une réservation avec confirmation, et préserver les historiques selon la politique de conservation.
- Date, heure, nombre de couverts, nom/chambre, origine client, tables affectées, notes et états.
- Recherche rapide client, chambre, numéro de table ; historique, no-show et clôture de service.
- Contrôle des chevauchements, chambre déjà réservée sur le même créneau, horaires de fermeture et durée par défaut 90 minutes.

### Tables et salles
- Ajouter, éditer, renuméroter et supprimer une table ; pas de plafond arbitraire.
- Configurer capacité minimale et maximale, salle, état indisponible, et préserver les références stables des réservations.
- Ajouter, renommer et supprimer une salle avec garde-fous sur les tables et réservations.
- Fusionner et séparer plusieurs tables ; réserver sur la fusion, capacité cumulée et contrôles d'occupation.

### Service et clients de passage
- Enregistrer les arrivées, installer, libérer, annuler la libération après vérification de conflits.
- Clients de passage : nom facultatif, nombre de couverts obligatoire, table(s) compatibles, contrôle des prochaines réservations et durée estimée.
- États explicites sur chaque carte : LIBRE, ATTENDUS, ARRIVÉS, PRÉSENTS, INDISPONIBLE ; PARTIS dans l'historique.

### Disponibilité et indicateurs
- Sélectionner date et créneau pour consulter les tables réellement disponibles.
- Proposer des horaires alternatifs de 30 à 40 minutes quand le créneau est complet.
- Indicateurs distincts pour capacité physique, places attribuables immédiatement, disponibilité à une heure future, présents, attendus, arrivés, couverts servis, tables occupées.
- Recalculer après chaque changement, sans double comptage des fusions.

### Livraison et tests
- Remplacer les liens vers l'ancienne interface par des parcours V3 fonctionnels.
- Vérifier mobile, tablette et ordinateur ; clavier, tailles d'écran et lisibilité.
- Tests automatisés : collisions de créneaux, durée, chambres, capacité min/max, fusion, passages, libération et restauration, suppression et persistance.
- Ne pas déployer sur la branche publique avant validation.

## Clôture du service et historique — exigences obligatoires

- Action « Clôturer le service » accessible dans la nouvelle interface, avec date du service, synthèse chiffrée et confirmation explicite.
- Avertissement si des clients sont encore présents ou arrivés mais non installés ; aucune suppression silencieuse.
- Archivage de toutes les réservations du service : réservées, confirmées, arrivées, installées, terminées, annulées, absentes, libérées et clients de passage.
- Clôture idempotente : ne jamais dupliquer les réservations si l'action est répétée ; préserver identifiants et liens vers les tables.
- Conserver les réservations des jours suivants et les historiques existants.
- Historique filtrable par date, client, chambre, table et statut, avec détails de chaque réservation.
- Indicateurs historiques : couverts attendus, présents, servis, passages, no-shows, annulations, occupation ; préciser la définition de chaque indicateur.
- Prévoir une stratégie de reprise en cas d'erreur d'écriture ou de données corrompues : ne pas effacer la source avant archivage réussi.
- Tests de non-régression pour clôture répétée, service à cheval sur minuit, historiques existants, clients encore présents et conservation des réservations futures.
