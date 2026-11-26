# RM-OPS — Revue technique finale du candidat d'intégration #272 (26/11/2026)

- **Relecteur :** Claude Code (`agent:claude`). Candidat : PR #272 `codex/rm-ops-integration` @ `d22f274` (DEV `608fba9` + #270 `4cdfafa` + #271 `3c6caf7`).
- **Méthode :** relecture du diff complet ; fusions **locales jetables** (#272 seule, puis #272 + CSP #260 `fe86f24`) ; tests Node, Chromium (exécutable préinstallé), PostgreSQL 16 local isolé.
- **Interdits respectés :** aucune fusion, aucune migration, aucune écriture Supabase, aucun déploiement. Aucun fichier de Codex modifié.

## Verdict

| Domaine | Verdict |
|---|---|
| **Mise à disposition DEV de #272 en consultation** (écritures Express bloquées) | **PASS**, sous réserve de la décision du propriétaire |
| Activation des **écritures** Express | **BLOCKED** tant que la proposition SQL corrigée n'est pas appliquée et recettée sur DEV (étapes B du plan) |
| Proposition SQL v4 + `seat_reservation_v1` | **PASS après 2 correctifs** livrés dans #270 (ci-dessous), non appliquée |
| Compatibilité CSP #260 | **PASS fonctionnel** (0 violation) ; **4 conflits textuels** à résoudre à l'intégration |

## 1. Raccordement #272 ↔ moteur #270

- **Code moteur intact :** `smart-placement-engine.js`, `placement-gateway.js`, la proposition SQL et les tests sont **identiques** à #270 `4cdfafa`.
- **Modifications de Codex :**
  - `placement-express-adapter.mjs` : interrupteur d'écriture, filtrage par salle, classement complet ;
  - `v3-supabase-booking.js` : `getState` conditionné au contexte d'établissement, façade enveloppée ;
  - `service-snapshot.js` : `RestoExpressSnapshotRestaurantId`.
  Ce sont des changements cohérents avec le contrat.
- **`RestoExpressSnapshotRestaurantId` :** n'est renseigné que si **toutes** les lignes (salles, tables, réservations, affectations) portent le `restaurant_id` des horaires. La synchronisation lit `*` sur ces 5 tables, et l'export DEV accorde `SELECT` sur la table entière à `authenticated` : le champ est donc bien fourni par DEV. **PASS** (constat sur l'export 10/11).
- **Performance :** l'adaptateur demande le classement de **toutes** les tables à chaque affichage. Mesuré : 3,7 ms en moyenne / 10 ms au pire avec 21 tables, 9 / 21 ms avec 42 tables. **À surveiller** sur tablette, non bloquant.

## 2. Blocage des écritures Express : **PASS** (défense en trois couches)

1. **Interface** (`service-v3-express.mjs`) : `run()` n'exécute **que** sur la simulation (`const adapter=demo`) ; `canAct()` exige `demo`. La source réelle ne sert qu'aux aperçus.
2. **Façade publique :** `window.RestoPlacement = guardConnectedPlacement(placement)` (objet gelé). `seat` et `walkIn` rejettent `EXPRESS_WRITE_DISABLED` ; `capabilities()` annonce `seat/swapAndSeat/walkIn:false`, **même si le serveur annonce `placement: 4`**.
3. **Adaptateur :** constante `EXPRESS_WRITES_ENABLED=false`, modifiable uniquement par un changement de code revu.

**Chemins indirects vérifiés :**
- Les modules Express n'appellent jamais `RestoApplySmartPlacement`, `RestoChangeSharedStatus`, `RestoInstallWalkin`, `supabase` / `.rpc` ni `fetch`.
- « Je l'accompagne » / « À reprendre » et la simulation restent sur l'appareil (stockage local par utilisateur × établissement).
- « Mode complet » rend la main aux écrans existants, dont les écritures sont celles d'aujourd'hui, inchangées.

**Preuves :**
- test navigateur « façade connectée en consultation » : 4 voies refusées, **0 écriture** ;
- scénario Codex « 200 couverts, téléphone et tablette… zéro écriture » ;
- les deux réussis sur la fusion #272 + #260.

**Limite assumée :** `window.RestoPlacementGateway` et les anciennes fonctions du mode complet restent appelables depuis la console. Ce n'est pas une frontière de sécurité : l'autorisation reste au serveur (RLS / RPC).

## 3. Audit SQL v4 + `seat_reservation_v1`

### Correctifs apportés (#270, commit de ce jour)

| # | Constat | Gravité | Correctif |
|---|---|---|---|
| S1 | Le journal `placement_events` était en RLS **forcée sans politique d'ajout**, et les fonctions appartenaient au rôle de migration. Sur Supabase hébergé (propriétaire non superutilisateur), l'écriture du journal, **donc toute installation v4**, pouvait échouer. Invisible en local, car les tests tournaient en superutilisateur. | **Bloquant** pour l'application | Alignement sur la convention RM-012 : fonctions **possédées par `resto_service_writer`** (sans BYPASSRLS), `grant insert` + politique `placement_events_append` (établissement, `actor_id = auth.uid()`, rôle Restaurant). |
| S2 | `seat_with_release_v1` **modifiait** une ligne du journal : refusé sous `resto_service_writer` (révélé par S1). | **Bloquant** | Journal en **ajout seul** : un événement `release_then_seat` supplémentaire. |

Les tests PostgreSQL s'exécutent désormais avec les fonctions possédées par `resto_service_writer` (non superutilisateur, non BYPASSRLS), comme sur DEV.

### Contrôles prioritaires (PostgreSQL isolé, **31/31**)

| Priorité | Cas | Résultat |
|---|---|---|
| Concurrence deux pupitres | échange pendant installation de 215 « sur T2 » (V4-10) | **PASS** : refus 40001, 215 reste à placer |
| | même installation envoyée deux fois en parallèle (V4-14) | **PASS** : une seule réussit, un seul événement |
| | libération + installation contre échange sur la même table (V4-09) | **PASS** : jamais deux installés |
| | v3 actuelle (ENG-11b) | **constat** : la course existe sans `seat_reservation_v1` |
| Restaurant / Réception | Réception et anonyme sur les nouvelles RPC (V4-08, V4-13) | **PASS** : 42501 |
| Multi-établissements | table, client, libération ou déplacement d'un autre établissement (V4-12) ; autre établissement (V4-08) | **PASS** : 22023, 42501 ou 40001, rien ne change |
| Journal | lecture limitée au Restaurant de l'établissement ; `update` / `delete` / `insert` directs refusés (V4-08, V4-13) | **PASS** |

### Points restants (non bloquants pour la consultation)

- **Activation de `seat_reservation_v1` :** la façade bascule dessus si l'instantané annonce `capabilities.placement >= 4`. Il faut **ajouter cette capacité** à la fonction serveur qui la publie (`service_sync_state_v1` / instantané RM-012) dans la même migration autorisée. Aujourd'hui, de toute façon, #272 bloque les écritures.
- **`guard_closed_service_reservations` :** la libération d'un client installé sur un service déjà clôturé (RM-012) peut être refusée par ce déclencheur. Comportement sûr, mais à recetter.
- **PostgreSQL 17 / Docker :** non exécuté dans ma session ; Codex rapporte 28 cas en PostgreSQL 17 sur `4cdfafa`. À relancer après ce commit : `npm run test:rm-ops:postgres`.

## 4. PWA / HTML et CSP #260

**Fusion locale #272 + #260 :**
- conflits textuels uniquement dans `sw.js` (nom du cache + liste `SHELL`), `v3-connected.html` (même ligne de scripts) et 2 tests qui vérifient le nom du cache ;
- résolution :
  - version #260 de `v3-connected.html` (scripts inline supprimés) avec les 4 `?v=` de #272 ;
  - **union** des listes `SHELL` (6 fichiers Express + 5 fichiers CSP) ;
  - nouveau nom de cache unique.

**Résultats sur la fusion :**

| Suite | Résultat |
|---|---|
| syntaxe | 284/284 |
| `npm test` | **485/485** |
| CSP #260 (5 pages × 2 largeurs) | **10/10, 0 violation, injection inline bloquée** |
| Express (Codex) | **10/10** |
| moteur en page | **7/7** |
| PWA | **12/12** (racine et `/RestoManager`) |

Une **sonde** a enregistré toutes les violations CSP pendant les parcours Express complets : **0**.

**Compatibilité du code :**
- aucun `eval`, `new Function`, gestionnaire inline, script inline, attribut `style="…"` ni URL externe dans les modules Express et moteur ;
- `import()` dynamique et feuille de style ajoutée par `<link>` : même origine, autorisés par `script-src 'self'` / `style-src 'self'`.

**À faire à l'intégration** (celui des deux lots qui passe en second) : résoudre les 4 conflits comme ci-dessus et **changer le nom du cache** `sw.js`, puis aligner les 2 tests qui le vérifient.

## 5. Plan de mise à disposition DEV

Chaque étape demande une autorisation distincte du propriétaire.

**Phase A — consultation (aucune migration)**
1. Codex intègre dans #272 le nouveau commit de #270 : SQL et tests seulement, sans conflit avec ses fichiers.
2. Relance de la CI (18 workflows), puis revue et **fusion de #272 dans DEV**.
3. Déploiement Render DEV.
4. Recette terrain sur tablette + téléphone : recherche, suggestions, échange **en aperçu**, passage **en aperçu**, coupure.
5. Ordre vis-à-vis de #260 : le second lot fusionné résout les conflits §4.

**Phase B — écritures (migration DEV)**
1. **Sauvegarde / état de référence :** exécuter `AUDIT_DEV_READONLY.sql` et la requête md5 des fonctions de passage, puis archiver le résultat.
2. **Migration DEV** (rôle `postgres`, éditeur SQL du projet **RestoManager-DEV uniquement**) :
   - la proposition corrigée, déplacée dans `supabase/migrations/` avec un horodatage ;
   - l'ajout de `placement: 4` aux capacités du serveur.
3. **Contrôle après application :** `AUDIT_DEV_READONLY.sql` doit montrer 10 fonctions inchangées et les 5 objets v4 présents. Vérifier aussi `select proowner::regrole from pg_proc where proname in (…)` = `resto_service_writer`.
4. PR séparée passant `EXPRESS_WRITES_ENABLED` à `true` **et** branchant `actions = demo || live` dans l'interface (Codex), avec les tests d'écriture du transport fictif rendus normatifs.
5. Recette DEV à **deux pupitres réels** : 214/215, course, passage, coupure, Réception en parallèle, puis lecture du journal.

## 6. Plan de retour arrière

**Phase A (front seul)**
1. `git revert` du commit de fusion #272 sur DEV, puis redéploiement Render.
2. Le nom de cache `sw.js` doit **encore changer** dans le revert pour que les postes installés récupèrent l'ancienne interface (le nouveau worker attend une activation propre ; RM-014).
3. Aucune donnée n'est touchée : Express n'écrit rien.

**Phase B (SQL)**
1. **Couper d'abord les écritures côté client :** `EXPRESS_WRITES_ENABLED=false`, ou retirer `placement: 4` de la capacité serveur ; la façade retombe sur la v3.
2. Puis supprimer les objets ajoutés :
   ```sql
   begin;
   drop function if exists public.seat_reservation_v1(uuid,text,uuid);
   drop function if exists public.move_seated_party_v1(uuid,uuid,uuid);
   drop function if exists public.seat_with_release_v1(uuid,text,uuid,uuid[],boolean);
   drop function if exists public.apply_smart_placement_v4(uuid,jsonb,boolean,boolean);
   drop function if exists private.rm_ops_seat_span(timestamptz,timestamptz,timestamptz);
   -- Journal : l'exporter AVANT suppression si la recette doit être conservée.
   drop table if exists public.placement_events;
   commit;
   ```
3. Les fonctions v3 ne sont ni modifiées ni supprimées par la proposition : l'application actuelle continue de fonctionner sans intervention. Les réservations déjà installées ou libérées via v4 restent des états normaux (`seated` / `released`).

## 7. Tests exécutés (résultats réels)

| Suite | Contexte | Résultat |
|---|---|---|
| Syntaxe / `npm test` | #272 + #260 (fusion locale) | 284/284 · **485/485** |
| `rm-sec-04-csp` | idem | **10/10** |
| `rm-ops-express` (Codex) | idem, sonde CSP | **10/10**, 0 violation |
| `rm-ops-live-placement` | idem, sonde CSP | **7/7**, 0 violation |
| `rm014-pwa` | idem | **12/12** |
| `rm-ops-engine.cjs --local --with-proposals` | #270, fonctions sous `resto_service_writer` | **31/31** |

**Non vérifié :**
- Supabase DEV réel ;
- Realtime réel ;
- appareils du pupitre ;
- PostgreSQL 17 après ce commit ;
- propriétaire `postgres` hébergé (BYPASSRLS ou non) : sans objet après le correctif S1, qui ne dépend plus de ce point.
