# RM-JOHN-01 — Audit des 7 remarques de John (12/11/2026)

**Environnement audité : DEV uniquement** `feature/v3-supabase-full-clone`, Supabase `lykoybacslvmhtzftqsf`. V3, MAIN et la base de production sont hors périmètre.

## Verdict par remarque

| # | Remarque de John | État réel | Preuves et actions DEV |
|---|---|---|---|
| 1 | Menu de créneaux et couverts de 1 à X | **PARTIEL — À TESTER CLONE** | Ajout de `service-v3-booking-director-choices.js` : choix des arrivées par quart d'heure calculé depuis les horaires enregistrés, 1–8 couverts puis 9–20 ou champ numérique pour les groupes. La disponibilité reste validée par le moteur existant, et non garantie par le seul bouton. |
| 2 | À 16 h, proposer une vraie heure de réservation plutôt que l'heure courante | **FAIT DEV — À TESTER CLONE** | `bookingArrivalDefault` recherche la prochaine arrivée dans un service effectivement ouvert, en respectant samedi/dimanche. Les horaires DEV de l'établissement ont été restaurés en base à **12:00–14:30**, **19:00–21:30**, durée **90 min** ; à 16 h la prochaine arrivée admissible est donc 19 h (hors indisponibilité des tables). Les anciennes valeurs DEV 00:00–18:00 / 19:00–23:55 / 45 min ont été consignées avant correction. Aucune réservation historique supprimée. |
| 3 | Erreurs placées sous leur champ (ex. texte pour chambre) | **PARTIEL — À TESTER CLONE** | Erreurs de validité locales date / heure / couverts / chambre associées au champ, `aria-invalid` / `role=alert`, numéro de chambre numérique sur le formulaire de création, remontée d'un sous-ensemble d'erreurs métier du pied du formulaire vers le champ. Vérifier les messages de l'éditeur et les réponses serveur en conditions réelles. |
| 4 | 33 couverts : expliquer le blocage | **FAIT DANS LE CODE DEV — À TESTER CLONE** | DEV possède **54 places actives**, réglage par défaut de 60 % et seuil `ceil(54 * 0,6)=33`. C'est un **seuil conseillé d'arrivées sur une heure**, pas une limite de capacité ; la modale permet de choisir une autre heure ou de confirmer exceptionnellement si les tables le permettent. Explications clarifiées dans `service-v3.js`. Attention : le pourcentage est actuellement enregistré dans le navigateur (localStorage), donc peut différer par appareil. |
| 5 | Plan de salle interactif et numéros | **PARTIEL** | Une grille cliquable de tables et numéros existe. Il n'existe pas encore de plan **spatial** fidèle au positionnement des tables, et la fonctionnalité 2D/3D historique a été volontairement retirée. Nouveau plan à cadrer sans réintroduire l'ancien moteur 2D/3D. La Réception doit rester en lecture seule pour l'attribution des tables. |
| 6 | Interdire les réservations midi samedi/dimanche | **FAIT DANS LE CODE ET SUPABASE DEV — À TESTER CLONE** | Deux réglages par restaurant (`saturday_lunch_closed`, `sunday_lunch_closed`) sont synchronisés dans Gestion. Les créneaux fermés sont exclus des choix, le moteur valide les jours de semaine, et un **trigger PostgreSQL** interdit toute nouvelle réservation ou changement d'horaire vers le samedi/dimanche midi. Tests SQL transactionnels : samedi midi refusé, vendredi midi et samedi soir autorisés, 0 réservation-test persistée. Une ancienne réservation future samedi midi dans DEV reste inchangée. Migration versionnée `20261112200500_john_weekend_lunch_dev.sql`, appliquée sur DEV seulement. |
| 7 | Ajouter Salle Prestige | **PARTIEL — À TESTER CLONE** | Ajout effectif en base **Supabase DEV uniquement** d'une salle active `Salle Prestige` (ordre 2). Aucune table n'y est affectée : les tables existantes de la Salle principale ne sont pas déplacées. Associer les bons numéros après validation des emplacements. |

## Tests et risques

- Tests unitaires de régression : fichier `tests/director-john-feedback.test.cjs` ajouté, suite GitHub exécutée sur DEV. Le navigateur Render doit être vérifié sur **Réception et Restaurant**, PC / tablette / téléphone.
- 23 tables configurées dans l'établissement, dont 22 actives lors de la mesure ; 54 places actives. Calcul du seuil conseillé 33 par défaut (60 %).
- Réservations DEV : préexistantes, pas de nettoyage, annulation ni réaffectation automatique.
- Ne jamais transposer `restaurant_hours`, `restaurant_rooms` ou données de DEV vers la production par copie brute.
- Les changements de code présents sur DEV ne constituent **ni validation utilisateur**, ni autorisation de publication.
- **Priorité de la prochaine itération** : validation visuelle sur Render avec les deux comptes Réception/Restaurant (créneaux du week-end et début de soirée), puis traiter le plan spatial, l'éditeur de réservation et affecter les tables Prestige. Les horaires DEV de référence sont restaurés et documentés.

**État de RM-JOHN-01 : À TESTER CLONE sur les quatre corrections visuelles ; autres sous-points partiels / bloqués.** 


## Clôture du contrôle automatisé

- GitHub Actions sur PR QA DEV #102 : **6/6 contrôles verts**, dont **127 tests unitaires réussis**, Playwright mobile/tablette/PC, PostgreSQL et Supabase Auth/RLS/Realtime isolés.
- SQL Supabase DEV : essai de création samedi midi rejeté par le trigger ; vendredi midi et samedi soir acceptés en sous-transactions annulées, **0 enregistrement fictif persistant**.
- Configuration du restaurant DEV rétablie : midi 12:00–14:30, dîner 19:00–21:30, durée 90 min, samedi et dimanche midi fermés.
- Ne pas assimiler les tests locaux à un test utilisateur authentifié sur la version Render ; validation visuelle encore nécessaire.
