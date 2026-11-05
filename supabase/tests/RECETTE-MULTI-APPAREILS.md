# RestoManager V3 — recette de synchronisation et concurrence

Environnement : branche `feature/supabase-auth-realtime-v3`, préversion Supabase. Ne pas publier sur la branche GitHub Pages officielle avant validation.

## Préparation
- Utiliser deux navigateurs/profils séparés, ou un navigateur normal et un privé.
- Connexion A : `reception`. Connexion B : `admin-fb`. Ne jamais partager les mots de passe.
- Vérifier que les deux comptes sont actifs et confirmés dans Supabase.
- Utiliser des dates futures et des clients fictifs. Supprimer les données de test ensuite.
- Ouvrir `login.html` depuis une **préversion hébergée** de la branche ; ouvrir le fichier local directement ne suffit pas pour les modules ES.
- La branche n'a pas encore d'URL de préversion vérifiée : ne pas utiliser le site officiel comme environnement de test.

## Cas de recette (à réaliser, pas encore validés)

| ID | Manipulation | Résultat attendu |
|---|---|---|
| AUTH-01 | Se connecter en Réception | Page réservations accessible ; lien admin masqué |
| AUTH-02 | Ouvrir directement `room-config.html` avec Réception | Configuration inaccessible |
| AUTH-03 | Se connecter en F&B | Page réservations et lien administration accessibles |
| AUTH-04 | Déconnexion puis rechargement | Les données ne s'affichent plus sans connexion |
| SYNC-01 | A réserve une table à 19h, B observe | Réservation visible sur B sans actualisation manuelle |
| LOCK-01 | A sélectionne une table ; B sélectionne la même table au même créneau | B reçoit un refus tant que le blocage de A est valide |
| LOCK-02 | A abandonne ; B réessaie | B peut bloquer la table |
| LOCK-03 | A laisse le formulaire ouvert plus de 3 minutes, onglet actif | Le blocage se renouvelle ; contrôler les horodatages serveur |
| LOCK-04 | A ferme l'onglet ; B réessaie après expiration | B peut bloquer la table après 3 minutes |
| ATOMIC-01 | A et B confirment simultanément la même table et le même horaire | Une seule réservation confirmée |
| ROOM-01 | Deux réservations de même chambre avec horaires qui se chevauchent | La seconde est refusée |
| FUSION-01 | Tables sans lien de fusion autorisé | Suggestion et confirmation multi-tables refusées |
| FUSION-02 | F&B autorise une fusion de deux tables de même salle | La suggestion et confirmation deviennent possibles |
| FUSION-03 | F&B déplace une table dans une autre salle | Ses anciennes fusions sont supprimées |
| AUTH-05 | Utilisateur anonyme appelle les RPC de réservation | Refus |
| AUTH-06 | Réception tente une écriture directe des salles ou fusions | Refus par RLS |
| UX-01 | Tester sur mobile, tablette, ordinateur | Aucun débordement ou bouton inaccessible |

## Critères bloquants
- Aucun doublon de réservation sur une table ou une chambre au même créneau.
- Aucune action F&B accessible à la Réception.
- Aucune donnée métier accessible à une session non authentifiée.
- Aucune fuite du jeton privé de possession d'un blocage.
- Pas de retour au stockage local comme source de vérité.
- Si Realtime est indisponible, afficher clairement l'erreur et ne jamais prétendre que les données sont synchronisées.
- Vérifier que la réservation atomique et les fonctions SECURITY DEFINER ont été auditées avant publication.

## État
Checklist préparée, **tests non exécutés**. L'intégration de l'interface V3 complète, le déploiement d'une préversion indépendante et les essais multi-appareils restent nécessaires avant l'annonce « V3 prête à tester ».
