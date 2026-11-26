# RM-OPS ENGINE — Moteur métier et sécurité du placement (26/11/2026)

- **Responsable :** Claude Code (`agent:claude`). Issues #265 (RM-OPS-01), #266, #268, coordination #247.
- **Branche :** `claude/rm-ops-engine` depuis DEV `608fba9`. PR **brouillon** vers DEV.
- **Interdits respectés :** aucune migration exécutée (DEV ou PROD), aucune fusion, aucun déploiement. MAIN, V3 et Supabase PROD non touchés. Aucun fichier UX de Codex modifié.

## 1. Accès à Supabase DEV : ce qui a été vérifié et comment

| Source | Statut |
|---|---|
| Catalogue Supabase DEV **en direct** | **BLOCKED** : aucun identifiant DEV dans la session de l'agent (volontaire). Requête de lecture seule fournie : `supabase/proposals/rm-ops-engine/AUDIT_DEV_READONLY.sql`. |
| Export DEV versionné du 10/11 (`tests/postgres/dev-snapshot-20261110.sql`) | **Utilisé**. Fonctions, RLS, ACL et déclencheurs rejoués dans un PostgreSQL local isolé. |
| Migrations du dépôt | Comparées à l'export. |

**À faire par le propriétaire (lecture seule, 1 minute) :** exécuter `AUDIT_DEV_READONLY.sql` dans l'éditeur SQL de **DEV**. Chaque fonction critique doit apparaître « IDENTIQUE 10/11 ». Toute ligne « MODIFIÉE » ou « ABSENTE » invalide les conclusions ci-dessous pour cette fonction. Les empreintes attendues ont été calculées sur l'export rejoué localement, où la requête renvoie 10/10 « IDENTIQUE ».

## 2. Contrôles

| # | Contrôle | Résultat | Preuve |
|---|---|---|---|
| C1 | `apply_smart_placement_v3` existe sur DEV, avec droits `authenticated` uniquement | **PASS** (export 10/11) | ACL de l'export ; ENG-04 |
| C2 | La RPC versionnée dans le dépôt correspond à DEV | **FAIL (écart)** : `supabase/migrations/20261106_smart_placement_atomic_install.sql` est **plus ancien** que DEV. DEV ajoute `lock_restaurant_mutation_v1`, les codes `detail`, le filtrage établissement du `FOR UPDATE` et le contrôle de salle active. | diff export/dépôt |
| C3 | Échange atomique 214↔215 + installation dans une seule transaction | **PASS** | ENG-01, ENG-09 (rollback) |
| C4 | Client installé jamais déplacé, et sa table jamais attribuée | **PASS** (serveur) ; **corrigé** côté JS | ENG-02 ; tests moteur |
| C5 | Client installé une date précédente (après minuit) | **PASS** serveur (bloquant toutes dates) ; **FAIL corrigé** côté JS (l'ancien moteur l'ignorait et annonçait « OK ») | ENG-03 ; test moteur « installé la veille » |
| C6 | `arrived` d'un autre client non déplaçable | **PASS** (serveur et JS cohérents) | ENG-05 |
| C7 | Fusions refusées par la permutation automatique | **PASS** | ENG-06 |
| C8 | Maintiens (`table_holds`) respectés | **PASS** | ENG-07 |
| C9 | Contrôle de version : état attendu, table d'origine, `edit_version` | **PASS** : déclencheurs `bump_reservation_edit_version` et `invalidate_reservation_edit_version` présents ; éditeur ouvert invalidé | ENG-01, ENG-08 |
| C10 | Concurrence (verrous consultatifs par établissement et par table, `FOR UPDATE`) | **PASS** | ENG-11a/b, ENG-12, ENG-13 |
| C11 | Isolation des établissements et rôle Réception | **PASS** (42501) | ENG-04 |
| C12 | Passage : table prévue dans la durée refusée | **PASS** | ENG-14 |
| C13 | **Installation anticipée** sur une table encore promise à un client attendu (retard) | **FAIL serveur** : v3 compare les créneaux **prévus**. Le client « 20:30 » installé à 20:04 sur la table du client « 19:00 » en retard est **accepté**. Moteur JS corrigé (refus) ; correctif serveur proposé (v4). | ENG-15, V4-02 |
| C14 | Journal auteur des placements | **FAIL** : aucun historique des permutations ni des installations (seules les alertes Réception existent). Proposé : `placement_events` (v4). | ENG-16, V4-01, V4-08 |
| C15 | Même salle pour les réservations déplacées | **FAIL corrigé** (JS) : l'ancien moteur pouvait changer un client de salle sans le dire. Serveur : proposé (v4). | tests moteur ; V4-03 |
| C16 | Capacité minimale de table (`capacityMin`) | **N/A** en mode connecté : le plan partagé fixe `capacityMin:1` (`service-snapshot.js`). Aucune colonne serveur. | lecture du code |
| C17 | Échange simple prioritaire | **FAIL corrigé** (JS) : l'ancien moteur préférait la plus petite table libre à l'échange direct. | test moteur « échange simple prioritaire » |
| C18 | Interface : `showSmartPlacement` non reliée | **Constat** (fichier Codex) : régression du commit `03fcf4b`. Rebranchement prévu via `RestoPlacement`. | #268 |

## 3. Livrables de code (périmètre Claude)

- **`smart-placement-engine.js`** : `preview`, `suggest`, `tableStates` ; `simulate` conservée (même forme de retour, 12 assertions historiques vertes).
  - Codes d'erreur du contrat #265.
  - Échange simple en priorité, puis même salle, puis plus petite table.
  - Changement de salle seulement avec `allowRoomChange`.
  - Installé bloquant toutes dates ; intervalle réel si installation anticipée ou tardive ; services après minuit.
  - Empreinte `fingerprint` pour détecter les données périmées (`STALE`).
  - Borne de calcul : pire cas mesuré 41 ms pour `suggest` et 8 ms pour `preview`, avec 80 réservations et 40 tables.
- **`placement-gateway.js`** (nouveau) : façade `RestoPlacement`, toutes dépendances injectées.
  - Aperçu recalculé après rafraîchissement ; `STALE` si l'état a changé, sans écriture.
  - Une seule écriture en vol par réservation.
  - Relecture après échec : `alreadyApplied` si déjà fait.
  - Jamais de nouvel essai automatique ; traduction des erreurs serveur.
- **`v3-supabase-booking.js`** : câblage de `window.RestoPlacement`. `RestoApplySmartPlacement` et `RestoChangeSharedStatus` inchangées.
- **`supabase/proposals/rm-ops-engine/`** : proposition v4 (**non appliquée**) et requête d'audit en lecture seule. Le dossier n'est volontairement pas `supabase/migrations/`, pour qu'aucun outil ne l'applique.

## 4. Architecture des évolutions (proposée, non activée)

| Capacité (`RestoPlacement.capabilities()`) | RPC proposée | Règles clés |
|---|---|---|
| `swapWithoutSeat` | `apply_smart_placement_v4(…, p_seat=false)` | réaffecte sans installer ; `arrived` exclu |
| occupation réelle | `apply_smart_placement_v4` | intervalle `[min(maintenant, prévu), max(…)+durée]` pour la cible installée maintenant (fenêtre de 12 h) |
| même salle | `apply_smart_placement_v4(…, p_allow_room_change)` | `ROOM_CHANGE_REQUIRED` sinon |
| `releaseThenSeat` | `seat_with_release_v1` | libère **uniquement** les installés désignés **et** présents sur la table (1 à 3), jamais un autre ; puis installe ; une transaction ; journal `released_by_reuse` |
| `moveSeated` | `move_seated_party_v1` | installé → table active, sans installé, sans maintien, sans réservation prévue sur `[maintenant, fin estimée]` ; heure d'installation conservée |
| journal | `placement_events` | RLS : Restaurant de l'établissement en lecture ; écriture uniquement par les RPC |
| `escortHold` (« Je l'accompagne ») | **conception seulement** | colonne `table_holds.reservation_id` (nullable) ; garde de 10 min des 2 tables proposées ; v4 ignore les maintiens dont `reservation_id` = cible. Migration et tests à écrire après validation du parcours #266. |

**Ordre de déploiement proposé**, chaque étape sur autorisation distincte :
1. Requête d'audit DEV (lecture seule).
2. Application de la proposition sur DEV.
3. Tests navigateur à deux sessions.
4. Passage de `capabilities` à `true` pour les seules RPC présentes.

**Retour arrière :** les nouvelles fonctions et la table sont additives. `drop function …_v4/_v1` et `drop table public.placement_events` suffisent, car la v3 et l'interface actuelle n'en dépendent pas.

## 5. Tests exécutés (résultats réels)

| Suite | Résultat |
|---|---|
| `node tests/smart-placement.test.js` (historique) | 12/12 |
| `node --test tests/rm-ops-engine.test.cjs` | 19/19, dont propriété aléatoire (400 états, plus de 200 propositions vérifiées sans double occupation) et charge 200 couverts |
| `node --test tests/rm-ops-gateway.test.cjs` | 11/11 |
| `npm test` | 442 réussis ; 2 échecs `rm015-*` dus à l'absence de `node_modules` dans la session (rectifié le 26/11 : 0 échec après `npm ci`, voir le rapport d'intégration) |
| `npm run test:syntax` | 0 échec |
| `node tests/postgres/rm-ops-engine.cjs --local --with-proposals` | **26/26**. PostgreSQL 16 local, socket Unix temporaire, sans réseau : 17 cas sur les fonctions DEV + 9 cas sur la proposition v4. Les lignes `grant MAINTAIN` de l'export sont ignorées en PostgreSQL < 17. |

**Non vérifié :**
- catalogue DEV **actuel** (bloqué, voir §1) ;
- suite PostgreSQL sous Docker / PostgreSQL 17 (Docker indisponible dans la session) ;
- tests navigateur (aucune interface modifiée) ;
- Realtime ;
- intégration avec l'interface Codex.

## 6. Points d'intégration à coordonner (#247)

- `v3-connected.html` : incrémenter le `?v=` de `smart-placement-engine.js` et de `v3-supabase-booking.js` au moment de l'intégration. Fichier à fort risque de conflit, non modifié ici.
- `sw.js` : ajouter `placement-gateway.js` à la liste `SHELL` au même moment. Fichier à fort risque, non modifié ici.
- Codex consomme `RestoPlacement.suggest / preview / seat` et `RestoSmartPlacement.tableStates` (contrat #265). L'ancien `showSmartPlacement` peut appeler `RestoPlacement`, sans modification de ma part.
