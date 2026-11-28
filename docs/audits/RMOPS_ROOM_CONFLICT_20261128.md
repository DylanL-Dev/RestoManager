# RM-RELEASE-03 B2 — Correctif du doublon de chambre

Suivi #266 et #284. Base DEV 456ffa5, Render LIVE c9caaea. Migration initiale 20261128043616 réussie. La recette transactionnelle sur DEV a constaté qu'un second passage Hôtel pouvait être enregistré sans confirmation. Toutes les fixtures de recette ont été annulées (aucun compte, réservation, établissement ni journal fictif résiduel).

## Cause vérifiée
La fonction privée historique confirm_reservation (propriétaire resto_service_writer, sans BYPASSRLS, empreinte du corps hébergé ee21d4447239814de0076fd0432cb686) teste NOT (rôle Restaurant AND notes marqueur AND confirmation GUC). Si les notes sont NULL, comme dans le passage v3 appelé par Express, ou si le GUC n'est pas renseigné, cette expression peut valoir NULL. IF ne traite alors pas le conflit de chambre. Le snapshot de novembre 10 utilisé en CI ne possède pas cette exception, d'où la divergence des résultats.

## Correction proposée
Le SQL autonome dans supabase/proposals/rm-ops-engine/express-room-conflict-v1.PROPOSAL.sql remplace uniquement les deux ancres de la définition historique (échec si la définition attendue ne correspond pas) : NOT COALESCE(exception, false) et prédicat explicite restaurant_id sur le contrôle de chambre. Rôle, signature, propriétaire, ACL, verrous, autres règles, données et capacités Express inchangés. Le mode complet conserve l'exception volontaire existante (Restaurant, marqueur et confirmation simultanés). Dans Coup de feu, le conflit affiche un message explicite invitant à confirmer via le mode complet ; pas de nouvelle écriture automatique ni de nouveau mécanisme de confirmation dans Express dans ce lot. Cache/version du gateway renouvelés.

## Recette
Le test PostgreSQL isolé réintroduit la condition fautive sur le snapshot local, reproduit le doublon dans une transaction annulée, applique deux fois le correctif, contrôle ACL, refus du doublon et révision inchangée, même numéro dans un autre établissement et confirmation explicite. Le test gateway vérifie le code ROOM_CONFLICT et l'absence de relance. CI du nouveau SHA à vérifier. La confirmation explicite est testée au niveau du contrat marqueur/GUC, pas du parcours navigateur complet.

## Suite
Après GO distinct : vérifier l'empreinte actuelle DEV et appliquer uniquement la proposition corrective, contrôler la définition et les permissions, rejouer la recette hébergée avec fixtures transactionnelles et zéro résidu. Ne pas réappliquer le lot initial. Aucun SQL hébergé exécuté pour ce correctif, aucune fusion ou publication ; PROD/V3/MAIN préservés. Pour un retour en consultation, conserver la correction du contrôle chambre et utiliser le rollback B2 déjà testé ; ne pas réintroduire le défaut NULL.
