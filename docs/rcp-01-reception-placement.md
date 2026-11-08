# RCP-01 — Ajuster automatiquement les tables lors d'un changement de couverts (Réception)

## Défaut reproduit

La réservation est créée pour 2 couverts, puis modifiée à 10. L'algorithme attribue à juste titre une grande table (ex. table 25, capacité 10). Lors du retour à 2 couverts, la même table reste affectée, même si une petite table libre est compatible.

**Cause vérifiée dans le catalogue SQL partagé, en lecture seule :**
`private.ranked_booking_sets` classe actuellement `(ids=previous) DESC` **avant** `seats`. Cela donne à toute attribution précédente compatible une priorité absolue sur les tables plus petites.

## Comportement attendu

- **Réception, changement de couverts :** préférer la combinaison autorisée de capacité suffisante la plus petite, puis le nombre de tables le plus faible.
- **Exemple :** 2 → 10 → 2 couverts : attribution à la table de 10, puis retour à une table de 2 si elle est réellement disponible.
- **Exception :** si aucune petite table libre et compatible n'existe, conserver la plus adaptée parmi les possibilités, y compris la grande table actuelle.
- **Sans modification du nombre de couverts :** conserver l'attribution actuelle si elle est compatible, afin qu'un changement de nom, d'allergie ou de notes ne déplace pas le groupe.
- Ne jamais réattribuer une table occupée, un maintien concurrent, une fusion invalide ou une table désactivée.
- Les validations, droits Réception/Restaurant, version `edit_version` et protections SQL continuent de s'appliquer.
- **Interface Réception :** annoncer dans la confirmation la nouvelle table réellement affectée par le serveur.

## Correctif préparé

- `supabase/scripts/reception_right_size_recommendations.sql` : remplace uniquement la priorité de tri dans `private.ranked_booking_sets`. La fonction conserve sa signature, son schéma, `search_path` et sa logique de contrôle de disponibilité ; aucune réservation existante n'est modifiée par ce script.
- `service-v3-reservations.js` : rend visible la table réattribuée automatiquement après succès de la RPC.
- `tests/postgres/mission3-cases.cjs` : scénarios réels 2 → 10 → 2, édition sans changement de couverts, repli sur la grande table et maintien concurrent.
- `tests/browser/mission3.cjs` : contrôle du message de confirmation sur une RPC simulée.

Les scénarios PostgreSQL s'exécutent sur la base jetable existante `npm run test:mission3:postgres`. Les tests navigateur restent isolés du projet partagé.

## Procédure de validation et publication

1. CI de la Pull Request **entièrement verte** (unités, SQL isolé, navigateurs, Auth/RLS/Realtime isolés).
2. Approbation explicite de la migration SQL vers le projet Supabase partagé — **elle n'est pas exécutée par GitHub ou Render**.
3. Préflight frais du catalogue et sauvegarde adaptée ; appliquer le script transactionnel en période de faible activité.
4. Vérifier la définition SQL, les privilèges, et tester si possible avec un compte fictif dans un établissement de recette **isolé**, jamais en modifiant une réservation client réelle.
5. Autoriser séparément la fusion de la PR vers Full Clone, car **Render est en Auto-Deploy**.
6. Tester sur deux postes et vérifier que les réservations existantes, les fusions et la Réception fonctionnent.
7. La branche officielle du restaurant et `main` restent hors périmètre.

**Coordination :** la PR de sécurisation du répertoire publié Render (#7) est distincte et ne doit pas être fusionnée accidentellement avec ce correctif.

## Retour arrière

Si nécessaire, restaurer dans une migration approuvée la définition précédente de la fonction, puis vérifier la RPC de Réception et la synchronisation. Aucun rollback automatique sur les données de clients.
