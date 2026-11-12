# RM-JOHN-02 — Planning hebdomadaire restaurant (12/11/2026)

**Statut : À TESTER CLONE — DEV exclusivement.** Ne pas fusionner vers V3 ni MAIN sans validation explicite de l'utilisateur.

## Périmètre livré sur DEV

- **PC ≥ 1050 px** : tableau des 7 jours avec midi et soir côte à côte, activation indépendante, début et dernière réservation, actions Copier.
- **Tablette 701–1049 px** : jours en deux colonnes de services avec action Copier sous chaque jour.
- **Mobile ≤ 700 px** : accordéon de sept cartes, sans tableau horizontal, midi/soir indépendants.
- Copier les heures d'un jour à un autre, ou appliquer les horaires du lundi à mardi–vendredi.
- La durée standard reste séparée et modifiable.
- Les réglages existants du midi/soir et du week-end ne sont plus la source d'autorité lorsque le planning hebdomadaire existe.
- La configuration est enregistrée via l'action Restaurant existante, contrôlée par rôle, et synchronisée en temps réel ; la Réception ne modifie jamais les horaires.
- Pas de fermeture exceptionnelle par date dans cette itération : cette fonction sera cadrée séparément pour ne pas afficher un bouton inactif.
- Les réservations déjà créées ne sont ni déplacées ni annulées par la modification du planning.

## Supabase DEV uniquement

- Migration `20261112211500_weekly_schedule_dev.sql` : `restaurant_hours.weekly_schedule` JSONB, initialisation par établissement depuis les horaires et fermetures existants, validation de la configuration des 7 jours.
- Un déclencheur sur `public.reservations` contrôle la journée locale **Europe/Paris** à chaque INSERT ou changement de date/heure et refuse les services fermés. Il remplace le déclencheur spécifique samedi/dimanche.
- Migration `20261112212500_weekly_hours_rls_dev.sql` : RLS de `restaurant_hours` durcie pour limiter UPDATE au rôle `fb_admin` de son propre établissement ; Réception en lecture autorisée uniquement dans son établissement.
- Le service writer interne est maintenu pour les opérations serveur existantes.
- La durée de table observée en DEV était de **60 minutes** lors de la création du planning ; elle est conservée, les réservations existantes ne changent pas.

## Validation automatisée et critères d'acceptation

- `tests/weekly-restaurant-hours.test.cjs` : lundi midi, mercredi soir fermé, jeudi soir ouvert, samedi/dimanche midi fermés et samedi soir ouvert ; éléments PC/tablette/mobile et logique de sauvegarde.
- SQL transactionnel : samedi midi rejeté, samedi soir accepté, mercredi soir rejeté après désactivation temporaire ; **0 réservation de test persistée**.
- Toujours vérifier Render DEV sur PC, tablette et téléphone avec comptes Restaurant/Réception, modifications et sauvegardes, et reprise après actualisation.
- Vérifier que des configurations différentes de deux restaurants ne se mélangent pas.
- Si une activité doit se poursuivre après minuit, une évolution dédiée sera requise (le planning actuel fonctionne sur un jour civil 00:00–23:59).

## Suivi

- Code concerné : `reservation-engine.js`, `service-v3.js`, `service-snapshot.js`, `service-v3-shifts.js`, `service-v3-weekly-schedule.js/.css`, `v3-connected-auth.js`, `service-v3-booking-director-choices.js`, `v3-connected.html`.
- Test utilisateur visuel : **EN ATTENTE**.
- Publication V3 : **NON AUTORISÉE**.
- Publication MAIN : **NON AUTORISÉE**.
