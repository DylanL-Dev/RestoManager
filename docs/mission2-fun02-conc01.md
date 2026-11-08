# Mission 2 — FUN-02 / CONC-01

Correctifs préparés le 7 novembre 2026 sur
`fix/mission2-room-version-control`, initialement depuis `aa35c56`, puis
réintégrés sur `4432417606135ba18d027299b13170a7fa8bb134` de
`feature/v3-supabase-full-clone` avant publication. FUN-01 et les corrections
récentes de retards, changement de jour, navigation et nettoyage sont conservés.
La validation navigateur de cette intégration a aussi détecté une référence
à `mins` hors de sa portée dans `refreshAvailability` ; le calcul de minutes
est désormais local à cette fonction, sans changer les règles d'horaires.

L'utilisateur a ensuite autorisé le commit et le push vers la branche
d'intégration pour transmission à Render. **Cette autorisation ne couvre pas
l'application du SQL à Supabase partagé.** Le script ci-dessous reste préparé
uniquement et n'est exécuté que dans des conteneurs PostgreSQL jetables.
Sans ce SQL, les nouvelles éditions de réservation sont indisponibles ; aucun
fallback vers les anciennes éditions non protégées n'est prévu.

## Fonctionnement

- Un champ chambre explicite est proposé pour l'édition hôtel. Le nom reste
  indépendant ; l'ancien alias « nom = chambre » suit la chambre si seul ce
  numéro est modifié. Un client extérieur envoie toujours une chambre NULL.
- Recherche, validation locale des doublons et ouverture des notifications
  utilisent la chambre explicite. Les notifications de changement conservent
  l'ancienne/nouvelle chambre ; une alerte initiale utilise les données actuelles
  de la réservation lorsqu'elles sont dans le snapshot.
- `reservations.edit_version` est un UUID opaque, renouvelé par un trigger sur
  INSERT/UPDATE. Les changements d'affectation de table l'invalident aussi,
  notamment pour les réservations non cibles d'un placement intelligent.
- La fiche capture le jeton à son ouverture. Ni un snapshot ni une reconnexion
  ne le remplacent. Les RPC comparent ce jeton après `SELECT ... FOR UPDATE`.
- `RM001` signifie une édition obsolète : aucun champ n'est enregistré. La
  saisie reste visible ; « Consulter la version actuelle » ne l'écrase pas.
  « Recharger la fiche » demande confirmation avant de la remplacer.
- Une réponse réseau perdue est présentée comme un enregistrement à vérifier.
  Un renvoi conserve le jeton initial ; si la première écriture est passée,
  le serveur refuse le renvoi obsolète.
- Les verrous et contrôles existants de tables, maintiens, capacité et fusions
  sont conservés. Les identités ancienne/nouvelle chambre sont verrouillées
  dans un ordre stable, avec la même clé que la création.

## SQL préparé — non appliqué au projet partagé

`supabase/scripts/mission2_reservation_edits.sql` est un script transactionnel
sur le schéma V3 existant, pas une baseline pour base vide ni une migration
automatiquement exécutée par le CLI. Il ajoute :

- la colonne `edit_version` et deux fonctions/triggers d'invalidation ;
- le cœur privé `private.update_reservation_v4(...)` ;
- `public.update_reservation_v4(...)` pour Restaurant (retour UUID) ;
- `public.reception_update_reservation_v4(...)` pour Réception (retour JSON avec
  tables attribuées et nouveau jeton).

Les deux RPC exigent `p_expected_version`, `p_hotel_room` et les autres champs
explicites. Leur propriétaire est `resto_service_writer`, sans BYPASSRLS ;
`search_path` est fixé et les droits PUBLIC/anon sont révoqués. Aucune policy
RLS existante n'est remplacée. Le trigger d'affectation est SECURITY INVOKER.

L'ancien cœur d'édition `private.update_reservation_v3(...)` refuse désormais
avec `RM002`, pour que les onglets anciens ne puissent pas contourner le
contrôle de version. La création Réception historique avec
`reception_booking_v3(p_reservation=NULL,...)` reste fonctionnelle.

## Tests reproductibles

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:mission2
npm run test:mission2:postgres
npm run test:mission2:browser
node tests/v3-reservation-audit.cjs
npm test
```

Préconditions navigateur : Playwright 1.56.1 du lockfile et un Chromium installé.
`CHROMIUM_PATH` permet de choisir un Chromium système ; sinon Playwright utilise
son navigateur habituel. `BROWSER_ARTIFACTS` désigne un dossier optionnel de
captures, de préférence hors dépôt.

Préconditions SQL : Docker local accessible sur `/var/run/docker.sock`.
Le runner n'accepte aucune URL de base ni nom de conteneur externe. Il crée sa
base, sans réseau ni port publié, dans un tmpfs, charge le fixture, applique le
script, crée uniquement des données fictives et supprime son conteneur dans
`finally`. L'image PostgreSQL 17 est épinglée par digest dans le runner.

Le fixture `tests/postgres/fixture.sql` vient des seules métadonnées applicatives
lues le 7 novembre : tables, fonctions, contraintes, propriétaires, ACL, RLS et
triggers. Il contient zéro ligne métier et ne doit jamais être chargé en
production. `auth.uid()` et `auth.users(id)` y remplacent le service Auth pour
tester les vraies règles PostgreSQL sous des rôles et identités fictives.
Il ne constitue pas un clone complet de Supabase/PostgREST/Realtime.

Résultats de préparation : 22 scénarios PostgreSQL réussis, 13 contrôles
navigateur réussis, 7 tests unitaires ajoutés, 4 tests FUN-01 et 2 800 assertions
moteur réussis. Les cinq échecs de suite générale observés sur l'ancienne base
ont depuis été corrigés ou retirés par les commits amont du projet. Après
réintégration de ces commits, `npm test` passe : 18 fichiers, zéro échec.
Les suites ciblées sont relancées avant le push. Playwright et son lockfile
servent uniquement les tests navigateur actuels de la mission ; aucun ancien
éditeur, meuble ou script de capture retiré n'est réintroduit.

Les 13 contrôles navigateur utilisent le code réel avec un backend mémoire et
des requêtes externes bloquées ; les 22 scénarios SQL utilisent le vrai
PostgreSQL 17.11, avec sessions concurrentes. Ne pas présenter leur combinaison
comme un test HTTP/Supabase de bout en bout déjà effectué.

## Validation et déploiement

1. Faire valider le diff, l'interface chambre et le comportement de conflit.
2. Rejouer les commandes sur une copie isolée ; compléter avec un Supabase de
   recette complet, comptes fictifs, PostgREST et Realtime, deux restaurants.
3. Vérifier le schéma réel et les prérequis juste avant tout changement autorisé.
   Sauvegarder schéma et données suivant les procédures du projet, avec accès
   restreint ; prévoir une fenêtre où les éditions sont suspendues.
4. Après autorisation distincte, appliquer le script SQL puis publier les
   assets correspondants de manière coordonnée. Les anciens onglets ne peuvent
   plus éditer après le SQL ; une actualisation est obligatoire. Publier le
   JavaScript avant le SQL rendrait les nouvelles RPC indisponibles.
5. La publication Git sur l'intégration est autorisée par l'utilisateur ;
   Render est configuré en auto-déploiement sur commit. Son résultat doit être
   vérifié sur le SHA publié. Le SQL partagé demeure une étape séparée,
   nécessitant une autorisation explicite avant toute exécution.
6. Vérifier sur recette hôtel/extérieurs, notifications/recherche, annulation,
   conflit à deux postes, reprise réseau et RLS, puis autoriser séparément la
   mise à disposition opérationnelle. Ne jamais utiliser de réservation réelle
   comme fixture.

En cas d'échec de publication : garder les éditions bloquées, restaurer les
assets validés ou corriger en avant. Revenir seulement à l'ancienne interface
ne rétablit pas l'édition V3, volontairement refusée par RM002. Ne pas retirer
la garde ou la colonne pour contourner une erreur sans décision explicite.

## Risques et décisions restantes

- L'ajout d'un UUID avec défaut volatil peut réécrire/verrouiller la table ;
  tester la durée sur une copie de volume représentatif et planifier la fenêtre.
- L'invalidation des attributions ajoute des UPDATE de réservation et active
  les triggers existants. Les cas fonctionnels passent ; la charge et les
  courses avec clôture de service restent à mesurer.
- Le patch ne répare pas automatiquement les chambres historiques incohérentes.
  Toute réconciliation de données réelles demanderait une autre autorisation.
- La saisie est gardée en mémoire tant que la page reste ouverte ; elle n'est
  pas sauvegardée durablement après fermeture/rechargement du navigateur.
- Décider si la chambre peut rester vide pour un client hôtel (comportement
  actuel préservé), valider le traitement des anciens alias numériques et
  confirmer que le rechargement explicite sans fusion automatique convient.
- Les fichiers SQL et fixtures doivent rester hors des assets publiés lors
  d'un futur packaging ; aucun changement Render n'est fait dans cette mission.
- Les autres anomalies du premier audit restent hors de ce correctif ciblé.
  Les réparations de tests et le nettoyage déjà intégrés en amont sont
  conservés ; les droits directs du plan de salle ne sont pas changés ici.

## Fichiers de livraison

Code : `reservation-edit.js`, `reservation-engine.js`,
`service-v3-reservations.js`, `service-v3-reminders.js`, `service-v3.css`,
`v3-connected-auth.js`, `v3-supabase-booking.js`, `v3-connected.html`.
Scripts/tests : `package.json`, `supabase/scripts/mission2_reservation_edits.sql`,
`tests/reservation-edit.test.cjs`, `tests/postgres/{fixture.sql,seed.sql,mission2.cjs}`,
`tests/browser/{mission2-bridge.mjs,mission2.cjs}`. Documentation : ce fichier.
