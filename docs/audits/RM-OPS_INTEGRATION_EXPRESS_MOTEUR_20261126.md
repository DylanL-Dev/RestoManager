# RM-OPS — Revue croisée et préparation de l'intégration Express (#271) × moteur (#270) — 26/11/2026

- **Responsable :** Claude Code (`agent:claude`). Coordination #247, contrat #265, expérience #266.
- **Périmètre :** branche `claude/rm-ops-engine` (PR #270). La branche `codex/rm-ops-express` (PR #271, `4507b3a`) est **lue uniquement**, sans aucune modification.
- **Interdits respectés :** aucune fusion DEV, aucune migration, aucune écriture Supabase DEV/PROD, aucun déploiement. La fusion des deux PR n'a été faite que **dans une copie locale jetable**.

## 1. Synthèse PASS / BLOCKED

| # | Contrôle | Résultat |
|---|---|---|
| I1 | Fichiers des deux PR distincts | **PASS** : seuls `docs/RELEASE_TRACKER.md` (conflit d'entrées, à résoudre en gardant les deux) et `package.json` (fusion automatique) se recoupent |
| I2 | Fusion locale DEV + #271 + #270 | **PASS** : syntaxe 273/273 ; `npm test` **472/472** |
| I3 | Suite navigateur Express de Codex sur la fusion | **PASS 7/7** (5 largeurs, axe, 2 onglets, coupure, Réception) |
| I4 | Forme de l'aperçu mock = contrat moteur v1 | **PASS** sur `ok`, `kind`, `reservationId`, `targetTables`, `changes`, `fingerprint`, `alreadyApplied` ; écarts ci-dessous corrigés côté moteur |
| I5 | `RestoPlacement` chargé et opérant dans la vraie page `v3-connected.html` | **PASS 6/6** (`tests/browser/rm-ops-live-placement.cjs`, serveur simulé, aucune requête externe, aucune erreur de page) |
| I6 | Échange 214/215 de bout en bout | **PASS** (nœud et navigateur) : une seule écriture `apply_smart_placement_v3`, instantané rafraîchi |
| I7 | Deux utilisateurs simultanés | **PASS** : jamais deux clients sur T4. **CONSTAT** : avec les RPC DEV actuelles, l'installation de 215 « sur T4 » peut aboutir sur T21 si un collègue vient d'échanger (voir §3) |
| I8 | Installation anticipée | **PASS** (moteur) : le client en retard prévu sur la table est replacé, jamais écrasé. Serveur v3 : non protégé (ENG-15), correctif proposé |
| I9 | Passage express | **PASS** : tables conformes à la règle serveur, double appui = 1 passage, `ROOM_CONFLICT` explicite |
| I10 | Perte de connexion | **PASS** : `OFFLINE` puis `NOT_SYNCED` pendant la resynchronisation ; aucune écriture |
| I11 | Données périmées | **PASS** : `STALE` avec nouvel aperçu, aucune écriture |
| I12 | `install_walkin_group_v3` modifiée sur DEV | **EXPLIQUÉ** (§4) ; confirmation par empreinte à faire en lecture seule |
| I13 | Branchement de l'interface sur le service réel | **À FAIRE PAR CODEX** : 9 points précis (§5). Non bloquant pour la poursuite de son travail |

## 2. Corrections apportées côté moteur (PR #270)

- **Avertissement d'installation anticipée jamais émis** (bogue). Il était calculé sur l'intervalle réel, qui commence à « maintenant ». Corrigé : calcul sur l'horaire prévu, `message` lisible.
- **Champs d'affichage attendus par l'interface :**
  - `warnings[].message` (l'interface affiche `warning.message`) ;
  - `label` (« Ch. 215 ») sur l'aperçu et chaque déplacement ;
  - `hotelRoom`.
- **`OUT_OF_SERVICE`** : une réservation d'un autre service ou d'une autre date (recherche élargie) n'est jamais installée par erreur. Le mock Codex refusait déjà ce cas.
- **Empreinte élargie** : couverts, horaire et durée en plus du statut, des tables et de la version.
- **Passage :**
  - `walkInTables()` applique la même règle que `install_walkin_group_v3` ;
  - `RestoPlacement.walkIn()` reprend la même discipline que `seat()` ;
  - `SEATED_ELSEWHERE` signale la course décrite en §3.
- **`placement-express-adapter.mjs`** (nouveau) expose **exactement** l'interface de la simulation Codex :
  - `preview(snapshot, id, table)`, `suggestions(snapshot, row)` → `{primary, entries}` ;
  - `seat(plan)`, `suggestWalkIn(snapshot, guests)`, `walkIn(draft)` ;
  - `read`, `subscribe`, `close`.
  - Coût mesuré de `suggestions()` sur le jeu de 200 couverts : 3 ms en moyenne, 10 ms au pire.

## 3. Course entre deux pupitres (nouveau constat serveur)

`change_reservation_status_v3` n'a **pas de paramètre table** : il installe la réservation sur sa table **courante**.

**Déroulé :**
1. Le pupitre A échange 214 ↔ 215 (215 passe en T21).
2. Au même instant, le pupitre B installe 215 « sur T4 ».
3. B réussit, mais 215 est enregistré en **T21**, alors que le client est assis ailleurs.

Il n'y a jamais de double occupation de T4, mais l'état enregistré est faux pour 215.

- **Avec v3 :** la façade le détecte et rejette `SEATED_ELSEWHERE` (« vérifiez en salle »), sans nouvel essai automatique. Preuves : ENG-11b, test croisé, test navigateur.
- **Correctif proposé (non appliqué) :** `seat_reservation_v1(p_reservation_id, p_expected_status, p_table)`. La table est vérifiée sous verrou. Testé localement : V4-10 et V4-11, PostgreSQL isolé 28/28.
- **Activation côté client :** la façade bascule automatiquement sur cette RPC si l'instantané annonce `capabilities.placement >= 4`. Cette capacité est à ajouter dans la même migration autorisée.

## 4. `install_walkin_group_v3` « MODIFIÉE depuis 10/11 » sur DEV

D'après les migrations DEV versionnées, la fonction a été remplacée **après** l'export du 10/11 par :
- `20261111203000_rm005_four_table_walkins_dev.sql` : 1 à **4** tables (au lieu de 3) ;
- `20261113153000_rm005_walkin_weekly_server_dev.sql` :
  - horaires d'ouverture via le **planning hebdomadaire** (`private.restaurant_service_open_at_v1`), fermetures du week-end incluses ;
  - lecture des horaires **filtrée par établissement** (`restaurant_id = private.staff_restaurant()`). L'export filtrait seulement `id=1`, ce qui posait un risque multi-établissement.

Mêmes droits, mêmes verrous, même chaîne `acquire_table_hold_v2` → `confirm_reservation_v3` → `change_reservation_status_v3`. **Aucune régression de sécurité identifiée ; c'est un durcissement.**

**Confirmation exacte, en lecture seule :**
```sql
select p.proname, md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('install_walkin_group_v3','install_walkin_group_v4');
```
Valeurs attendues si DEV = migration du 13/11 (calculées sur le corps versionné, méthode validée sur `apply_smart_placement_v3`) :
- `install_walkin_group_v3` = `039236fb2714af1f3def330220c742f9`
- `install_walkin_group_v4` = `4f541533943175c79158f3293d846590`

**Conséquence pour le contrat Passage :** l'interface Express propose une seule table par passage ; la RPC en accepte jusqu'à 4. Aucune incompatibilité.

## 5. Adaptations nécessaires dans l'interface (propriété Codex)

1. **Source des actions :** créer `live = createLiveAdapter({read:()=>liveSnapshot(window,readPlan)})`, importé depuis `placement-express-adapter.mjs`, quand `window.RestoPlacement?.capabilities().seat` est vrai, le rôle est Restaurant et l'appareil n'est pas en Réception. Utiliser `const actions = demo || live`.
2. **`canAct()` :** remplacer `Boolean(demo)` par `Boolean(demo || live)`. Retirer la branche « actions disponibles sur données fictives » de `drawBooking` pour la source réelle.
3. **Appels de la simulation :** remplacer `simulation.suggestions(...)` et `simulation.suggestWalkIn(...)` par `actions.suggestions(...)` et `actions.suggestWalkIn(...)` (dans la simulation, ce sont des fonctions du module, pas de l'objet `demo`). Remplacer `demo.preview / seat / walkIn` par `actions.*`.
4. **Erreurs de `seat()` (`error.code`) :**

   | Code | Conduite |
   |---|---|
   | `STALE` / `CONFLICT` / `TARGET_OCCUPIED` | garder la fiche, `error.preview` contient le nouvel aperçu |
   | `SEATED_ELSEWHERE` | message affiché, la fiche reste ouverte, aucune relance |
   | `RESULT_UNKNOWN` | « vérifiez la fiche », aucune relance |
   | `OUT_OF_SERVICE`, `ROOM_CHANGE_REQUIRED` | message d'aperçu, choisir une autre table |

5. **Passage réel :** le brouillon `{guests, table, type:'external'|'hotel', room}` est accepté tel quel ; `revision` est ignorée (contrôle par rafraîchissement). `ROOM_CONFLICT` : proposer le mode complet (second occupant, `install_walkin_group_v4`).
6. **Libellés :** `changes[].client` contient déjà « Ch. 215 » dans l'adaptateur ; `warnings[].message` est fourni.
7. **Deuxième suggestion :** le moteur classe la table prévue, puis une table **sans réservation** de la même salle, puis l'échange. L'échange 214/215 reste visible dans « Autre table ». Le mock forçait l'échange en 2e position pour l'entraînement : comportement à aligner, ou à garder seulement pour la simulation.
8. **« Je l'accompagne » / « À reprendre » :** reste local à l'appareil. La garde serveur (`escortHold`) est hors v1.
9. **Fichiers à fort risque, au moment de l'intégration :**
   - `v3-connected.html` : incrémenter `?v=` de `smart-placement-engine.js` et `v3-supabase-booking.js` ;
   - `sw.js` : ajouter `placement-gateway.js` et `placement-express-adapter.mjs` à `SHELL` ;
   - `service-v3-express.mjs` : changer son propre `?v=`.

## 6. Procédure d'intégration recommandée

Chaque étape demande une autorisation distincte du propriétaire.

1. **Revue** de #270 (moteur) puis de #271 (expérience), séparément.
2. **Codex** applique les points §5.1 à 5.7 dans #271. Il garde la simulation **et** ajoute la source réelle derrière `capabilities().seat`.
3. **Branche d'intégration commune** (ex. `integration/rm-ops`) : DEV + #270 + #271, conflit du registre résolu en gardant les deux entrées. Puis `npm test`, `test:display` (Express), `test:rm-ops:browser`, `test:rm-ops:postgres`.
4. **Fusion DEV** de cette branche, puis **déploiement Render DEV**, chacun sur autorisation.
5. **Recette DEV avec la v3 actuelle** sur deux tablettes : 214/215, deux pupitres, coupure, passage. La course §3 reste possible mais signalée.
6. **Option** : application de la proposition v4 sur **DEV** (journal, installation anticipée, même salle, `seat_reservation_v1`, libération par réutilisation, déplacement d'un installé) **et** capacité `placement: 4` dans l'instantané. Puis nouvelle recette.
7. V3/MAIN : hors de ce lot.

## 7. Tests exécutés (résultats réels)

| Suite | Branche #270 seule | Fusion locale #270 + #271 |
|---|---|---|
| `npm run test:syntax` | 0 échec | 273/273 |
| `npm test` | **462 réussis, 0 échec**, 6 ignorés (recette croisée sans #271) | **472/472** |
| `node --test tests/rm-ops-integration.test.cjs` | ignoré | **6/6** |
| Express navigateur (Codex) `tests/browser/rm-ops-express.cjs` | — | **7/7** |
| `tests/browser/rm-ops-live-placement.cjs` | **6/6** | **6/6** |
| `tests/postgres/rm-ops-engine.cjs --local --with-proposals` | **28/28** | — |

**Rectificatif :** les 2 échecs « préexistants » `rm015-*` mentionnés le 26/11 au matin venaient de l'absence de `node_modules` dans ma session. Une fois `npm ci` exécuté, `npm test` passe sans échec. La CI de #270 était déjà verte (22/22).

**Navigateur :** Chromium préinstallé, version Playwright du projet. L'exécutable a été fourni par un préchargement **local hors dépôt**.

**Non vérifié :**
- Supabase DEV réel ;
- Realtime réel ;
- appareils physiques du pupitre ;
- PostgreSQL 17 / Docker (indisponible dans la session).
