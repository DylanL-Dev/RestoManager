# RM-016 — Conception pédagogique et inventaire réel

Issue [#175](https://github.com/DylanL-Dev/RestoManager/issues/175), mission explicitement lancée par le propriétaire le 17/11/2026. Branche `feature/rm016-learning-center` issue de DEV `32608cd114a7da8b0cbff537ca244a59aaa4658e`, sauvegarde distante `backup/rm016-dev-before-20261117`. Aucune publication officielle autorisée dans cette mission.

## Diagnostic et choix

La visite précédente comprend six étapes Réception et sept Restaurant. Elle décrit surtout des écrans, conserve un unique marqueur « vu » dès son lancement et à la fermeture, ne propose ni recherche d’aide ni exercice. La carte fixe peut gêner le repère montré. Elle utilise déjà la navigation protégée ; cette protection est conservée.

Le nouveau centre d’aide possède deux niveaux, un choix d’exercice et une recherche de questions courantes. Les autres parcours et le lexique sont repliés. Le bouton Aide reste disponible depuis chaque écran, et Gestion conserve son accordéon Didacticiel & aide. Les deux niveaux utilisent les mêmes règles métier : le niveau rapide retire seulement les explications détaillées.

Les guides restent une **lecture accompagnée des vrais écrans**. Un repère indique le contrôle ; la carte se place à côté, au-dessus ou au-dessous. Les étapes de navigation demandent de cliquer/toucher le véritable bouton. Les autres expliquent un seul geste ou un seul concept, avec un résultat attendu et une aide « Je n’ai pas compris ». Une action principale permet de poursuivre. Précédent, Quitter, Recommencer et reprise restent disponibles.

L’employé apprend les gestes en les pratiquant dans trois exercices séparés du service : retrouver/accueillir la chambre fictive 204, créer une réservation fictive et lire/retirer/restaurer une notification fictive. Les dates d’exemple sont en 2032 pour distinguer ces scénarios du service réel.

## Inventaire vérifié avant rédaction

| Fonction | Restaurant | Réception | Source faisant foi |
| --- | --- | --- | --- |
| Créer une réservation hôtel/extérieur | Oui | Oui | `v3-supabase-booking.js`, formulaire `bookingForm`, garde authentifiée |
| Confirmer une réservation | Pas d’étape préalable imposée à l’installation | Confirmer sur les statuts admissibles | `service-v3-reservations.js`, filtre des actions et `action()` |
| Installer un client attendu | « Installer à table » dans Plus d’actions ; contrôles et avertissements existants conservés | Non | `service-v3-reservations.js`, règles du rôle et garde serveur existante |
| Choisir/changer manuellement la table | Selon l’état et les disponibilités | Non ; attribution proposée par l’application | `v3-connected-auth.js`, `service-v3-table-choices.js`, éditeur |
| Modifier / retard / annuler | Selon l’état | Selon l’état | `service-v3-reservations.js`, permissions existantes |
| Déclarer absent / terminer / libérer | Après vérification et contrôles existants | Non | Actions autorisées et `service-v3-quick-release.js` |
| Passage | Installation immédiate, disponibilités vérifiées | Suivi en lecture seule | `service-v3-walkin-fast.js`, `reception-service-overview.js` |
| Horaires/salles/tables/fusions/durée | Rubriques autorisées RM-013 | Horaires en lecture seule, apparence | `service-v3-screens.js`, `v3-connected-auth.js` |
| Assistance | Oui | Oui | `service-v3-feedback.js` ; envoi inchangé |
| Notifications / nouveautés / mise à jour | Selon ses sources | Selon ses sources | `service-v3-reminders.js`, modèle RM-014 et `service-v3-app-release.js` |
| Régularisation RM-012 | Seulement si capacité serveur présente | Non | Module RM-012 et `service_regularization=1` |
| RM-015 en ligne | Masqué | Masqué | Fonction non publiée, registre `released:false` |

« Confirmé » et « Attendu » ne s’excluent pas. Le Restaurant peut installer directement un client attendu sans confirmation préalable de sa réservation. Une durée écoulée ne prouve ni départ ni absence. Le guide ne remplace ni les contrôles d’autorisation ni les confirmations métier nécessaires.

Le texte initial de #175 décrit RM-012 comme future. Elle a depuis été effectivement publiée par les PR [#178](https://github.com/DylanL-Dev/RestoManager/pull/178)/[#179](https://github.com/DylanL-Dev/RestoManager/pull/179). Son guide est donc prêt mais n’apparaît qu’avec la capacité serveur effective. RM-015 reste indisponible. Son aide publique devra être développée séparément du centre authentifié et ne doit jamais charger les guides du personnel.

## Protection de l’apprentissage

- Les guides utilisent `RestoScreens.request()` et n’acceptent jamais à la place de l’employé une sortie de saisie. Une sortie refusée conserve l’écran et tous les champs ; le guide explique comment reprendre.
- Pendant la lecture, les vrais formulaires restent intacts et sont temporairement inertes ; leur état antérieur est restauré à la sortie. La capture des clics et soumissions bloque les mutations du service pendant le guide. Aucune fonction métier de création/confirmation/installation/libération n’est appelée par le didacticiel.
- L’entraînement est un document `srcdoc` dans une iframe `sandbox="allow-scripts"`, sans accès à l’origine du parent, sans formulaires, fenêtres externes ni réseau (`default-src 'none'`, `form-action 'none'`, `base-uri 'none'`). Il ne reçoit ni client réel, ni jeton d’authentification, ni objet Supabase. Ses boutons n’ont aucun lien avec les gestionnaires des vrais formulaires.
- Le seul message accepté du simulateur signale la fin d’un exercice. La fenêtre source, le jeton éphémère et le scénario sont vérifiés ; ce message écrit seulement la progression locale. Il ne peut déclencher aucune navigation ni opération du service.
- Aucune migration, modification des données partagées, réservation fictive réelle ou écriture Supabase DEV/PROD. Aucun changement de connexion, de dépendance ou de garde métier.

## Progression et gouvernance

Le registre `service-v3-tutorial-model.js` centralise identifiants, versions, rôles, écrans, repères, textes, notions de base et disponibilité. La progression locale est isolée par utilisateur, établissement, rôle, niveau et version de parcours. Une invitation reportée n’achève aucun parcours. Terminer est une action explicite ; un parcours revu puis interrompu peut être repris. En cas de stockage indisponible, l’aide reste utilisable et explique la limite de mémorisation. Aucun nom de client ou contenu de formulaire n’est conservé dans cette progression.

Une mise à jour de contenu significative incrémente la version du parcours. Ajouter/changer un contrôle exige : vérifier ses droits et sa sémantique dans l’implémentation, modifier le registre, exécuter les contrôles de repères sur le vrai DOM pour les deux rôles, puis la recette de débutant. Un repère manquant dans l’utilisation est expliqué sans blocage ; un repère manquant dans la fixture complète fait échouer les tests pour signaler une dérive.

Les liens « Comprendre cette nouveauté » des versions RM-014/RM-012/RM-016 utilisent l’historique déjà vérifié par l’application. L’aide permanente n’ajoute pas d’alerte métier ni de message répété à chaque connexion. L’invitation initiale est facultative et distincte des versions des cours.
