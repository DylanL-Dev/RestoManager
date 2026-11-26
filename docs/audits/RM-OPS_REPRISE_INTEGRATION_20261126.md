# RM-OPS — Reprise de l'intégration Express + moteur (26/11/2026)

- **Contexte :** la session Codex s'est interrompue (limite d'utilisation) pendant la finalisation de #272. Le propriétaire confie la reprise à Claude Code (`agent:claude`).
- **Branche de reprise :** `claude/rm-ops-integration-reprise`, créée depuis `codex/rm-ops-integration@d22f274` (dernier commit publié de Codex), puis **fusion** de `claude/rm-ops-engine@6e9355a`.
- **Aucune réécriture :** pas de rebase ni de push sur la branche de Codex. Les commits de Codex sont conservés tels quels ; PR #272 et branche `codex/rm-ops-integration` inchangées.
- **Interdits respectés :** aucune fusion DEV, aucune migration Supabase, aucun déploiement Render. V3, MAIN et Supabase PROD non touchés.

## 1. État vérifié des branches sur GitHub (au moment de la reprise)

| Référence | SHA | PR |
|---|---|---|
| DEV `feature/v3-supabase-full-clone` | `608fba9` | — |
| `codex/rm-ops-integration` | `d22f274` | #272 brouillon, 18/18 CI |
| `claude/rm-ops-engine` | `6e9355a` | #270 brouillon |
| `codex/rm-ops-express` | `3c6caf7` | #271 brouillon |
| `claude/rm-sec-04-csp` | `fe86f24` (inclut #259) | #260 brouillon |
| MAIN / V3 | `a4d88d9` / `e4de2c7` | non touchés |

Le dernier message de Codex (#247, #266, 12:36) annonce `d22f274` et la CI terminée. Aucun travail plus récent n'est publié. Un éventuel travail local non publié de Codex n'est pas visible, d'où le choix d'une branche distincte plutôt qu'une mise à jour de sa branche.

## 2. Contenu intégré

`6e9355a` n'ajoute que 4 fichiers, sans conflit et sans toucher à un fichier d'exécution ni à un fichier Express :
- proposition SQL v4 corrigée (S1 : fonctions sous `resto_service_writer` + politique d'ajout du journal ; S2 : journal en ajout seul) ;
- tests PostgreSQL (31 cas) ;
- rapport de revue finale ;
- une ligne au registre.

Le comportement de l'application est **identique** à `d22f274`.

## 3. Exigences de la mission

| Exigence | Verdict | Preuve |
|---|---|---|
| Fonctions du Mode Coup de feu conservées | **PASS** | Express navigateur 10/10 (5 largeurs, axe, reprise, passage, brouillon) |
| Navigation inter-salles | **PASS** | « salles actives, vide, désactivation Realtime, clavier, salle unique et reconnexion » |
| Prestige vide | **PASS** | « Aucune table configurée » vérifié dans la vue et dans le plan |
| Isolation multi-établissements | **PASS** | « deux établissements, mêmes salles et numéros, simulations isolées et changement de contexte » ; SQL V4-12 |
| Écritures Express désactivées | **PASS** | `EXPRESS_WRITES_ENABLED=false` ; façade gardée ; moteur en page « écritures bloquées malgré la capacité serveur » ; scénario 200 couverts « zéro écriture » |
| CSP #260 | **PASS** (fusion locale) | voir §4 ; **4 conflits textuels** à résoudre par le second lot fusionné |
| Caches PWA | **PASS** | PWA 12/12 (racine et `/RestoManager`), seule et avec #260 |
| Scripts HTML | **PASS** | syntaxe ; aucun script inline ajouté ; 0 violation CSP pendant Express |

## 4. Tests exécutés localement (résultats réels)

**Environnement :** Docker démarré dans la session ; image PostgreSQL 17 épinglée de la CI ; conteneurs **sans réseau** ; Chromium préinstallé avec la version Playwright du projet. Une sonde locale hors dépôt relève les violations CSP.

### Branche de reprise
| Suite | Résultat |
|---|---|
| `npm run test:syntax` | 272/272 |
| `npm test` | **474/474** |
| `npm run test:rm-ops:postgres` (PostgreSQL 17 Docker) | **31/31** |
| `test:mission3:postgres` · `test:audit:dev:postgres` | 62/62 · 62/62 |
| `test:closeout:postgres` | 29 cas réussis |
| `test:public-connected:postgres` (normal et `RM015_HOTEL_SCHEMA=1`) | 27/27 · 27/27 |
| `rm015-hotel` · `rm015-media` · `rm015-profile` · `rm015-runtime` | 24 · 10 · 9 · 8 groupes réussis |
| `rm0172` · `rm01721` · `rm01722` · `rm01732` | 6 · 5 · 5 · 3 réussis |
| Navigateur `table-display` · `rm-ops-express` · `rm-ops-live-placement` | 17/17 · 10/10 · 7/7, **0 violation CSP** |
| Navigateur `mission2` · `mission3` | 13/13 · 110/110 |
| Navigateur `rm014-pwa` · `-notifications` · `-lifecycle` · `-dismiss` | 12 · 14 · 24 · 14 réussis |
| Navigateur `rm013a-management` · `rm013a-assistance` · `rm005-room-management` · `weekly-ui` · `director-slot-form` | 14 · 14 · 3 · 3 · 3 réussis |

### Fusion locale reprise + CSP #260 (non publiée)
| Suite | Résultat |
|---|---|
| syntaxe · `npm test` | 284/284 · **485/485** |
| `rm-sec-04-csp` | 10/10 (5 pages × 2 largeurs, injection inline bloquée ; les 10 violations relevées sont les injections volontaires du test) |
| `rm-sec-03-vendors` | 2/2 |
| `rm-ops-express` · `rm-ops-live-placement` · `table-display` · `rm014-pwa` | 10 · 7 · 17 · 12, **0 violation CSP** |

**Résolution vérifiée des 4 conflits :**
- `v3-connected.html` : version #260 + `?v=` RM-OPS des 4 scripts ;
- `sw.js` : union des listes `SHELL` + nouveau nom de cache ;
- 2 tests : nom du cache.

### Non exécuté localement (environnement), couvert par la CI GitHub
| Suite | Cause | Couverture |
|---|---|---|
| `test:mission3:supabase` (Auth, PostgREST, **Realtime** réels en conteneurs) | `wal2json` doit être téléchargé depuis `apt-archive.postgresql.org` (HTTP 403 du proxy de session) | workflow Mission 3 |
| `rm012-policy` · `rm012-closeout` navigateur | même blocage (`pg_cron`) | workflow RM-012 |
| `rm016-learning` | échoue **à l'identique sur DEV `608fba9`** dans cette session (Chromium local, déjà noté par RM-AUDIT-02) | `learning: success` sur `d22f274` |

Le réseau de session n'a pas été élargi.

## 5. Bilan

| Domaine | Verdict |
|---|---|
| Version **consultation** du Mode Coup de feu (branche de reprise) | **PASS**, prête pour validation du propriétaire puis Render DEV, sous réserve de la CI GitHub de la nouvelle PR |
| Écritures Express | **BLOCKED** par conception (phase B : migration DEV autorisée, `placement: 4`, recette à deux pupitres) |
| Supabase / Realtime réels | **non vérifié** (aucun accès DEV ; suite isolée confiée à la CI) |
| CSP #260 | **PASS** ; 4 conflits textuels à résoudre lors de la seconde fusion |

## 6. Suite recommandée (une autorisation par étape)

1. Revue de la PR de reprise (CI GitHub complète).
2. Fermeture ou maintien de #272, au choix du propriétaire : elle reste intacte. La PR de reprise la **contient entièrement**, plus `6e9355a`.
3. Fusion DEV de la PR de reprise, puis Render DEV (consultation). Recette tablette et téléphone.
4. #260 : fusion de DEV dans la branche, conflits résolus comme au §4, puis CI.
5. Phase B selon `RM-OPS_REVUE_FINALE_272_20261126.md` §5.
6. Retour arrière : même document, §6.
