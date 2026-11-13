# RestoManager — Feuille de route proposée RM-006
Date : 13 novembre 2026

> **PROPOSITION / NON VALIDÉE / AUCUN DÉVELOPPEMENT RM-006 AUTORISÉ.**
> Cette feuille de route a été préparée après la validation fonctionnelle RM-005 (8/8).
> Elle n'autorise aucune publication sur MAIN, RestoManager-V3 ou Supabase PROD.

## Situation vérifiée
- Aucune branche `rm-006`, PR RM-006 ou issue RM-006 trouvée sur le dépôt au 13/11/2026.
- Le registre de versions DEV ne contient pas encore de RM-006 officielle.
- MAIN et RestoManager-V3 ont divergé (5 commits côté V3 non présents dans MAIN ; 36 commits MAIN absents de V3) : ne pas les fusionner globalement.
- RM-005 couvre déjà : créneaux intelligents, formulaire hôtel/extérieur, synchronisation, passage, planning hebdomadaire, fusions 2–4 tables et Salle Prestige. **Ne pas redévelopper ni renommer ces lots RM-006.**

## Périmètre à arbitrer — hypothèses, pas engagements
| Candidat | Objectif / critère de réussite | Priorité proposée | Contrôle préalable |
|---|---|---|---|
| Historique d'audit lisible « qui a créé/modifié la réservation » | Date, rôle et auteur consultables selon habilitation ; aucune donnée sensible en clair | Haute | Comparer les journaux déjà présents et droits Root/Réception |
| Assistance / signalements | Compteur des tickets encore ouverts exact ; clôture persistante et notifications cohérentes | Haute | Vérifier si les incidents déjà corrigés sont effectivement publiés |
| Robustesse PWA et reconnexion | Empêcher un passage ou une réservation sur snapshot périmé ; rechargement des assets vérifiable | Haute | Étudier les acquis RM-005 pour éviter les doublons |
| Parcours guidé d'accueil | Tutoriel professionnel pour nouveau personnel, avec étapes Réception et Restaurant distinctes | Moyenne | Vérifier le tutoriel déjà intégré et sa couverture réelle |
| Pilotage du service et signalétique | Clarifier alertes d'affluence, retards et libérations ; réduire clics sans supprimer avertissements | Moyenne | Mesurer les parcours et demander une recette sur écrans réels |
| Performance / accessibilité | Temps d'ouverture et stabilité mobile, accessibilité clavier et zones tactiles | Moyenne | Baseline reproductible sur DEV et tests avant/après |

## Exclusions
- Toute fonctionnalité déjà acceptée au titre de RM-005.
- Toute modification de sécurité non justifiée par un test de rôle / établissement.
- Toute migration de données réelles ou copie de la base DEV vers PROD.
- Toute implémentation RM-006 avant validation explicite de son périmètre.

## Découpage proposé
1. **RM-006.A (fiabilité et supervision) :** audit des journaux, assistance et reconnexion, reproductions et correctifs ciblés après accord.
2. **RM-006.B (accompagnement et ergonomie) :** didacticiel et optimisation des parcours réellement manquants, maquettes et recette.
3. **RM-006.C (qualité transversale) :** performances, accessibilité, tests multidispositifs et sécurité.

## Gates / ordre de livraison
1. Préparer les migrations RM-005 sur une base éphémère, sauvegardes et PR ciblées non fusionnées.
2. Décision explicite GO/NO-GO RM-005 par le propriétaire ; publier dans l'ordre validé avec contrôle et rollback.
3. Faire valider le périmètre RM-006 (cette feuille de route est une proposition).
4. Créer alors uniquement les branches et tickets RM-006 autorisés, développer sur DEV et repasser les tests.
5. Présenter RM-006 séparément pour validation et publication future.

**État à la création :** RM-005 recette réussie, préparation production NON clôturée ; RM-006 documentée, périmètre NON VALIDÉ.
