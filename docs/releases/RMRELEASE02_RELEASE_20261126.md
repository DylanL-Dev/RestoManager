# RM-RELEASE-02 — Livraison groupée sécurité et ergonomie (V3 puis MAIN) — candidates

**26/11/2026 — candidates, non publiées.** Issue #276 · tableau #258 · coordination #247. Préparée par Claude Code.

## Références figées

| | SHA |
| --- | --- |
| Source DEV (Render DEV LIVE, PR #260) | `a8d7c2e7641654800445c621d3bee60801ca8ea5` |
| Base V3 (sauvegarde `backup/rm-release-02-v3-before-20261126`) | `e4de2c7d5b2c20a87cecdd5a5069d969abdbce26` |
| Base MAIN (sauvegarde `backup/rm-release-02-main-before-20261126`) | `a4d88d989ef8ea74b2d849cf6c0fc528793618e6` |
| Arbres V3 et MAIN au départ | **identiques** |

## Méthode

- **Pas de fusion globale de DEV.** Chaque fonction est reportée par patch ciblé, en fusion à trois voies, sur une branche fille de V3 :
  - RM-SEC : patch `2b0792e → a8d7c2e`, sans les fichiers RM-017 absents de la production ;
  - L1-B : `login.html` de #263 ;
  - #275 : les 7 lignes de `service-v3-screens.js` ;
  - #274 : le bloc CSS du menu de session.
- **Conflits résolus en faveur de la production :** imports `restomanager-env.js?v=2026.11.21-rm015.10-main`, versions des modules Créateur, métadonnées `main`, cache.
- **MAIN :** même contenu, repris par cherry-pick sur `a4d88d9`. L'arbre obtenu est **identique** à celui de la candidate V3, donc les tests valent pour les deux.

## Inventaire par fonction

| Fonction | Source | Statut | Remarques |
| --- | --- | --- | --- |
| SDK Supabase 2.119.0 et jsPDF 2.5.2 servis localement (`vendor/`), plus aucun CDN | #259 | **INCLUS** | Login et service passent du CDN 2.119.0 au fichier local identique. **Le Créateur passe de 2.57.0 (CDN) à 2.119.0 (local)** : changement de version à recetter. `package.json` reste à 2.57.0 (outillage Node, verrou RM-015.11 inchangé). |
| CSP stricte, origine Supabase **PROD** uniquement | #260 | **INCLUS** | 6 pages : `v3-connected`, `login`, `creator`, `service-connected`, `index`, `service-v3`. 5 scripts inline déplacés à l'identique. Empreinte RM-016 (entraînement) conservée ; **import map Créateur RM-RELEASE-01A autorisée par son empreinte exacte**. |
| Connexion premium L1-B | #263 / #244 | **INCLUS, adapté** | Présentation de #263, rendue compatible CSP (`login-ui.js`, `login-environment.js` avec l'import PROD). **Sans lien d'inscription DEV.** Auth, récupération et routage inchangés. |
| Arrivée en haut du tableau de bord | #275 | **INCLUS, isolé** | 7 lignes de `service-v3-screens.js`. **Sans le chargeur Express.** Ancres explicites et restauration du navigateur conservées. |
| Menu de session compact (téléphone, tablette) | #274 | **INCLUS, isolé** | Règles CSS seules, en bloc `<style id="rmCompactSessionMenu">` après les styles de base. **Sans le lanceur Coup de feu.** Aucune action retirée. |
| Mode Coup de feu, moteur de placement, phase B | #270–#275 | **EXCLU** | Aucun fichier `service-v3-express.*`, `placement-*`, `smart-placement-engine.js` modifié ; aucune référence dans `sw.js` ni dans le HTML. |
| Créateur DEV (coque RM-020, MFA et récupération Root RM-017.3.3, cycle de vie RM-017, assistance RM-019) | DEV | **HOLD** | Dépend de `rm017_lifecycle_requests` et des parcours Root/MFA DEV : non isolable sans serveur. Seules les modifications de sécurité (SDK local, CSP) sont appliquées au Créateur PROD. |
| Correctifs d'accessibilité non publiés | #269 (RM-UX-03) | **HOLD** | PR encore ouverte, non fusionnée dans DEV. |
| Inscription RM-017, pages juridiques RM-018, portail, emails, migrations, Edge, workflows, scripts DEV | — | **EXCLU** | Non touchés. |

## Fichiers modifiés (36)

**Application :**
- `app-release.json`, `creator-auth.js`, `creator.html`, `index.html`, `login.html`, `login-ui.js` (nouveau), `login-environment.js` (nouveau), `redirect-v3-connected.js` (nouveau) ;
- `service-connected.html`, `service-v3-report-download.js`, `service-v3-screens.js`, `service-v3-tutorial-training.js`, `service-v3.html` ;
- `supabase-login.js`, `supabase-service-bridge.js`, `sw.js`, `v3-booking-type-visual.js` (nouveau), `v3-connected.html`, `v3-quick-actions.js` (nouveau) ;
- `vendor/` : SDK, jsPDF, licences, README.

**Suivi :** `docs/releases/RMRELEASE02_RELEASE_MANIFEST_20261126.json`, cette fiche, le registre.

**Tests :**
- `rm-sec-03-local-vendors` et `rm-sec-04-csp` (unitaires et navigateur), adaptés PROD ;
- harnais Supabase réel : SDK local, CSP réécrite vers la pile locale ;
- attentes de version et de cache : `rm005-management-categories`, `rm011a`, `rm014-production-release`, `rmrelease01a-creator` ;
- `rm006-creator` : import ES au lieu de `new Function`, interdit par la CSP.

**Non touchés (vérifié par le diff) :**
- `restomanager-env.js`, `package.json`, `package-lock.json`, `reservation/runtime.json` et le portail ;
- `supabase/`, `.github/workflows/`, Edge Functions ;
- tous les fichiers Express et RM-OPS.

## Protections de production

- **Version et cache :**
  - version `2026.11.26-rmrelease02-main` (`app-release.json` et métadonnée HTML), canal `main` ;
  - cache `restomanager-shell-2026.11.26-rmrelease02-main` ;
  - `?v=` modifié pour `service-v3-screens.js` et `supabase-login.js`.
- **`release-guard`** (rejoué localement) : cible PROD préservée, imports centralisés `?v=2026.11.21-rm015.10-main` intacts dans les 3 fichiers d'authentification, portail verrouillé.
- **Manifeste RMRELEASE02 :**
  - 5 fichiers protégés modifiés **volontairement** (`supabase-service-bridge.js`, `supabase-login.js`, `creator-auth.js`, `login.html`, `service-v3-screens.js`), avec leurs empreintes avant/après ;
  - `restomanager-env.js` et `package-lock.json` inchangés ;
  - 17 ressources promues antérieurement inchangées.
- **CSP :** `connect-src 'self' https://tnsrkargogckgtsxipwd.supabase.co wss://tnsrkargogckgtsxipwd.supabase.co`. Le projet DEV n'apparaît dans aucune page.

## Relecture sécurité

- **Auth / RLS / SQL :** aucun appel `rpc`, `from`, `fetch` ni WebSocket ajouté. Aucune migration. Le client Supabase change seulement de source (même version 2.119.0 pour login et service).
- **Injection :** aucun `eval`, `new Function`, `innerHTML` ajouté. La CSP bloque tout script inline (contrôle positif en navigateur).
- **Cache / PWA :** nouveau cache, 5 fichiers locaux précachés, pas de `skipWaiting` automatique : le garde-fou RM-014 des saisies en cours est conservé.

## Tests réalisés sur la candidate (arbre identique V3 / MAIN)

| Suite | Résultat |
|---|---|
| `test:syntax` | 188/188 |
| `npm test` | **243/243**, dont production RM-014 (empreintes, version, dépendances hors ligne) et RM-SEC-03/04 adaptés PROD |
| `release-guard` (contrôle statique, local) | réussi |

**Navigateur** (Chromium, garde-fou réseau : toute requête hors du serveur de test est **abandonnée**, aucun contact Supabase PROD ; sonde de violations CSP) :

| Suite | Résultat |
|---|---|
| CSP | 8/8 (4 pages × 2 largeurs, 0 violation au chargement, injection inline bloquée) |
| SDK et jsPDF locaux | 2/2 |
| `table-display` | 17/17 |
| `mission2` · `mission3` | 10 · 110 |
| PWA · notifications · cycle de vie · glissement | 12 · 14 · 24 · 14 |
| Gestion · assistance · salles · planning | 14 · 14 · 3 · 3 |
| Créateur RM-006 · RM-RELEASE-01A | 3 largeurs · 4 |
| Didacticiel (base) | 6 |

**0 violation CSP** dans toutes ces suites, hors les 8 injections volontaires du test CSP.

**PostgreSQL 17** (Docker, conteneurs sans réseau) : Mission 2 25/25, Mission 3 62/62, clôture RM-012 29 cas.

**Non réalisés localement :**
- `test:mission3:supabase` (Realtime réel) et `rm012-closeout` navigateur : téléchargements `apt-archive.postgresql.org` refusés par le proxy de session. **CI des PR.**
- `rm016-learning` : échec d'environnement connu du Chromium local. **CI.**
- Appareils physiques, vraie connexion PROD (interdite), export PDF sur un vrai service : recette après accord.

## Retour arrière

- **Avant publication :** les sauvegardes existent déjà (`backup/rm-release-02-v3-before-20261126` = `e4de2c7`, `backup/rm-release-02-main-before-20261126` = `a4d88d9`).
- **Après publication :**
  - revert du commit de fusion sur V3 puis MAIN, ou retour aux SHA de sauvegarde par PR ;
  - aucune donnée ni migration à défaire.
- **Postes déjà mis à jour :** la version précédente revient au rechargement, avec un cache distinct. En cas de blocage par la CSP en production : revert immédiat (balises `<meta>` uniquement, aucun en-tête serveur).

## Prérequis avant publication

1. Accord de la direction **distinct pour V3, puis pour MAIN**.
2. CI de chaque PR au vert, `release-guard` compris.
3. Recette après V3 :
   - connexion Restaurant, Réception et Créateur ;
   - Realtime ;
   - export PDF ;
   - portail public existant ;
   - PWA ;
   - plusieurs largeurs.
