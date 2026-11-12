# RM-JOHN-01 — Audit des 7 remarques de John (12/11/2026)

**Environnement audité : DEV uniquement** `feature/v3-supabase-full-clone`, Supabase `lykoybacslvmhtzftqsf`. V3, MAIN et la base de production sont hors périmètre.

## Verdict par remarque

| # | Remarque de John | État réel | Preuves et actions DEV |
|---|---|---|---|
| 1 | Menu de créneaux et couverts de 1 à X | **PARTIEL — À TESTER CLONE** | Ajout de `service-v3-booking-director-choices.js` : choix des arrivées par quart d'heure calculé depuis les horaires enregistrés, 1–8 couverts puis 9–20 ou champ numérique pour les groupes. La disponibilité reste validée par le moteur existant, et non garantie par le seul bouton. |
| 2 | À 16 h, proposer une vraie heure de réservation plutôt que l'heure courante | **PARTIEL** | `bookingArrivalDefault` choisit déjà la prochaine arrivée autorisée par les horaires. Le sélecteur exclut les créneaux passés. **Blocage configuration** : pour le véritable établissement sur DEV, `restaurant_hours` indique actuellement midi **00:00–18:00**, soir **19:00–23:55**, durée **45 min**. Ce réglage ne correspond pas aux horaires usuels mentionnés dans le projet. Ne pas l'écraser avant de confirmer s'il s'agit d'une simulation. |
| 3 | Erreurs placées sous leur champ (ex. texte pour chambre) | **PARTIEL — À TESTER CLONE** | Erreurs de validité locales date / heure / couverts / chambre associées au champ, `aria-invalid` / `role=alert`, numéro de chambre numérique sur le formulaire de création, remontée d'un sous-ensemble d'erreurs métier du pied du formulaire vers le champ. Vérifier les messages de l'éditeur et les réponses serveur en conditions réelles. |
| 4 | 33 couverts : expliquer le blocage | **FAIT DANS LE CODE DEV — À TESTER CLONE** | DEV possède **54 places actives**, réglage par défaut de 60 % et seuil `ceil(54 * 0,6)=33`. C'est un **seuil conseillé d'arrivées sur une heure**, pas une limite de capacité ; la modale permet de choisir une autre heure ou de confirmer exceptionnellement si les tables le permettent. Explications clarifiées dans `service-v3.js`. Attention : le pourcentage est actuellement enregistré dans le navigateur (localStorage), donc peut différer par appareil. |
| 5 | Plan de salle interactif et numéros | **PARTIEL** | Une grille cliquable de tables et numéros existe. Il n'existe pas encore de plan **spatial** fidèle au positionnement des tables, et la fonctionnalité 2D/3D historique a été volontairement retirée. Nouveau plan à cadrer sans réintroduire l'ancien moteur 2D/3D. La Réception doit rester en lecture seule pour l'attribution des tables. |
| 6 | Interdire les réservations midi samedi/dimanche | **À FAIRE — BLOQUANT AVANT V3** | La table `restaurant_hours` n'a que `lunch_enabled` / `dinner_enabled` sans règle par jour de semaine ; le moteur valide des plages journalières sans tenir compte du samedi/dimanche. **Une simple interdiction côté interface ne suffirait pas** : il faut un réglage par jour dans Supabase et un contrôle serveur sur tous les chemins RPC de création/modification avant publication. Aucune fausse correction ou modification des plages de service n'a été appliquée. |
| 7 | Ajouter Salle Prestige | **PARTIEL — À TESTER CLONE** | Ajout effectif en base **Supabase DEV uniquement** d'une salle active `Salle Prestige` (ordre 2). Aucune table n'y est affectée : les tables existantes de la Salle principale ne sont pas déplacées. Associer les bons numéros après validation des emplacements. |

## Tests et risques

- Tests unitaires de régression : fichier `tests/director-john-feedback.test.cjs` ajouté, suite GitHub exécutée sur DEV. Le navigateur Render doit être vérifié sur **Réception et Restaurant**, PC / tablette / téléphone.
- 23 tables configurées dans l'établissement, dont 22 actives lors de la mesure ; 54 places actives. Calcul du seuil conseillé 33 par défaut (60 %).
- Réservations DEV : préexistantes, pas de nettoyage, annulation ni réaffectation automatique.
- Ne jamais transposer `restaurant_hours`, `restaurant_rooms` ou données de DEV vers la production par copie brute.
- Les changements de code présents sur DEV ne constituent **ni validation utilisateur**, ni autorisation de publication.
- **Priorité de la prochaine itération** : règle hebdomadaire du samedi/dimanche midi correctement appliquée côté base ET côté formulaire, puis retest des vrais comptes Réception/Restaurant. Ensuite, traiter le plan spatial, et affecter les tables Prestige.

**État de RM-JOHN-01 : À TESTER CLONE sur les quatre corrections visuelles ; autres sous-points partiels / bloqués.** 
