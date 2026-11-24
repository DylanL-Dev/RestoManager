# RM-SEC-01 — Protections GitHub (rulesets) : configuration et procédure d'activation

**24/11/2026 — préparation uniquement.** Issue #249. Aucune protection n'est modifiée par cette PR : l'activation appartient au propriétaire.

## 1. Constat (vérifié via l'API GitHub)

- Aucune protection de branche ni aucun ruleset sur `main`, `RestoManager-V3`, DEV ou les `backup/*`.
- Dépôt **public**, propriété d'un **compte personnel**.
- **Identité unique :** le propriétaire, Claude Code et Codex agissent tous sous le même compte, **administrateur** du dépôt (auteur des PR #243–#245). GitHub ne peut donc pas distinguer un agent du propriétaire.
- Publication : `main` → GitHub Pages (PROD) ; DEV → Render en Auto-Deploy (toute fusion DEV = déploiement DEV).
- Un contrôle `release-guard` existe sur les PR vers `main` et `RestoManager-V3` : il vérifie le routage Supabase PROD et l'absence de secret.

## 2. Limites de l'offre et conséquences

| Point | Effet |
| --- | --- |
| Rulesets disponibles pour les dépôts publics en GitHub Free | Configuration applicable sans changement d'offre |
| Mode « Evaluate » (test sans blocage) réservé à Enterprise | Activation directe, d'où l'ordre progressif ci-dessous |
| File de fusion (merge queue) réservée aux organisations | Non utilisée ; remplacée par « branche à jour obligatoire » |
| Approbation obligatoire : l'auteur ne peut pas approuver sa propre PR | **0 approbation requise** (sinon tout est bloqué, compte unique) |
| Liste de contournement | **Vide** : un contournement « administrateur » profiterait aussi aux agents |

**Limite principale :** comme les agents utilisent un compte administrateur, ils pourraient techniquement modifier ou désactiver un ruleset. Les rulesets empêchent les erreurs (push direct, push forcé, suppression, fusion avec CI rouge) ; ils ne remplacent pas la règle « autorisation du propriétaire » pour les fusions. Remède durable : RM-SEC-02 (§6).

## 3. Rulesets proposés (`docs/audits/rm-sec-01/`)

| Fichier | Branches | Règles |
| --- | --- | --- |
| `1-frozen-branches.json` | `backup/**`, `feature/refonte-service-responsive-v3` | Suppression, push forcé et **mise à jour** interdits (création de nouveaux `backup/*` toujours possible) |
| `2-main.json` | `main` | Suppression et push forcé interdits ; PR obligatoire ; 9 contrôles requis ; branche à jour |
| `3-restomanager-v3.json` | `RestoManager-V3` | Idem ; 5 contrôles requis |
| `4-dev.json` | `feature/v3-supabase-full-clone` | Idem ; 19 contrôles requis ; branche à jour |

Fusion autorisée : commit de fusion ou squash (pas de rebase).

**Contrôles requis** — uniquement des jobs qui s'exécutent sur **toutes** les PR de la branche (aucun filtre `paths`), source GitHub Actions :
- V3 : `release-guard`, `closeout`, `notifications`, `learning`, `creator-safe-release`.
- MAIN : les 5 précédents + `unit-and-integrity`, `browsers`, `postgres-isolated`, `isolated-browser`.
- DEV : `unit-audit`, `unit`, `postgres`, `browser-mock`, `supabase-isolated`, `playwright-mocks`, `closeout`, `notifications`, `learning`, `production-package`, `real-web-sync`, `public-demo`, `signup-preview`, `registration-security`, `lifecycle-security`, `root-access`, `legal-dev`, `support-dev`, `creator-shell-dev`.

**Exclus pour l'instant :** `public-booking` et `management-responsive` (instables, #246) — à ajouter après RM-CI-01 ; `room-management`, `room-safety`, `creator-isolated` (filtre `paths` : un contrôle requis absent bloquerait la PR).

**Compatibilité Claude/Codex :** branches `claude/*` et `codex/*` non protégées (travail libre). « Branche à jour obligatoire » applique techniquement la règle d'`AGENTS.md` : après chaque fusion DEV, l'autre PR doit intégrer DEV et repasser la CI avant sa propre fusion. Coût : relance de la CI, gratuite sur un dépôt public mais de plusieurs minutes.

## 4. Procédure d'activation (propriétaire)

Prérequis : aucune PR prête à fusionner en cours de validation (idéalement après la fusion de #244).

1. GitHub → *Settings* → *Rules* → *Rulesets* → *New ruleset* → **Import a ruleset** → choisir le fichier JSON → vérifier → *Create*. (Alternative CLI : `gh api -X POST repos/DylanL-Dev/RestoManager/rulesets --input <fichier>`.)
2. Ordre conseillé, avec contrôle entre chaque étape :
   1. `1-frozen-branches.json` (aucun impact sur le travail courant) ;
   2. `3-restomanager-v3.json`, puis `2-main.json` ;
   3. `4-dev.json` en dernier, une fois #244 fusionnée.
3. Contrôle après activation : un `git push` direct de test doit être refusé ; une PR de documentation doit afficher les contrôles requis ; *Settings → Rules → Insights* doit tracer les évaluations.
4. **Retour arrière immédiat :** passer le ruleset concerné en *Disabled* (aucune perte de données).
5. Pour ajouter un contrôle requis plus tard : modifier le ruleset (le nom du contrôle doit correspondre exactement au nom du job).

## 5. Prévention des publications non validées

- **DEV / Render** : PR obligatoire + CI requise empêchent un déploiement Render depuis un push direct ou une CI rouge. Option Render à vérifier : déclenchement de l'Auto-Deploy « après réussite des contrôles » (*After CI Checks Pass*) plutôt qu'à chaque commit.
- **MAIN / GitHub Pages** : seule une PR verte, dont `release-guard`, peut atteindre `main`. Option complémentaire : règle de protection sur l'environnement `github-pages` (branche autorisée = `main` uniquement).

## 6. Étapes suivantes proposées

- **RM-SEC-02 — Séparer les identités** : un compte GitHub dédié aux agents (ou à chacun), rôle *Write* (non administrateur), connecté à Claude Code et à Codex. On pourra alors exiger l'approbation du propriétaire sur `main`/V3, voire sur DEV, et réserver le contournement au seul propriétaire. C'est la seule protection technique de bout en bout.
- Après RM-CI-01 : ajouter `public-booking` et `management-responsive` aux contrôles requis.

## 7. Vérifications complémentaires (demandées le 24/11/2026)

**Compatibilité des JSON.** Les quatre fichiers ont été validés contre la description OpenAPI officielle de l'API REST GitHub (`github/rest-api-description`, opération `POST /repos/{owner}/{repo}/rulesets`) : champs requis, énumérations (`enforcement`, types de règles, `allowed_merge_methods`), types. Résultat : **4/4 conformes**. Le validateur a été contrôlé par un test négatif (3 erreurs volontaires, 3 détectées). Limite : seul un import réel par GitHub confirmera l'acceptation finale ; les fichiers n'ont pas de champ `bypass_actors` à rajouter (liste vide voulue).

**Fiabilité des contrôles requis.** Indicateur retenu : les PR purement documentaires de Claude (#245, #248, #250 ; 5 commits), sur lesquelles tout échec est nécessairement étranger à la PR.

| Contrôle | Échecs sur PR documentaires | Décision |
| --- | --- | --- |
| 19 contrôles DEV proposés | 0 | Requis |
| `management-responsive` | 1/5 (cible tactile 430 px) | Non requis avant RM-CI-01 |
| `public-booking` | 4/4 | Non requis : échec **systématique** sur le code DEV actuel (contraste axe), pas seulement instable ; correctif attendu via #244/RM-CI-01 |

Sur 600 exécutions de PR du 24/11, aucun commit n'a donné des résultats contradictoires pour un même contrôle ; les autres échecs observés correspondent à des développements en cours, corrigés par le commit suivant. Historique court (une journée) : à réévaluer avant l'activation de DEV.

**Effet de RM-SEC-02.** Tant que les agents utilisent le compte administrateur, ces rulesets (0 approbation) restent la phase 1. Après séparation des identités, une variante avec approbation du propriétaire sera proposée.
