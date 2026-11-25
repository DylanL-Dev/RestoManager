# RM-AUDIT-02 — Audit de MAIN, phase 1 (lecture et simulation isolée)

**Date :** 24/11/2026 · **Issue :** #144 · **Agent :** Claude Code
**MAIN testé (figé) :** `d852c19eb8b37554f435729f494856daf79ab9ae` (« RELEASE MAIN — RM-RELEASE-01A »), dans un worktree local détaché ; MAIN n'a pas été modifié.

## 1. Cadre et garanties

- **Aucun contact avec Supabase PROD**, ni en lecture ni en écriture. Même une simple sonde de joignabilité de l'hôte PROD a été écartée.
- **Garde-fou hors dépôt** chargé dans chaque processus de test :
  - côté Node, `http`, `https` et `fetch` refusent tout hôte `*.supabase.co` / `*.supabase.in` ;
  - côté Chromium, toute requête vers ces hôtes non interceptée par le test est annulée et journalisée.
  - **Journal : 0 requête bloquée ou annulée.** Les tests utilisent bien leurs simulations.
- Le routage de MAIN (`restomanager-env.js`) refuse toute origine autre que GitHub Pages : en local, l'application ne peut pas se connecter à la PROD.
- **Pas de Docker** dans l'environnement : les suites PostgreSQL, Supabase isolé et RLS n'ont pas pu être exécutées (§4).
- Aucun workflow ajouté, aucune fusion, aucune publication.

## 2. Résultats exécutés

| Contrôle (MAIN) | Résultat | Moteur de données |
| --- | --- | --- |
| `npm run test:syntax` | **PASS** — 173 fichiers, 0 échec | — |
| `npm test` | **PASS** — 221/221 | unitaires |
| `release-guard` (contrôle statique de la cible PROD, exécuté localement) | **PASS** — cible PROD verrouillée, aucun secret | statique |
| `mission2` (passages, éditions, rôles) | **PASS** — 16/16 | simulation en mémoire, réseau externe bloqué |
| `mission3` (intégration, rôles, sept largeurs) | **PASS** — 110 vérifications | simulation |
| `table-display` | **PASS** — 14 | instantané fictif, HTTP/WebSocket distants bloqués |
| `rm005-room-management` (salles : création, renommage, isolation, suppression) | **PASS** — 3 largeurs | simulation |
| `weekly-ui` (planning hebdomadaire) | **PASS** — 3 largeurs | simulation |
| `rm006-creator`, `rmrelease01a-creator` (Créateur lecture seule) | **PASS** — 3 + 4 | simulation |
| `rm013a-management`, `rm013a-assistance` | **PASS** — 14 + 14 | simulation |
| `rm014-notifications`, `-lifecycle`, `-dismiss`, `-pwa` | **PASS** — 14 + 24 + 14 + 12 | simulation, cache PWA |
| `rm016-learning` (didacticiel) | **ÉCHEC ENVIRONNEMENT** | voir §5 |
| `rm012-closeout` (navigateur) | **BLOQUÉ** — exige PostgreSQL via Docker | — |

**Total exécuté :** 14 suites navigateur. 13 PASS (244 vérifications), 1 échec dû à l'environnement, 1 bloquée. Non exécutés : modes `--baseline`, qui comparent avec une autre référence et sortent du périmètre de MAIN figé.

## 3. Couverture des cas E2E de #144

Barème : **COUVERT (simulation)** = vérifié contre une simulation, pas contre un vrai backend ; **PARTIEL** ; **BLOQUÉ** = nécessite Docker ou une base isolée ; **NON TESTÉ**.

| # | Domaine | Statut phase 1 | Preuves / manques |
| --- | --- | --- | --- |
| 1 | Démarrage, rôles, appareils, PWA, hors ligne | PARTIEL | Rôles et largeurs 360–1920 (mission3, rm013a), cache PWA (rm014-pwa). Auth réelle non testée. |
| 2 | Réservations (hôtel/extérieur, chambre, notes, allergies, concurrence) | COUVERT (simulation) | mission2/3 + unitaires (CONC-01, édition V4, classification extérieur). Contrat SQL réel : BLOQUÉ. |
| 3 | Horaires, fermetures, minuit | PARTIEL | Unitaires RM-008 (week-end midi fermé), passage de minuit ; planning hebdomadaire UI. Règles serveur : BLOQUÉ. |
| 4 | Service simulé 20–30 réservations, 54 places, surcapacité | **BLOQUÉ** | Aucun scénario existant sans base isolée ; scénario `service-simulation` à créer en phase 2. |
| 5 | Coopération Réception / Restaurant, propagation | PARTIEL | Synchronisation simulée (mission3, unitaires Realtime). Latence réelle non mesurée : BLOQUÉ. |
| 6 | RM-008 à RM-010 (seuil 45 % → 25, 70 % → 38, retour) | PARTIEL | Unitaires : seuil partagé prioritaire, pas de repli vers l'ancienne valeur locale 60 %, confirmation serveur avant affichage. UPDATE réel et snapshot : BLOQUÉ. |
| 7 | Tables, salles, fusions, RLS | PARTIEL | Salles et affichage des tables : PASS. Fusions, verrous, RLS : BLOQUÉ. |
| 8 | Autres modules (notifications, Créateur, assistance, didacticiel, PDF) | PARTIEL | Notifications, Créateur, assistance : PASS ; didacticiel : échec environnement ; export PDF : NON TESTÉ. |
| 9 | Résilience (cache obsolète, mise à jour, doublons, réseau) | PARTIEL | rm014-lifecycle/pwa, reprises dans les unitaires. Réseau instable réel : NON TESTÉ. |

**Score phase 1 (conforme à #144 : aucun point pour un test non exécuté) :**
- **Contrôles exécutés :** 221/221 unitaires, syntaxe 173/173, `release-guard` PASS ; 13/14 suites navigateur, l'échec restant étant dû à l'environnement.
- **Domaines E2E entièrement couverts sur un vrai backend :** 0/9.
- **Pas de score global sur 100 ni de verdict GO / NO GO :** les domaines 4 à 7, décisifs pour un service réel, exigent la phase 2. Les noter aujourd'hui attribuerait des points à des tests non réalisés.

## 4. Ce que la phase 1 ne couvre pas

Les suites `test:mission3:postgres`, `test:mission3:supabase`, `test:closeout:postgres` et `rm012-closeout` navigateur, ainsi que les contrats SQL et RLS, le Realtime réel et la simulation d'une soirée complète, demandent PostgreSQL ou Supabase en conteneur. Elles tournent dans les workflows de MAIN sur GitHub Actions. Les résultats en simulation ne prouvent pas le fonctionnement en production.

## 5. Constats

| Priorité | Constat | Proposition |
| --- | --- | --- |
| Environnement | `rm016-learning` échoue localement (`assert.ok(child)` : iframe `srcdoc` introuvable). Chromium local 158 contre Playwright 1.56.1 ; même un iframe `srcdoc` minimal fait planter la page dans cet environnement. La même suite réussit sur la CI de MAIN (PR #228). | Pas un défaut de MAIN. Reprendre sur la CI en phase 2. |
| P2 — sécurité | Le SDK Supabase est chargé à l'exécution depuis `cdn.jsdelivr.net` sans contrôle d'intégrité (dépendance de chaîne d'approvisionnement). Versions divergentes : `creator-auth.js` 2.57.0, `supabase-login.js` et `supabase-service-bridge.js` 2.119.0. | Héberger le SDK localement en version unique (comme Lucide RM-020.3), via une PR DEV puis une promotion autorisée. |
| P2 — sécurité | Pas de Content-Security-Policy sur les pages équipe (`v3-connected.html`, `login.html`, `creator.html`…) ; seules les pages du portail public en ont une. | CSP progressive limitée aux origines Supabase et locales, testée sur DEV. |
| P2 — exposition | GitHub Pages publie la racine du dépôt : `supabase/`, `tests/`, `docs/` et la page de recette `v3-mobile-verification-20261109.html` sont servis en PROD. Le dépôt est déjà public, donc il n'y a pas de fuite nouvelle, mais la surface servie est inutile. | Publier un artefact limité aux fichiers d'interface (piste déjà notée dans le README). |
| Info | `release-guard` : routage PROD verrouillé et aucun secret détecté. | — |

Aucun défaut P0 ni P1 n'a été détecté **dans le périmètre testé**, ce qui ne vaut pas absence de défaut sur les domaines bloqués.

## 6. Phase 2 proposée (soumise à autorisation)

1. Exécuter les suites PostgreSQL et Supabase de MAIN figé sur GitHub Actions. Il faudrait un workflow `workflow_dispatch` sur `d852c19` ; **un workflow nouveau nécessite votre autorisation**. Alternative : un environnement doté de Docker.
2. Créer un scénario isolé `service-simulation` sur base éphémère : 20–30 réservations fictives, 54 places, pointe de plus de 25 couverts entre 19 h et 20 h, refus de surcapacité, deux sessions simultanées.
3. Produire ensuite le score global sur 100 et le verdict GO / GO avec réserves / NO GO, avec les 5 tests manuels demandés.
