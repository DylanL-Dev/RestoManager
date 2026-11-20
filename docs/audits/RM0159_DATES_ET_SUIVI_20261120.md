# RM-015.9 — Dates du portail et cohérence du suivi

Branche `feature/rm015-public-date-default`, issue de DEV `0d6991be9792735c6b4631c39c7039275d227545`. Sauvegarde poussée avant modification : `backup/rm015-before-date-default-20261120`.

## Diagnostic

Le portail présélectionnait systématiquement le lendemain. L’heure 19:00 pouvait donc être proposée à 20:50 : elle appartenait au lendemain. Le contrôle en lecture seule de la réservation signalée sur DEV a confirmé une attribution réelle à la table 2, pour le lendemain, avec le profil Hôtel et l’horaire modifiés bien enregistrés. Aucune réservation réelle n’a été déplacée, supprimée ou corrigée par ce diagnostic.

Les tables et les arrivées du tableau de bord portent sur la journée courante. Une réservation future doit rester exclue de ces indicateurs. De plus, un créneau 20:00–21:00 exclut une arrivée à 21:15. Inclure ces réservations aurait faussé le service courant.

Un défaut visuel complémentaire a été identifié : le calendrier personnalisé ne rafraîchissait pas toujours son libellé lorsque la recherche ou une notification changeait la valeur du champ en JavaScript. Une recherche peut porter sur toutes les dates alors que l’ancien libellé du calendrier affichait encore aujourd’hui. Les cartes ne montraient pas la date du service, et la date de confirmation pouvait être prise pour celle de la venue.

Les déclencheurs de révision et la publication Realtime des réservations, affectations et révisions sont présents sur DEV. Cette inspection ne constitue pas un essai bout en bout du transport Realtime hébergé.

## Corrections

- Pour une nouvelle visite, recherche bornée des disponibilités Midi/Soir d’aujourd’hui, puis de demain si nécessaire. Horloge du serveur convertie en Europe/Paris ; l’heure du téléphone ne décide pas de la journée. Aucun maintien ni réservation créé par cette découverte.
- Aujourd’hui est proposé lorsqu’un créneau reste réservable. Sinon, le passage à demain est annoncé explicitement. Aucune heure n’est cochée automatiquement. Les refus du serveur restent refusés ; un horaire passé le jour même est désactivé même dans une réponse périmée.
- Les libellés « Aujourd’hui » et « Demain » accompagnent les dates exactes. Une date choisie manuellement, une réservation existante et une saisie reprise conservent leur date. Le passage à minuit est traité par une reprise bornée ; une erreur réseau n’invente pas une disponibilité.
- Démonstration alignée sur cette logique de présentation, avec ses seules données fictives.
- Date du service visible sur chaque carte salariée et dans son suivi détaillé, distincte de l’horodatage de confirmation.
- Rafraîchissement explicite des calendriers après recherche, ouverture d’une fiche, notification et synchronisation. Une recherche sur toutes les dates affiche « Toutes les dates ». Aucune émission artificielle d’événement de modification du formulaire.
- Contraste du libellé Hôtel/Extérieur renforcé après détection axe ; vérification en thèmes clair et sombre.
- Version DEV `2026.11.20-rm015.9-dev`, ressources modifiées et cache PWA actualisés.

## Périmètre et sécurité

Aucune migration ni modification d’Edge Function. Aucun changement Supabase partagé, de réglage, d’horaire, de droits ou de données métier. Aucun email activé. MAIN, V3 et Supabase PROD sont exclus. La transaction d’attribution de table, l’idempotence, les contrôles d’arrivées, la validation Restaurant à partir de quatre personnes et les protections existantes sont conservés.

## Validation

Les résultats définitifs CI et du déploiement DEV sont consignés dans la Pull Request sur son dernier commit. Les preuves locales sont jointes ci-dessous.

- Tests unitaires : `npm test`, 66 fichiers réussis ; sept nouveaux cas couvrent le choix initial, le serveur, demain, minuit, les deux changements d’heure, le réseau et les libellés.
- Syntaxe : 200 fichiers sans erreur. Builds publics : 8 ressources de démonstration, 18 ressources connectées, sans dashboard ni secret dans les artefacts publics.
- Démonstration : 13 scénarios réussis, aux sept largeurs, avec clavier, focus, erreurs, reprise, modification, annulation et absence d’accès interne.
- Parcours connecté ciblé : **10 scénarios et 20 audits axe réussis**, sans requête extérieure ni tâche restante ; formats 360, 390, 430, 768, 1024, 1440 et 1920 ; horloge serveur indépendante du navigateur, aujourd’hui à 20:50, bascule explicite à demain, absence de présélection et reprise d’une date choisie.
- Cohérence salariée : création Web avec attribution SQL, révision serveur, table attendue et deux couverts du jour ; modification Extérieur vers Hôtel, chambre et heure ; déplacement au lendemain, retrait des indicateurs du jour, recherche toutes dates et ouverture par notification. Deux sessions Restaurant/Réception, trois formats. Résultats détaillés dans `results.json`.

Les scénarios connectés utilisent le vrai gestionnaire HTTP et PostgreSQL 17 jetable `--network none`. La modification salariée appelle le véritable RPC sécurisé. Le transport entre les deux pages est une fixture de notification qui recharge un instantané SQL réel ; ce test ne prétend pas exercer le service Realtime hébergé. La validation Realtime locale existante fait aussi partie de la campagne CI. Les identités, chambres et restaurants capturés sont fictifs. Aucune réservation fictive créée dans une base partagée, aucun essai avec de vrais employés revendiqué. Les audits axe ne remplacent pas une recette humaine sur appareils physiques et lecteur d’écran.

## Captures comparables

| Format | Aujourd’hui encore réservable | Demain annoncé | Recherche et date du service |
| --- | --- | --- | --- |
| Mobile 390 | [Voir](preuves/rm0159-20261120/initial-today-390.png) | [Voir](preuves/rm0159-20261120/initial-tomorrow-390.png) | [Voir](preuves/rm0159-20261120/calendar-coherence-390.png) |
| Tablette 768 | [Voir](preuves/rm0159-20261120/initial-today-768.png) | [Voir](preuves/rm0159-20261120/initial-tomorrow-768.png) | [Voir](preuves/rm0159-20261120/calendar-coherence-768.png) |
| PC 1440 | [Voir](preuves/rm0159-20261120/initial-today-1440.png) | [Voir](preuves/rm0159-20261120/initial-tomorrow-1440.png) | [Voir](preuves/rm0159-20261120/calendar-coherence-1440.png) |

## Recette sur Render DEV

Après déploiement, ouvrir [le clone DEV](https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html) et accepter la mise à jour en ayant enregistré toute saisie. Vérifier la version `2026.11.20-rm015.9-dev`.

1. Depuis Gestion → Réservations en ligne, ouvrir le lien client. Vérifier le jour écrit sous la date, l’annonce éventuelle de demain et l’absence d’heure cochée. Ne pas confirmer d’exercice dans les données partagées.
2. Choisir une date ultérieure, revenir en arrière : elle doit rester choisie. Utiliser la démonstration pour les exercices complets.
3. Dans Réservations, rechercher un nom existant : le calendrier doit afficher « Toutes les dates » et chaque carte la véritable date de service.
4. Ouvrir une réservation par sa notification : le calendrier et sa fiche doivent indiquer la même date.
5. Pour un service futur, vérifier la réservation dans sa journée. Le tableau des tables du jour ne doit pas la compter comme attendue aujourd’hui. Pour changer réellement sa journée, utiliser une modification explicite après vérification du besoin réel du client.

Aucune action ne déplace automatiquement les réservations déjà enregistrées au lendemain. Le déploiement frontend n’exige ni migration, ni redéploiement de l’API, ni activation d’email.
