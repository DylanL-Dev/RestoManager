# RM-005 — préparation proposée, aucun développement engagé

**Candidat à confirmer par le responsable après clôture de RM-AUDIT-01.** Le registre ne comporte pas encore de périmètre RM-005 approuvé. La demande existante la plus explicite est [l'issue #3](https://github.com/DylanL-Dev/RestoManager/issues/3) : horaires par restaurant, clôture automatique et changement de journée configurables. Le README reprend ce besoin pour les restaurants nocturnes.

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
