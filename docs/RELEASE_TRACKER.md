# RestoManager — registre officiel des évolutions DEV → V3 → MAIN

### RM-RELEASE-03 B2 — Sécurité de présentation Coup de feu — CANDIDAT DEV (28/11/2026)

- Suivi #266 et #284, base DEV `374f556` (#286 fusionnée, 17/17 workflows). Préflight SQL DEV en lecture seule : capacité non activée, définition existante inchangée. Correction de la présentation des tables à contrôler, horloge Paris, source fictive par établissement, confirmations serveur explicites et annulation, compteurs, version PWA. [Rapport et recette](audits/RMOPS_CF27_SAFETY_20261128.md). Tests du nouveau candidat à confirmer ; aucune migration, fusion ou publication autorisée pour ce candidat.

### RM-RELEASE-03 A — Démarrage animé 2027 et simulation DEV uniquement — CANDIDAT DEV (28/11/2026)

- Suivi [#284](https://github.com/DylanL-Dev/RestoManager/issues/284), #242 et #266. Candidat groupé fondé sur la PR #283 (`5691f38`, 18/18 sur son propre SHA), elle-même issue de DEV `9798357`. Intégration des fichiers fournis [DEMARRAGE-2027](audits/DEMARRAGE-2027.md), après les styles existants et immédiatement après le statut de session, sans toucher à l’authentification. Cache et manifeste versionnés, assertions navigateur ajoutées. Aucun test du nouveau candidat encore exécuté à cette entrée ; aucune fusion, publication ou migration. La libération réelle reste conditionnée à la validation serveur séparée.

### RM-OPS — Simulation Coup de feu réservée à DEV — CANDIDAT DEV (28/11/2026)

- Suite de [#266](https://github.com/DylanL-Dev/RestoManager/issues/266), depuis `9798357`. Le bouton et le démarrage de la simulation exigent le canal DEV et un hôte de développement autorisé. Le paquet de publication et son cache excluent le module fictif. Ce contrôle fait partie de la recette des futures promotions V3 et MAIN. [Détail et recette](audits/RM-OPS_COUP_DE_FEU_2027_4_20261127.md#simulation-réservée-à-dev).

### RM-OPS — Coup de feu v2027.4 et libération d’une table — CANDIDAT DEV (27/11/2026)

- Suite de [#266](https://github.com/DylanL-Dev/RestoManager/issues/266) sur DEV `09ec277`. Les deux fichiers livrés sont chargés après le pack UX. La simulation applique et annule les libérations dans son propre état. Le correctif SQL de libération réelle est proposé séparément et a été exécuté sur PostgreSQL jetable. L’activation nécessite la validation du serveur DEV. [Recette et conditions d’activation](audits/RM-OPS_COUP_DE_FEU_2027_4_20261127.md).

### RM-UX — Indicateur de démarrage avant authentification — CANDIDAT DEV (27/11/2026)

- Suite de #280 sur DEV `125658d`, suivie dans [#242](https://github.com/DylanL-Dev/RestoManager/issues/242). L’accueil affiche un fond vert et l’espace connecté annonce la vérification de session dès le premier affichage. Le module d’authentification commence à se charger depuis l’en-tête. L’espace de travail reste masqué jusqu’à l’autorisation et la redirection de refus vers la connexion est vérifiée. Le cache PWA est versionné. [Mesures et recette](audits/RM-UX_DEMARRAGE_20261127.md).

### RM-UX — Reprise pack v11, correctifs 11.1 — CANDIDAT DEV (27/11/2026)

- Reprise propriétaire autorisée de #279 (`57a8034`, 16/18 workflows ; échecs alignement des cartes à 768 px et contraste axe à 390 px). Branche distincte `fix/rm-ux-pack-v11-reprise` ; original conservé. Animation sans déplacement de carte, contraste, compteurs natifs intacts, états réels et isolation de snapshot, cache versionné, quatre tests ciblés. CI et recette visuelle à confirmer. [Rapport](audits/RM-UX_PACK_V11_REPRISE_20261127.md). Aucune fusion ni publication.
- Finalisation dans [#280](https://github.com/DylanL-Dev/RestoManager/pull/280), suivie dans [#242](https://github.com/DylanL-Dev/RestoManager/issues/242). À partir de `653db4a`, correction du contraste des réservations au changement de thème et des icônes Lucide après clôture automatique. Résumé et graphique adaptés aux petits écrans, animation décorative ponctuelle, navigation de la palette soumise à la protection des brouillons et aux droits du rôle. Cache PWA `restomanager-shell-20261126-rmsec0304b-rmuxpack11fix2`. Le suivi de livraison consigne le statut Render après vérification.
- Validation locale des correctifs ciblés. 490 tests unitaires, 23 scénarios RM‑012 sur PostgreSQL jetable et 112 scénarios Mission 3 dans Chromium. Les contrôles GitHub de la tête de PR sont accessibles depuis [les vérifications de #280](https://github.com/DylanL-Dev/RestoManager/pull/280/checks).


### RM-SEC-03 + RM-SEC-04 — SDK local et CSP stricte, livraison unique actualisée — PR DEV BROUILLON (26/11/2026)

- Issues #255 / #256, PR #260 (contient #259). Fusion de DEV `2b0792e` (RM-OPS #270–#275) dans `claude/rm-sec-04-csp`, sans rebase ; conflits `sw.js` / `v3-connected.html` / 2 tests résolus sans perte (version CSP + `?v=` RM-OPS, `SHELL` de DEV + 5 fichiers sécurité, cache `restomanager-shell-20261126-rmsec0304b`). Écritures Express toujours désactivées. **Aucune fusion, migration ni publication.**
- Local : `npm test` 486/486, CSP 10/10, 0 violation dans 30 suites navigateur (Express, moteur, PWA, Mission 3, Créateur, Root, portail public…), PostgreSQL 17 (moteur 31/31, Mission 3 62/62, audit DEV 62/62, RM-012/015/017). `rm015-connected` et `rm016-learning` échouent à l'identique sur DEV en local (environnement) ; Realtime réel et `pg_cron` confiés à la CI. [Rapport](audits/RM-SEC-04_CSP_20261125.md#8-actualisation-sur-dev-c19e4f0-26112026--livraison-unique-rm-sec-03--rm-sec-04).
### RM-OPS UX — Accès Coup de feu et arrivée au tableau de bord — CANDIDAT DEV (26/11/2026)

- Suite de #266 et #274 depuis DEV `c19e4f0`. Accès Restaurant dans le profil mobile et tablette et dans le menu latéral sur ordinateur. Le tableau de bord s’ouvre en haut depuis une URL sans ancre.
- Cache PWA `restomanager-shell-20261126-rmops-navigation1`. Coordination avec #259/#260 dans la [fiche de recette](audits/RM-OPS_UX_NAVIGATION_20261126.md).

### RM-OPS — Reprise de l'intégration Express + moteur (consultation) — PR DEV BROUILLON (26/11/2026)

- Reprise par Claude Code après interruption de la session Codex. Branche `claude/rm-ops-integration-reprise` = `codex/rm-ops-integration@d22f274` + fusion de `claude/rm-ops-engine@6e9355a` (SQL corrigé, tests, documents) ; aucun commit de Codex réécrit, #272 intacte. **Écritures Express désactivées ; aucune fusion DEV, migration ni déploiement.**
- Local : `npm test` 474/474, PostgreSQL 17 Docker (moteur 31/31, Mission 3 62/62, audit DEV 62/62, RM-015/RM-017 réussis), navigateur Express 10/10, moteur 7/7, affichage 17/17, Mission 3 110/110, PWA 12/12 ; avec CSP #260 fusionnée localement : 485/485, CSP 10/10, 0 violation pendant Express. Suites Supabase/Realtime et `pg_cron` bloquées par le réseau de session, confiées à la CI. [Rapport de reprise](audits/RM-OPS_REPRISE_INTEGRATION_20261126.md).

### RM-OPS — Intégration Express et moteur en consultation — CANDIDAT (26/11/2026)

- Branche `codex/rm-ops-integration`, depuis DEV `608fba9`, avec les têtes #271 `3c6caf7` et #270 `4cdfafa6`.
- Aperçus du moteur dans Express, simulation conservée et écritures Express bloquées par la façade connectée. Chargement et cache PWA versionnés. [Recette combinée et verrou de mise en service](audits/RM-OPS_INTEGRATION_DEV_20261126.md).

### RM-OPS-02 — Navigation inter-salles et isolation par établissement — CANDIDAT (26/11/2026)

- Suite du brouillon #271. Recherche et dossier conservés pendant la navigation. Vue globale, salles actives, états enregistrés, salle vide et avertissement avant un changement de salle simulé.
- Express attend un instantané correspondant à l’établissement de la session. La recette fictive utilise deux établissements aux noms de salles et numéros de table identiques. [Navigation, périmètre et recette](audits/RM-OPS-02_EXPRESS_20261126.md#navigation-entre-les-salles).

### RM-OPS-02 — Mode Coup de feu, expérience Express — CANDIDAT (26/11/2026)

- Coordination #247, expérience #266, contrat moteur #265. Base DEV `608fba9`. Tablette au pupitre, mobile et PC dans l’espace Restaurant connecté.
- Lecture des instantanés du service en mode Express. Placement, échange, reprise et passage sur un adaptateur fictif. [Parcours, contrat et recette](audits/RM-OPS-02_EXPRESS_20261126.md).

### RM-OPS-01 ENGINE — Moteur de placement et sécurité serveur — PR DEV BROUILLON (26/11/2026)

- Mission propriétaire (#265, #266, #268 ; coordination #247). Branche `claude/rm-ops-engine` depuis DEV `608fba9`. **Aucune migration exécutée, aucune fusion, aucun déploiement.**
- Moteur JS : échange simple prioritaire, même salle par défaut, installés bloquants toutes dates, installation anticipée, codes d'erreur ; façade `RestoPlacement` (contrat #265) ; `simulate` compatible.
- Constats serveur (export DEV 10/11 rejoué en local) : migration du dépôt plus ancienne que DEV, installation anticipée acceptée par v3, aucun journal auteur. Proposition v4 **non appliquée** dans `supabase/proposals/rm-ops-engine/`. Tests : moteur 19/19, façade 11/11, PostgreSQL isolé 26/26. [Rapport](audits/RM-OPS-ENGINE_MOTEUR_SECURITE_20261126.md).
- 26/11 — Revue croisée avec Express #271 : adaptateur `placement-express-adapter.mjs`, passage sûr, avertissement d'installation anticipée corrigé, constat de course entre deux pupitres (`seat_reservation_v1` proposé, non appliqué). Fusion locale #270+#271 : `npm test` 472/472, Express navigateur 7/7, moteur réel en page 6/6 ; PostgreSQL isolé 28/28. [Intégration](audits/RM-OPS_INTEGRATION_EXPRESS_MOTEUR_20261126.md).
- 26/11 — Revue finale du candidat #272 : écritures Express bloquées (3 couches, PASS) ; CSP #260 compatible (fusion locale : 485/485, CSP 10/10, 0 violation pendant Express ; 4 conflits textuels à résoudre) ; proposition SQL corrigée (journal en RLS forcée sous `resto_service_writer` + ajout seul), PostgreSQL isolé 31/31, non appliquée. [Revue finale](audits/RM-OPS_REVUE_FINALE_272_20261126.md).

### RM-AUDIT-02 — Audit de MAIN phase 1 (lecture/simulation) — RAPPORT (24/11/2026)

- Phase 1 autorisée, issue #144. MAIN figé `d852c19` dans un worktree détaché ; aucun contact Supabase PROD (garde-fou réseau : 0 requête), aucun workflow, aucune fusion.
- Syntaxe 173/173, unitaires 221/221, `release-guard` PASS, 13/14 suites navigateur réussies sur simulation (244 vérifications) ; `rm016-learning` en échec d'environnement (Chromium local), `rm012-closeout` bloqué (Docker).
- Pas de verdict GO/NO GO : domaines service simulé, Realtime réel, RLS et SQL réservés à la phase 2. Constats P2 : SDK Supabase par CDN sans intégrité ni version unique, pas de CSP sur les pages équipe, racine du dépôt publiée. [Rapport](audits/RM-AUDIT-02_MAIN_PHASE1_20261124.md).
- 25/11 — Plan de phase 2 : résultats PostgreSQL 62/62 et clôture RM-012 déjà acquis sur l'arbre identique de la PR #228 ; `mission3-validation.yml` réutilisable via `workflow_dispatch`, harnais Supabase à corriger (`restomanager-env.js`) ; scénario 54 places en deux sessions. Aucun déclenchement. [Plan](audits/RM-AUDIT-02_PHASE2_PLAN_20261125.md).

### RM-UX-03.4d — Consolidation graphique et accessibilité — RECETTE CANDIDAT (24/11/2026)

PR #244 : 18/18 suites GitHub Actions réussies sur `5a3d12b8d4996711d319621c45e4a38e6c7e47ca` avant synchronisation documentaire DEV. Nouvelle recette requise avant fusion ; Render DEV non confirmé. MAIN, V3 et Supabase PROD hors périmètre.

### RM-SEC-02 — Conception de la séparation des identités GitHub — PR DEV BROUILLON (24/11/2026)

- Phase de conception autorisée par le propriétaire, issue #251, branche `claude/rm-sec-02-identities` depuis DEV `dbd2ec0`. **Aucun compte, connexion ni accès modifié.**
- Recommandation : un compte technique commun (seul compte technique gratuit autorisé par les conditions GitHub), collaborateur non administrateur, relié à Claude Code et à Codex ; approbation du propriétaire exigée ensuite sur MAIN/V3 via rulesets et CODEOWNERS. [Conception, tests préalables et procédure de migration](audits/RM-SEC-02_IDENTITES_20261124.md).

### RM-SEC-01 — Préparation des rulesets GitHub — PR DEV BROUILLON (24/11/2026)

- Mission propriétaire autorisée en autonomie, issue #249, branche `claude/rm-sec-01-rulesets` depuis DEV `dbd2ec0`. Préparation uniquement : **aucune protection activée**.
- Quatre rulesets importables (`docs/audits/rm-sec-01/`) : branches figées (`backup/**`, V3 historique), MAIN, `RestoManager-V3`, DEV ; suppression, push forcé et push direct interdits ; contrôles CI requis fiables uniquement. [Rapport et procédure](audits/RM-SEC-01_RULESETS_20261124.md).
- Limite signalée : compte GitHub unique et administrateur pour le propriétaire et les agents ; séparation proposée en RM-SEC-02.

### RM-TEAM-02 — Coordination GitHub Claude / Codex — PR DEV BROUILLON (24/11/2026)

- Mission propriétaire (protocole de collaboration IA). Issue #247, branche `claude/rm-team-02-coordination` depuis DEV `dbd2ec0`, PR vers DEV uniquement, en brouillon.
- Étiquettes `agent:claude`, `agent:codex`, `status:en-cours`, `status:bloqué` créées ; RM-UX-03 (Codex) suivi dans #242, RM-CI-01 (Claude) ouvert en #246 et bloqué par le recouvrement avec la PR #244.
- `AGENTS.md` : protocole des issues (déclaration avant modification, états, réservation non bloquante). Documentation uniquement ; aucune fusion ni déploiement.

### RM-TEAM-01 — Règles communes des agents (AGENTS.md / CLAUDE.md) — PR DEV BROUILLON (24/11/2026)

- Mission propriétaire explicite : documentation de coordination Claude Code / OpenAI Codex. Branche `claude/rm-team-01` depuis DEV `5f545de`, PR [#245](https://github.com/DylanL-Dev/RestoManager/pull/245) vers DEV uniquement, en brouillon.
- Ajout de `AGENTS.md` (règles communes : environnements, interdictions MAIN/V3/Supabase PROD, branches, anti-conflit, tests, traçabilité, validation) et `CLAUDE.md` (consignes propres à Claude Code). Tableau des branches du `README.md` clarifié : `RestoManager-V3` = publication V3 active, `feature/refonte-service-responsive-v3` = historique préservé. Règle « une seule évolution active à la fois » précisée pour le développement parallèle (voir section Règle absolue).
- Documentation uniquement : aucun code, workflow, configuration Supabase/Render, ni donnée modifiés. Aucune fusion ni déploiement ; validation du propriétaire attendue.

### RM-015.1 — Portail public de démonstration — RECETTE DEV (18/11/2026)

- Mission propriétaire explicite après lecture du cahier des charges #173. Départ DEV `62d8fda`, branche `feature/rm015-public-demo`, sauvegarde distante `backup/rm0151-dev-before-20261118`. Aperçu Render DEV autorisé par cette mission ; aucune promotion V3/MAIN ni activation publique de production.
- Entrée `/reservation/` indépendante, configurations par restaurant, parcours complet et gestion d’un exemple local. Aucune réservation réelle, email, maintien, donnée partagée ou connexion Supabase ; pas de migration. L’Épicerie est une configuration de démonstration, pas une règle d’architecture.
- La maquette annoncée n’a pas été reçue et n’est pas dans l’issue : proposition conforme aux contraintes écrites, comparaison visuelle en attente. Illustration originale identifiée ; aucune photographie, coordonnées ou disponibilité officielle inventée.
- Validation locale : syntaxe 160 fichiers, 247 tests Node, 13 groupes Playwright aux sept largeurs, 36 audits axe sans violation détectée. Captures mobile/tablette/PC, QR par restaurant et limites des liens locaux documentés. Non-régressions historiques à vérifier dans les CI de la PR avant intégration DEV et contrôle du clone réel.
- [Rapport, captures et recette](audits/RM0151_PUBLIC_PORTAL_20261118.md) · [Architecture et travaux RM-015.2](audits/RM0151_PUBLIC_ARCHITECTURE_20261118.md). Statut de déploiement final et SHA exact consignés dans la PR ; la recette humaine et la comparaison avec la maquette ne sont pas inventées.


### RM-016.1 — Recette Render validée, correction du bouton Nouveautés et promotion V3/MAIN autorisée (17/11/2026)

- Décision propriétaire : « Ok c’est parfait […] j’ai découvert un bouton très moche une fois réglé […] tout sur main et v3 ». Recette du didacticiel sur Render validée ; harmoniser Voir les nouveautés avant la livraison officielle.
- Source DEV RM-016 `4ca84fb`, PR #180, huit workflows réussis sur `8f560e3`, Render `dep-dbucinojo6nc739mcbu0` LIVE ; 13 ressources et parcours des deux rôles vérifiés. Enrichir les guides lors des évolutions importantes selon le registre versionné déjà livré.
- Correction ciblée du bouton Gestion → Quoi de neuf ?, avec icône Lucide, surface tactile et focus clair/sombre. Aucune règle métier ni donnée partagée modifiée. Tests/captures sur les sept largeurs et les deux rôles.
- Livraison ciblée depuis DEV vers deux branches filles de V3/MAIN, avec sauvegardes `backup/rm016-v3-before-20261117` et `backup/rm016-main-before-20261117`. Conserver connexions PROD, dépendances, lockfile et historique réel des publications ; aucune fusion DEV globale et aucune modification Supabase.
- Vérifier les CI propres à chaque cible avant fusion V3 puis MAIN, puis le déploiement réel GitHub Pages. Aucun essai avec employés non observés n’est inventé.


### RM-016 — Refonte pédagogique du didacticiel — PR DEV / VALIDATION TECHNIQUE (17/11/2026)

- Mission et cahier des charges #175 explicitement autorisés. Branche `feature/rm016-learning-center` depuis DEV `32608cd`, sauvegarde distante `backup/rm016-dev-before-20261117`. PR vers DEV uniquement ; aucune publication V3/MAIN ni modification Supabase dans cette mission.
- Deux niveaux, guides des vrais écrans, modules métiers par rôle, questions/lexique, progression locale par identité/parcours/version et trois exercices fictifs isolés sans réseau. Navigation et formulaires protégés ; aucun enregistrement de formation dans les données réelles.
- RM-012 est désormais réellement publiée par #178/#179 : aide conditionnée à la capacité serveur. RM-015 reste masquée ; aide publique future distincte du personnel.
- [Diagnostic, inventaire des droits et conception](audits/RM016_LEARNING_DESIGN_20261117.md). [Rapport final, 36 captures et procédure de recette Render](audits/RM016_LEARNING_20261117.md). Validation locale : syntaxe 154 fichiers, 235 tests Node, 65 groupes navigateur réussis, deux rôles et sept largeurs. CI de non-régression à consulter dans la PR. Aucun essai humain réel n’est prétendu.

### RM-012.1 — Promotion V3 puis MAIN autorisée, activation PROD à confirmer (17/11/2026)

- Instruction propriétaire après livraison Render : « Oui si tout est ok tu met à jour V3 et main ». Préparer la livraison ciblée de RM-012 et du correctif RM-012.1 ; ne pas fusionner DEV globalement.
- Source DEV `0e7f7b7`, PR #174/#176, sept workflows réussis sur `1553c20`, Render `dep-dbu83st9fdbs73dvg83g` LIVE, version `2026.11.17-rm012.1`, cache et 19 ressources conformes. Le propriétaire demande la promotion sous condition de validation technique ; aucune recette physique supplémentaire n’est inventée.
- Branches protégées de départ : V3 `b8f7a397fd35541e13d222421e43b0025ba13ead`, MAIN `a74e7ed9cab740b215e27946d75da35181f4b0e2`. Sauvegardes préalables et branches filles dédiées ; conserver URL/clé publiques PROD, SDK/lockfile existants et historique des publications réelles.
- Supabase PROD inspecté en lecture seule : prérequis RM-012 présents, module RM-012 et pg_cron non installés. L’autorisation de mise à jour V3/MAIN ne vaut pas autorisation explicite des migrations PROD, interdite dans les consignes initiales. Préparer leurs impacts et leur validation isolée, puis demander l’accord explicite avant toute application partagée PROD.

### RM-012.1 — Démarrage du suivi et clôture automatique sûre — À TESTER CLONE (17/11/2026)

- Activation DEV autorisée par le retour de recette et la confirmation explicite de la clôture automatique si tout est finalisé. Migration `rm012_activation_and_automatic_close` appliquée uniquement à RestoManager-DEV, version distante `20261117163056`, SQL SHA-256 `631edfae7192f5d572b8475c576ee9d48974e454db926a9c51b8a5e23847c481`.
- Deux politiques démarrent au 17/11/2026 ; le travail unique `rm012-safe-automatic-close` est actif toutes les cinq minutes. Lecture applicative vérifiée : date sélectionnée 17/11, aucune ancienne alerte, historique conservé. RLS forcée et worker privé inaccessible aux rôles applicatifs.
- Sept workflows verts sur le paquet `c93579f`. PR [#176](https://github.com/DylanL-Dev/RestoManager/pull/176) vers DEV uniquement, puis publication du clone Render et preuves dans cette PR. Aucune publication V3/MAIN ni modification Supabase PROD.

- Retour de recette : six alertes de journées antérieures à la mise à jour. Le propriétaire demande un démarrage du suivi au 17/11/2026, sans rattrapage automatique des journées précédentes.
- Préférence confirmée explicitement : « Oui, clôturer automatiquement si tout est finalisé ». Clôture après la fin réelle seulement, sans statut déduit, sans blocage, avec trace système identifiable et unicité restaurant/date ; les oublis restent ouverts avec une alerte.
- Branche `fix/rm012-start-date` depuis DEV `8924ff1`, sauvegarde distante `backup/rm012-dev-before-start-date-20261117`. Anciennes journées conservées et consultables volontairement, sans notifications ni clôtures automatiques rétroactives.
- Préparer et tester les changements serveur sur PostgreSQL/Cron isolés, présenter les impacts de migration avant application partagée ; correction sur le clone DEV uniquement. V3/MAIN/Supabase PROD préservés, aucune réservation/clôture fictive dans une base réelle.
- Correctif préparé : début serveur par établissement, worker privé Supabase Cron toutes les cinq minutes, archive commune aux deux modes, audit système distinct et protections de concurrence. Validation locale : 229 tests Node, syntaxe 149 fichiers, 15 groupes SQL/Cron, 29 régressions SQL sur le nouveau schéma et 23 groupes navigateur aux sept largeurs/deux rôles. [Impacts, résultats et captures](audits/RM012_POLICY_AUTOCLOSE_20261117.md). Migration nouvelle non encore appliquée à une base partagée.

### RM-012 — Publication du clone DEV autorisée — À TESTER CLONE (17/11/2026)

- Après le rapport et la PR #174, le propriétaire demande la disponibilité Render puis répond « Oui » à l’autorisation explicite : appliquer la migration sur Supabase DEV, intégrer la PR et déployer le clone Render, exclusivement DEV. V3/MAIN/Supabase PROD restent interdits.
- Migration `rm012_intelligent_closeout` appliquée sur **RestoManager-DEV** (`lykoybacslvmhtzftqsf`), version distante `20261117115202`, SQL identique au paquet testé (SHA-256 `ec43462792b98b331a457d0f43785a0b03ee9f9a273663dfc557298bfa5851bc`). Audit vide après application, RLS activée/forcée, droits temporaires restaurés, RPC Restaurant fonctionnelle et Réception refusée avec 42501.
- Empreintes avant/après identiques : 81 réservations, 110 attributions, 1 archive, 2 lignes horaires. Aucune réservation/clôture créée, aucun statut ni paramètre modifié. Les alertes de sécurité préexistantes n’augmentent pas ; les deux anciennes fonctions publiques passent SECURITY INVOKER.
- Publication du paquet applicatif `907934e` : sept workflows GitHub verts, intégration DEV puis contrôle du déploiement Render LIVE et des ressources servies. Les preuves de livraison et le lien du clone seront consignés dans la PR #174. La recette utilisateur reste à réaliser ; aucune validation de terrain ni autorisation V3/MAIN n’est déduite.

Les éléments ci-dessous décrivent la livraison initiale, avant cette autorisation d’activation DEV.

- Nouvelle mission explicitement autorisée, sept lots : détection selon horaires réels, espace Services à régulariser, clôture ciblée, notifications RM-014, audit, responsive et tests isolés. Cette instruction ouvre RM-012 après la livraison RM-014.2 ; aucune validation physique de production précédente n’est inventée.
- Sauvegarde DEV distante `backup/rm012-dev-before-20261117` sur `85227fccb32cbdd36a41e30ee42dc5f063912e50`, créée avant modification. Branche `feature/rm012-intelligent-closeout` issue de ce même DEV.
- Critères : date exacte explicitement sélectionnée, statuts jamais déduits automatiquement, actions confirmées et auditées, droits Restaurant côté serveur/RLS, Réception exclue, horaires hebdomadaires/Paris/minuit/DST, concurrence et absence de double clôture, protection des autres journées.
- Migration éventuelle préparée dans le dépôt et testée uniquement sur PostgreSQL éphémère. **Aucune application à une base partagée sans présentation préalable des impacts**, aucun changement V3/MAIN/Supabase PROD, aucune donnée fictive réelle, aucun réglage de restaurant modifié silencieusement.
- Livrables : commits par fonctionnalité, PR DEV uniquement, résultats Node/PostgreSQL/Playwright aux sept largeurs, captures mobile/tablette/PC, limites et procédure Render. L’éventuelle absence de migration sur le clone doit être affichée explicitement, sans repli vers une action non sécurisée.
- Lots serveur 1/3/5 préparés : migration `20261117083046_rm012_intelligent_closeout.sql`, créée avec le CLI dans un conteneur sans réseau. Validation locale : 29 groupes PostgreSQL réussis, dont idempotence, concurrence, préservation du jour courant, Europe/Paris/DST, RLS, audit immuable, pagination indépendante des alertes et migration/rollback sous administrateur non-superuser. Aucune application partagée.
- Lots interface 2/4/6 préparés : espace daté intégré à RM-013, confirmations accessibles, corrections motivées, historique et audit, source RM-014 protégée non effaçable par lecture, reprise idempotente après erreur réseau et blocage de mise à jour PWA pendant une action incertaine. Activation uniquement sur capacité serveur RM-012 ; déclenchement automatique de l’ancienne clôture supprimé.

- Livraison des sept lots : PR [#174](https://github.com/DylanL-Dev/RestoManager/pull/174) vers DEV uniquement, avec commits serveur, interface/notifications, tests et corrections Realtime. Validation locale : syntaxe 148 fichiers, 226 tests Node, 29 groupes PostgreSQL, 21 groupes Playwright RM-012 aux sept largeurs/deux rôles ; non-régressions RM-011/013/014 réussies. [Rapport détaillé, impacts de migration, captures et procédure Render](audits/RM012_CLOSEOUT_20261117.md).
- Une régression pré-migration Realtime révélée par la CI historique a été corrigée : abonnement au bus de révision déjà publié, sans imposer la publication préalable des archives. CI complète et artefacts à consulter dans la PR avant toute intégration.
- **Migration non appliquée, PR non fusionnée, RM-012 non publié sur Render**. Revue/autorisation préalable des impacts SQL nécessaire avant la base DEV partagée. Aucun changement V3/MAIN/PROD ni donnée fictive réelle. La recette hébergée par le propriétaire reste en attente ; aucune validation de terrain n’est inventée.

### RM-014.2 — PUBLIÉE V3 / PUBLIÉE MAIN (17/11/2026)

- Publication expressément autorisée : « Ok mes sur main est v3 », consignée par PR #169. Source du glissement DEV b6e6603, PR #167, Render dep-dbtnn3mk1f9s7397811g. Aucune recette physique détaillée inventée.
- V3 : PR [#170](https://github.com/DylanL-Dev/RestoManager/pull/170), trois workflows réussis, fusion b8f7a397fd35541e13d222421e43b0025ba13ead **en premier**. MAIN : PR [#171](https://github.com/DylanL-Dev/RestoManager/pull/171), six workflows réussis, fusion a74e7ed9cab740b215e27946d75da35181f4b0e2 **ensuite**. Arbre identique c9963f3c4809527b4d393b61959141f1f25f3de6, conforme au candidat testé.
- Paquet production : 136 fichiers de syntaxe, 188 tests Node, 14 combinaisons de gestes, 14 combinaisons de régression, 24 groupes de cycle de vie, 12 groupes PWA réussis. CI des cibles inclut aussi Gestion/Assistance, salles, tableaux/réservations et PostgreSQL isolé ; aucun accès aux données réelles pour ces tests.
- GitHub Pages : [44016361568](https://github.com/DylanL-Dev/RestoManager/actions/runs/44016361568), **completed / success** sur MAIN a74e7ed. Version 2026.11.16-rm014.2, canal main ; 22 vérifications HTTP 200/empreintes conformes, dont entrées canonique/versionnée, manifeste, assets et six fichiers protégés inchangés avant/après.
- Six fichiers applicatifs transférés, configuration et dépendances PROD préservées, historique réel conservé, précache 71 ressources. Aucune écriture, migration ou modification Supabase ; aucune réservation/clôture fictive réelle. Sauvegardes backup/rm0142-v3-before-20261117 et backup/rm0142-main-before-20261117.
- [Rapport final et captures](audits/RM0142_PUBLICATION_20261117.md) · [Preuve machine](audits/preuves/rm0142-publication-20261117.json). Statut technique **PUBLIÉE V3 / PUBLIÉE MAIN** ; confirmation visuelle utilisateur de cette publication encore distincte. Aucun parcours robot authentifié sur les données hébergées prétendu.


### RM-014.2 — Livraison V3 puis MAIN autorisée (17/11/2026)

- Décision explicite du propriétaire après présentation du clone et des tests : « Ok mes sur main est v3 ». Cette instruction autorise la publication du glissement et de l’annulation ; aucune recette physique détaillée n’est inventée.
- Source DEV `b6e6603`, code `bfbc5bc`, tests `b590cc6`, PR #167/#168 ; Render `dep-dbtnn3mk1f9s7397811g` LIVE, version `2026.11.16-rm014.2`. Six CI réussies, 216 tests unitaires DEV et validations Playwright mobile/tablette/PC.
- Préparer des branches filles de V3 `c5ef487` et MAIN `f17e6ea`, avec sauvegardes, puis transférer uniquement les fichiers du complément et ses tests. Conserver connexions PROD, dépendances/lockfile, canal main et historique réel de production, précache 71 fichiers.
- Tester le paquet production et ses deux PR ; fusionner V3 d’abord puis MAIN. Vérifier GitHub Pages et les empreintes des fichiers publics. Aucun changement de schéma, droits, données ou configuration Supabase PROD, aucune réservation/clôture fictive réelle.

### RM-014 — Retrait personnel par glissement — À TESTER CLONE (16/11/2026)

- Demande explicite : « Ou juste un slide pour enlever la notification qu'on ne veux plus ou déjà traité » ; complément de RM-014, sur branche `feature/rm014-swipe-dismiss` issue de DEV `82ccef7`.
- Critères Restaurant/Réception, mobile/tablette/PC : retrait par glissement horizontal ou bouton accessible ; annulation ; conservation après rechargement sur cet appareil, isolée par compte/établissement/rôle ; aucun changement des réservations ni des notifications des collègues. Une nouvelle révision d'événement doit réapparaître.
- Risques à contrôler : gestes verticaux et clics, priorité et erreurs de synchronisation actives, compteur, stockage indisponible, changement de compte, cache PWA. Aucun accès Supabase nécessaire ; tests sur données en mémoire uniquement.
- Validation prévue : syntaxe, unités et Playwright aux sept largeurs/deux rôles, cycle de vie/PWA et captures mobile/tablette/PC ; livraison sur Render DEV pour recette. Aucune nouvelle publication V3/MAIN sans validation de ce complément.
- Implémentation DEV `bfbc5bc` : retrait local réversible, réapparition des nouvelles révisions, alertes de connexion/mise à jour protégées. Tests locaux réussis : 142 fichiers de syntaxe ; 53 fichiers de tests (216 tests nommés avec isolation désactivée), 14 combinaisons de glissement, 14 combinaisons de régression, 24 groupes de cycle de vie, 12 groupes PWA. [Rapport et captures des trois formats](audits/RM014_DISMISS_20261116.md).
- Livraison DEV : PR [#167](https://github.com/DylanL-Dev/RestoManager/pull/167), six workflows réussis sur `b590cc6` (216 tests Node en CI), fusion `3e89bf61c319d12ee43bf6df2a5f725db70443ce`. Render `dep-dbtnn3mk1f9s7397811g` **LIVE** à 21:54:40 UTC ; version `2026.11.16-rm014.2`, 16 ressources HTTP 200 / empreintes conformes et entrée de prévisualisation vérifiée. [Preuve Render/CI](audits/preuves/rm014-dismiss/render.json).
- **À TESTER CLONE** : glissement/annulation à confirmer par le propriétaire sur Render. Les fichiers de connexion et le lockfile DEV sont inchangés ; V3 `c5ef487` et MAIN `f17e6ea` sont restés inchangés. Aucune écriture de données réelles ou migration ; aucun parcours authentifié hébergé exécuté par l’agent.

**Source de vérité du projet : ce document sur `feature/v3-supabase-full-clone`.**  
Créé le 10 novembre 2026, après l'incident de synchronisation lié à la journée de service.  
**Règle absolue : une seule évolution active à la fois.** Ne pas passer à une nouvelle fonctionnalité tant que la précédente n'est pas **VALIDÉE CLONE** par l'utilisateur ou explicitement **BLOQUÉE / REPORTÉE**. Une réparation urgente mettant le service en sécurité fait exception et suspend la fonctionnalité en cours.

**Précision du 24/11/2026 (décision du propriétaire, RM-TEAM-01) — travail en parallèle de plusieurs agents.** Plusieurs fonctionnalités peuvent être *développées* simultanément, chacune sur sa propre branche et sa PR brouillon vers DEV, avec des fichiers distincts. La règle « une seule évolution active à la fois » s'applique à l'**intégration et à la publication** : une seule PR fusionnée dans DEV et publiée sur Render à la fois, chacune avec l'autorisation explicite du propriétaire ; l'évolution suivante n'est fusionnée qu'après que la précédente est **VALIDÉE CLONE** ou explicitement **BLOQUÉE / REPORTÉE**. Après chaque fusion DEV, les autres branches intègrent DEV et relancent leurs tests. Les promotions V3/MAIN restent ciblées et individuelles.

## Statuts autorisés

| Statut | Sens et action autorisée |
| --- | --- |
| À FAIRE | Demandée, pas encore commencée. |
| EN COURS DEV | Modification sur le clone uniquement. Ne rien pousser vers V3/MAIN. |
| À TESTER CLONE | Développement et tests techniques terminés, attente d'essais visuels/fonctionnels sur Render et des deux rôles. |
| VALIDÉE CLONE ✅ | L'utilisateur a explicitement validé la fonctionnalité sur Render, avec preuves et critères. Prête à préparer une livraison. |
| PRÊTE À PUBLIER | Diff analysé, dépendances complètes, sécurité DB vérifiée, tests automatiques réussis. |
| PUBLIÉE V3 | Fusion de la PR V3 réussie. Ne signifie pas encore que MAIN est à jour. |
| PUBLIÉE MAIN | Fusion de la PR MAIN réussie. Ne signifie PAS que GitHub Pages ou l'écran utilisateur est validé. |
| CONFIRMÉE EN PRODUCTION ✅ | L'utilisateur a constaté sur la vraie interface que la fonction marche, sans test destructif. |
| BLOQUÉE / REPORTÉE | Cause et plan de reprise décrits ; l'utilisateur accepte de suspendre l'évolution. |

**Ne jamais confondre** « commit GitHub », « tests CI réussis », « déploiement réussi » et « validation de l'écran réel ».

## Procédure obligatoire pour CHAQUE évolution

1. **Avant de coder**, ajouter une ligne avec ID, intitulé, périmètre, critères d'acceptation (Restaurant, Réception, mobile/tablette/PC), risques et statut `EN COURS DEV`. Une seule ligne peut être active simultanément.
2. Développer/committer **sur DEV Clone** ; ne jamais copier la configuration Supabase DEV dans la production. Mettre à jour le statut et les tests dans ce registre au même commit ou immédiatement après.
3. Tester sur **Render connecté à Supabase DEV** : créer, modifier, annuler (données fictives DEV uniquement), tables, rôles, synchronisation, écrans mobiles ; inclure des scénarios autour de **00:00 Europe/Paris**. Enregistrer les résultats.
4. Passer à `À TESTER CLONE` et demander une **validation explicite de l'utilisateur** : « oui validé » / « corrige ». Si refus, rester sur la même évolution ; **ne pas ouvrir la suivante**.
5. Après `VALIDÉE CLONE`, comparer l'ensemble des dépendances (HTML, CSS, JS, icônes, PWA, tests), exclure fichiers de routage DEV, migrations et RPC non disponibles en production. Créer une branche/PR V3 et sa PR MAIN ; jamais de fusion massive de DEV.
6. CI : vérification syntaxe, tests de régression, sélection du bon projet Supabase, Réception sans gestion de tables, sauvegarde automatique de l'attribution, jour du service. Contrôler les clés de cache du HTML et du service worker.
7. Fusionner **V3 d'abord**, puis **MAIN**, uniquement si les tests sont verts. Conserver références PR et SHA.
8. Vérifier le déploiement GitHub Pages **et** le navigateur (dont la PWA et le cache). Ne considérer l'opération terminée qu'après validation visuelle et fonctionnelle de l'utilisateur. **Ne jamais saisir de fausse réservation dans la base réelle.**
9. Confirmer `CONFIRMÉE EN PRODUCTION`, inscrire les preuves, puis seulement commencer l'évolution suivante.

### Contrôle critique permanent : date et sécurité

- `service-v3.js` doit conserver `const today=()=>bookingToday();` : tables et réservations sur la **même journée dès 00:00 à Paris**. Ne jamais réintroduire le décalage à 01:00 ; maintenir `tests/service-day-rollover.test.cjs`.
- Les deux projets Supabase sont **indépendants** : DEV `lykoybacslvmhtzftqsf`, production `tnsrkargogckgtsxipwd`. Les migrations SQL, les changements de droits ou les données de DEV ne sont **jamais** poussés automatiquement en production.
- **Réception :** création/édition/annulation autorisées selon statut, mais pas de changement manuel de table ni d'installation. **Restaurant :** gestion des tables et des passages. Les formulaires et icônes restent visuellement cohérents.
- Lors d'une régression en production : suspendre les publications ; sauvegarder MAIN/V3 ; restaurer la dernière version vérifiée, contrôler la date et le cache, consulter les journaux sans écriture DB, puis inscrire l'incident ci-dessous.
- Une correction au registre ou un commit ne constitue **pas** une validation utilisateur.

## Historique connu — ne pas réécrire les validations

| ID | Évolution isolée | DEV Clone | V3 | MAIN | Confirmation utilisateur / reste à vérifier |
| --- | --- | --- | --- | --- | --- |
| RM-001 | Jour de service : bascule à **00:00** plutôt qu'à 01:00 ; tables et réservations concordantes | Corrigé, test de non-régression ajouté | Publié, PR #66 | Publié, PR #65 | **Confirmé en production par l'utilisateur** le 10/11 : « c'est revenu l'erreur venait de là » |
| RM-002 | Nouvelle interface des formulaires, champs et icônes Lucide, actions/raccourcis de table | Code présent dans DEV | Publié, PR #68 | Publié, PR #67 | **CONFIRMÉE EN PRODUCTION ✅** — confirmation globale explicite de l'utilisateur le 10/11/2026. Cette confirmation ne constitue pas un procès-verbal détaillé de tests tablette/mobile. |
| RM-003 | Réception : alignement de « Table disponible — Attribution automatique », suppression du texte ajouté et du bouton manuel | Ancien texte parasite absent du code DEV ; CSS modernisé | Publié, PR #71 | Publié, PR #72 | **CONFIRMÉE EN PRODUCTION ✅** — confirmation globale explicite de l'utilisateur le 10/11/2026 pour le formulaire Réception. |
| RM-004 | « Client hôtel » sélectionné par défaut pour Restaurant et Réception, initialement et après nouvelle réservation | Corrigé | Publié, PR #71 | Publié, PR #72 | **CONFIRMÉE EN PRODUCTION ✅** — confirmation globale explicite de l'utilisateur le 10/11/2026 ; Client extérieur reste sélectionnable. |

*Les lignes historiques RM-001 à RM-004 décrivent l'état des livraisons passées, pas quatre tâches ouvertes en parallèle. Pour chaque évolution future, ajouter une ligne avant le premier commit et assurer son passage d'état.*

## Contre-vérification technique indépendante — 10/11/2026

Vérification par l'assistant demandée après confirmation utilisateur :

| Test | Constat |
| --- | --- |
| Synchronisation des fichiers V3 / MAIN | **OK** : mêmes empreintes pour `service-v3.js`, `v3-connected.html`, `v3-connected-auth.js`, `service-v3-reservation-fields.css`, `service-v3-reservations.js`, `service-v3-table-choices.js`, `sw.js`, `supabase-service-bridge.js` et `supabase-login.js`. |
| RM-001 — Bascule à minuit | **OK en lecture de code** sur DEV, V3 et MAIN : `const today=()=>bookingToday();` et test de changement de journée présents. |
| RM-002 — Interface/raccourcis | **OK en présence des fichiers** V3 / MAIN : mêmes scripts de réservation, de sélection des tables et structure moderne du formulaire. Test visuel non réalisé par l'assistant. |
| RM-003 — Réception | **OK en lecture de code** : carte `bookingAutoTableInfo`, CSS de la Réception, suppression du paragraphe injecté ; code de restriction du choix manuel toujours présent. Test visuel non réalisé par l'assistant. |
| RM-004 — Hôtel par défaut | **OK en lecture de code** sur les deux branches : radio hôtel cochée et réinitialisation de la sélection lors d'une nouvelle réservation, test correspondant présent. |
| Sécurité Supabase | **OK en lecture de code** : les modules officiels utilisent le projet production `tnsrkargogckgtsxipwd` et non le projet DEV. Aucun essai destructif réalisé. |
| GitHub Pages réel / PWA installée | **NON VÉRIFIABLE depuis les outils du contrôle** : aucune preuve supplémentaire de rendu live ni de test end-to-end. Les confirmations utilisateur précédentes restent la validation de terrain. |

Cette contre-vérification ne doit pas être présentée comme une preuve de fonctionnement interactif de tous les scénarios en production ; les validations du terrain et les tests de non-régression restent nécessaires à chaque future livraison.

## Évolution en cours / prochaine évolution

**RM-AUDIT-01 — CLÔTURÉE OFFICIELLEMENT ✅ (10/11/2026).** Validation explicite du responsable dans la conversation : « Oui, je valide officiellement RM-AUDIT-01. Tu peux finaliser et fusionner la PR #75 uniquement vers la branche DEV, puis préparer RM-005 sans toucher à la production. » PR [#75](https://github.com/DylanL-Dev/RestoManager/pull/75) fusionnée **uniquement** vers `feature/v3-supabase-full-clone` ; commit de fusion `d82d3adb0cc16fa851f5695ad212fd4f95ab3357`. Aucun développement RM-005 engagé, aucune fusion V3/MAIN, aucune migration Supabase production.

- **Étape 1 — VALIDÉE (chargement de DEV Render uniquement)** : le déploiement DEV `8924fa6249aabd0d34e36ef1c19d17fc2e69700a` est revenu `live` sur Render le 10/11/2026 après nettoyage du cache. L'utilisateur confirme « Oui ça fonctionne j'ai effectué aucune réservation de teste ». Cela confirme l'accès/l'affichage de l'application, **pas** la création, l'édition, l'annulation, ni les deux sessions authentifiées.
- **Étape 2 — VALIDÉE TECHNIQUEMENT (10/11/2026)** : six tests unitaires remis en cohérence sur DEV Clone ; aucune modification métier ni production. GitHub Actions **DEV Clone - audit unit tests** (exécution `42732837143`, PR de contrôle [#73](https://github.com/DylanL-Dev/RestoManager/pull/73)) : **111 tests réussis / 111 ; 0 échec ; vérification syntaxique réussie**. Les changements concernent `booking-recovery`, `bug01-security`, `platform-owner-security`, `rush-dashboard-status-split`, `rush-slider-source` et `tutorial-source` ; ne pas confondre réussite unitaire et scénarios navigateur authentifiés.
- **Étape 3 — VALIDÉE TECHNIQUEMENT AVEC RÉSERVE (10/11/2026)** : harnais Playwright réparé sur DEV, sans modification des fonctions métier. Fermeture du didacticiel par le vrai bouton « Plus tard » (missions 2/3 et Supabase local), assertions des libellés complets, actions de réservation selon les rôles, boutons adaptés à l'affichage mobile, et `restomanager-env.js` remplacé **uniquement pendant les tests locaux** pour diriger Auth/REST vers une pile jetable 127.0.0.1. Tests CI de la PR de contrôle [#74](https://github.com/DylanL-Dev/RestoManager/pull/74), commit `9bd6e0bf` : **unitaires 111/111, navigateur Mission 2 13/13, navigateur Mission 3 77/77**, tous sans réseau distant ; workflow GitHub `42736088257` **réussi**. Workflow Mission 3 intégration `42736088651` **réussi** : PostgreSQL, browser mock, Auth/REST/Realtime locale ; **2 scénarios pré-migration, 29 API et 6 navigateurs authentifiés fictifs réussis**, dont deux sessions et protections RLS. **Réserve P2 : le SDK de dépendance du harnais reste sur `@supabase/supabase-js 2.57.0` tandis que les modules frontend importent `2.119.0`; la validation est passée mais la parité de version n'est pas encore établie.** À traiter sans déploiement de fonctionnalité et sans assouplissement réseau.
- **Étape 4 — BLOQUÉE (10/11/2026, précontrôles exécutés)** : [compte rendu, preuves et procédure de recette](audits/RM-AUDIT-01_ETAPE4_20261110.md). La cible effective du clone est Supabase DEV `lykoybacslvmhtzftqsf`. Deux profils actifs sont reliés à Auth, confirmés, non bannis et correspondent aux alias Restaurant/Réception ; aucun accès de recette n’est cependant fourni au runtime (zéro secret). **7 précontrôles PASS, 0 FAIL et 8 ensembles de recette BLOQUÉS ; aucun parcours authentifié hébergé exécuté.** Les deux connexions publiques PC/mobile, les imports SDK et les helpers de minuit ont été contrôlés sans écriture. Les imports 2.57.0/2.119.0 réussissent, mais la parité fonctionnelle SDK reste en réserve P2. Aucune création de compte nécessaire ni effectuée ; procédure sécurisée conditionnelle et scénarios S01–S10 préparés. Aucune donnée fictive créée, donc aucun nettoyage exécuté. **Clôture non possible sans preuve authentifiée.** Les validations techniques des étapes 1–3 restent inchangées.
- **Complément final — VALIDÉ TECHNIQUEMENT (proposition, 10/11/2026)** : [tableau final, niveaux de preuve et réserves](audits/RM-AUDIT-01_VERIFICATIONS_FINALES_20261110.md). Le [complément manuel de la PR #75](https://github.com/DylanL-Dev/RestoManager/pull/75#issuecomment-6763913217) confirme déclarativement la recette DEV ; il ne constitue pas une trace Playwright hébergée. Nouveaux essais : 111 tests Node, 13 groupes Mission 2, 77 Mission 3, 14 affichage, 2 rôles au passage de minuit ; replay isolé des **58 fonctions, 47 RLS, ACL et 24 triggers DEV** : **62 scénarios SQL, 34 scénarios API et 6 groupes navigateur Auth/Realtime**, tous réussis. SDK du harnais aligné à **2.119.0** comme le frontend, lockfile et bundle réel testés ; réserve P2 de divergence de version levée sur cette branche. Les tentatives intermédiaires et les preuves initiales sont conservées. Aucun test robot authentifié hébergé ajouté ; cette couverture reste apportée par les confirmations manuelles déclarées. Pas de fusion/publication/écriture production.
- **Décision de clôture** : `RM-AUDIT-01 — CLÔTURÉE ✅` par validation explicite du responsable le 10/11/2026 et fusion documentaire/harnais vers DEV (PR #75). Les limites sont acceptées : parcours hébergés confirmés manuellement, scénarios de sécurité/concurrence/Auth/Realtime automatisés sur pile locale isolée ; aucune prétention de robot authentifié sur Render. La ligne historique « Étape 4 — BLOQUÉE » conserve l'état du précontrôle avant ces compléments, **et ne représente pas le statut final**.
- **Préparation RM-005 uniquement** : [candidat issue #3, périmètre/dépendances/risques/ordre proposé](audits/RM-005_PREPARATION_SANS_DEVELOPPEMENT.md). Aucun développement engagé ; identification à confirmer après clôture.
- **Après clôture** : RM-005 peut être cadrée à partir de [l'issue #3](https://github.com/DylanL-Dev/RestoManager/issues/3) et du document de préparation ci-dessus. **Ne pas commencer son développement sans validation distincte du périmètre.** Conserver la règle d'une seule évolution active et la séparation DEV / V3 / MAIN / Supabase production.

## Évolution active — RM-005 (étape 1, horaires configurables)

**Statut : EN COURS DEV — 10/11/2026.** Démarrage explicitement autorisé par l'utilisateur (« C'est parti »). Branche de travail isolée : `feature/rm-005-horaires`, issue métier [#3](https://github.com/DylanL-Dev/RestoManager/issues/3). **Une seule évolution RM-005**, qui regroupe horaires, messages d'erreur, liste des réservations et présentation visuelle des tables de passage. Chaque volet doit être testé et accepté successivement ; **une seule livraison finale** après accord explicite.

- **Étape 1 active :** horaires par restaurant (début/fin des services, dernière réservation, clôture, changement du jour de service, restaurants nocturnes). Préserver les valeurs actuelles du Mercure : midi 12:00–14:30, soir 19:00–21:30, clôture 23:30, changement de jour 00:00 Europe/Paris.
- **Critères :** réglages isolés par établissement ; modification autorisée uniquement au rôle Restaurant habilité, Réception lecture seule ; aucun client installé ne disparaît ni ne se ferme silencieusement ; pas de réservation antidatée ou modifiée sans action ; reprise serveur en cas de coupure ; contrôle horaire cohérent sur deux appareils, été/hiver et après minuit.
- **Risques critiques :** séparation date civile/journée de service, RLS, collisions et clôtures concurrentes, PWA/cache, notifications et continuité des réservations. Avant migration : tests sur base jetable, revue des RPC et sauvegarde de la configuration DEV ; aucune migration production.
- **Volets suivants déjà cadrés :** erreur rouge explicite hors horaires à la création et à la modification ; liste Réservations compacte et accessible ; amélioration **visuelle uniquement** de la sélection des tables réellement libres pour les passages. Conserver l'étape actuelle d'installation après choix, sans nouveau statut « arrivé ».
- **État au 11/11/2026 :** à la demande du responsable, priorité temporaire au **volet interface Réservations**, sans abandonner le volet horaires. Première implémentation de liste compacte commune Restaurant/Réception effectuée uniquement sur `feature/rm-005-horaires` (`service-v3-reservations.js`, CSS RM-005 dédié, lien HTML et cache). Colonnes heure, client/chambre, couverts, table(s), origine, statut, notes/allergies et actions. Affichage mobile responsive. **Contrôle statique syntaxique JS réussi uniquement ; rendu visuel, navigateur authentifié, tests de régression et validation utilisateur EN ATTENTE.** Pas de fusion DEV, V3 ou MAIN, aucune écriture Supabase production. Le volet horaires reste à développer.

## Fiche à dupliquer pour chaque mise à jour

```md
### RM-XXX — [Intitulé] — [STATUT]
- Demande / problème :
- Critères de validation (Restaurant / Réception / PC / tablette / téléphone) :
- Fichiers et dépendances :
- Risques (synchronisation / jour de service / rôles / PWA / Supabase) :
- Commit(s) DEV :
- Tests automatiques et résultats :
- Test Render DEV (date et résultat) :
- Validation explicite de l'utilisateur (citation/date) :
- PR + commit V3 :
- PR + commit MAIN :
- Vérification GitHub Pages / PWA :
- Confirmation de production (date) :
- Prochaine action :
```

**Rappel impératif à annoncer à l'utilisateur lorsqu'il demande une nouvelle tâche :** « Nous avons déjà RM-XXX en cours / à valider. On la termine ou on la reporte explicitement avant d'ouvrir la suivante. »


## Audit direction RM-JOHN-01 — 12/11/2026 (DEV UNIQUEMENT)

- **Statut : À TESTER CLONE / PARTIEL**. Demandé explicitement par l'utilisateur : auditer les sept retours du directeur, corriger sur DEV sans toucher à V3 ni MAIN. C'est un volet d'audit de RM-005, pas une autorisation de publication.
- **Preuves détaillées :** [RM-JOHN-01 — sept remarques](audits/RM-JOHN-01_RETours_20261112.md).
- **Modifications DEV :** créneaux quart d'heure, choix de couverts, erreurs près des champs, explication du seuil conseillé ; salle Prestige ajoutée dans Supabase DEV, sans table déplacée.
- **Fermeture du week-end : correction DEV codée et vérifiée en SQL** : champs samedi/dimanche dédiés dans Supabase, trigger empêchant les nouvelles réservations du midi et les changements d'horaire vers ce service fermé ; choix de créneaux et Gestion raccordés. Essais transactionnels sans enregistrement fictif. **Toujours À TESTER CLONE sur Render** avec les deux rôles avant V3/MAIN.
- **Configuration DEV restaurée** après constat des valeurs de test inhabituelles : midi 12:00–14:30, soir 19:00–21:30, durée de table 90 min. Les anciennes valeurs étaient 00:00–18:00, 19:00–23:55 et 45 min ; aucune réservation déjà présente n'a été supprimée.
- **Validation utilisateur :** en attente pour les nouvelles interactions Réception/Restaurant sur Render ; aucun déploiement V3 / MAIN.

- **Audit technique final RM-JOHN-01** : PR QA #102 non fusionnée, 6/6 contrôles GitHub réussis dont 127/127 tests unitaires ; fermeture samedi/dimanche midi vérifiée par test SQL sans réservation persistée. **Statut : À TESTER CLONE**, validation utilisateur sur Render nécessaire.


## RM-JOHN-02 — Planning hebdomadaire par jour — À TESTER CLONE (12/11/2026)

- Demande validée par l'utilisateur : reprendre la maquette de planning hebdomadaire sur PC, tablette et mobile, sans modifier V3/MAIN. Volet actif de RM-005.
- **DEV uniquement** : sept jours indépendants, ouverture midi/soir, heures de début et dernière réservation, copier vers jour cible et copier lundi→jours ouvrés.
- Réglages par restaurant synchronisés via `restaurant_hours.weekly_schedule` et garde serveur sur chaque création / changement d'horaire. Le jour est déterminé selon **Europe/Paris**.
- Migration DEV : `20261112211500_weekly_schedule_dev.sql`. Permissions durcies : `20261112212500_weekly_hours_rls_dev.sql`.
- Navigation responsive : tableau PC, disposition intermédiaire tablette, cartes repliables téléphone. Tests Playwright `tests/browser/weekly-ui.cjs` pour 1440/800/390 px.
- **Aucune réservation existante modifiée** ; durée existante conservée (60 min au moment de l'audit), jours fermés antérieurs conservés.
- Rapport : [RM-JOHN-02](audits/RM-JOHN-02_PLANNING_HEBDOMADAIRE.md).
- Fermetures ponctuelles par date : **hors de cette version**, à cadrer séparément.
- État : tests GitHub en cours, test Render et validation explicite utilisateur encore nécessaires avant promotion.

## RM-JOHN-03 — Indicateur des places restantes par créneau (DEV, à valider)

- **Origine** : proposition validée visuellement par l'utilisateur : « 4 places à 19h30 », couleurs de disponibilité comme billets de train, pour Réception et Restaurant.
- **Code DEV** : `service-v3-slot-capacity.js` estime les places physiques non occupées sur l'intervalle complet à partir des tables connues, des réservations bloquantes et des verrous temporaires. Une fusion autorisée sert à confirmer la compatibilité du groupe mais ne crée jamais de capacité artificielle. `service-v3-booking-director-choices.js` présente l'indicateur sous chaque bouton de créneau ; code de réservation initial et attribution restent inchangés.
- **Sécurité d'affichage** : synchronisation absente, hors ligne ou réservation sans table assignée → « À vérifier » ; absence de table compatible pour le nombre de couverts demandé → « Pas de table pour N », bouton indisponible ; les autres créneaux indiquent un nombre estimatif sous réserve de confirmation serveur.
- **Échelle** : vert ≥5 places ; orange 2–4 ; rouge 1 ; gris complet. C'est **un indicateur de places physiques disponibles**, pas une promesse de table unique ; la validation Supabase reste l'autorité.
- **Régression** : `tests/booking-slot-capacity.test.cjs` couvre places libres, chevauchements, réservations installées, verrous, fusions, comptes de groupes, réservations non attribuées et connexion indisponible.
- **État** : À TESTER CLONE (Réception + Restaurant, PC/tablette/mobile, vraie concurrence multi-appareils). Pas d'autorisation de publication V3/MAIN.


## RM-JOHN-04 — Salle Prestige et visibilité des créneaux (13/11/2026)

- **DEV uniquement / À TESTER CLONE** : signalement utilisateur sur captures mobile, les créneaux montrent tous « À vérifier » et les tables de la Salle principale apparaissent même après sélection de Prestige.
- Vérifié dans Supabase DEV : Salle principale **22 tables actives / 23 enregistrées**, Salle Prestige **0 table**, aucune réservation à venir sans attribution constatée au moment du contrôle. Aucune donnée modifiée.
- **Correctif affichage** : le filtrage du panneau Tables prend désormais l'identifiant de salle sélectionné ; une Salle Prestige vide montre un état explicite et le formulaire conserve Prestige après ajout. Le choix de salle n'ajoute ni ne déplace automatiquement des tables. L'affichage des tables désactivées reste séparé pour permettre leur réactivation.
- **Suppression sécurisée** : salle vide = bouton Supprimer qui désactive la salle côté Supabase, en conservant l'historique ; salle contenant des tables = refus. Table utilisée = « Retirer » (désactivation et conservation de l'historique), restauration possible. Aucune suppression irréversible d'une table liée à une réservation.
- **Correctif créneaux** : estimations affichées si snapshot reçu et état de synchronisation `ok` ou `readonly` ; indisponibilité de connexion / donnée incomplète = « À vérifier ». Toujours soumis à la validation serveur.
- **Tests** : `tests/room-isolation-and-slot-visual.test.cjs`, suite existante; validation mobile/tablette dans DEV encore nécessaire.
- **Ne pas promouvoir vers V3 ou MAIN sans validation explicite**.


## RM-JOHN-05 — Créneaux & arrivée + nom des clients extérieurs (13/11/2026)

- **Demande** : lier visuellement la disponibilité des horaires et le suivi des arrivées, ajouter icônes Lucide de places restantes, éviter les erreurs de capacité en bas de formulaire ; **garder impérativement la grande modale « Forte affluence »** comme deuxième confirmation.
- **DEV seulement / À TESTER CLONE** : boutons de créneaux avec `users` (places estimées), `activity` (affluence élevée selon **le même moteur RestoRush** que le suivi des arrivées), `info` (explication des indicateurs). Couleurs des places préservées même lorsque le créneau est sélectionné.
- Incompatibilité connue : bouton cliquable pour expliquer l'impossibilité sous les horaires sans changer la sélection ; validation du même état avant enregistrement. État de synchro incertain : laisser « À vérifier » et déléguer aux contrôles Supabase existants.
- **La modale `RestoRush.confirm` n'a pas été remplacée ni retirée.** Les arrivées conseillées restent distinctes des places physiques.
- **Nom obligatoire uniquement pour client extérieur** : champ `bookingClient` obligatoire avec message adjacent dans les deux rôles ; côté hôtel nom facultatif, numéro de chambre selon règles existantes. Éditeur de réservation adapté, sauvegarde Supabase et nouveau trigger `private.require_named_exterior_guest` sur INSERT/UPDATE de `guest_name/notes` pour les réservations marquées `[RESTOMANAGER:EXTERIEUR]`.
- Migration DEV : `20261113015700_john_exterior_guest_required_dev.sql` **déjà appliquée à DEV seulement** ; tests SQL avec transaction annulée : nom générique refusé, nom réel accepté, aucune réservation factice conservée.
- Tests : `tests/browser/director-slot-form.cjs` (mobile 390, tablette 800, PC 1440 ; icônes et couleurs ; blocage d'une capacité impossible ; bascule Hôtel/Extérieur), plus tests unitaires. Le résultat sur la véritable application Render doit être validé avec les deux rôles avant V3/MAIN.


## RM-JOHN-07 — Maquettes mobile/tablette, affluence immédiate (13/11/2026)

- **DEV uniquement — À VALIDER SUR CLONE.** Maquettes mobile/tablette acceptées, refonte frontend des créneaux et du nombre de couverts.
- **Avant même le choix des couverts**, aperçu d'affluence indépendant du nombre de personnes via le **même moteur `RestoRush.evaluate`** : statut « Arrivées nombreuses » dès 80 % du seuil conseillé, « Seuil conseillé atteint » à 100 %, chiffres affichés sur chaque créneau et dans les formulaires Réservation et Passage.
- **Disponibilité physique distincte** : ne jamais assimiler `21 / 22 arrivées` à `1 place libre`. L'estimation des tables reste recalculée après le choix d'un nombre de personnes.
- **Mobile** : quatre créneaux visibles par défaut sur deux colonnes, bouton « Voir les autres horaires », boutons compacts `1..7 + 8+` pour les couverts. Le champ de nombre personnalisé n'apparaît que pour `8+`. La même logique est adaptée sur tablette et PC.
- Icônes Lucide `activity`, `users`, `info` ; explications dans une section repliable.
- **Sécurité conservée :** aucune modification de la grande modale `RestoRush.confirm` pour dépassement du seuil lors de la réservation, ni des règles de validation Supabase. Aucun changement de base.
- Nouveau module `service-v3-arrival-preview.js/.css`, modifications de `service-v3-booking-director-choices.js` ; tests Playwright du formulaire Réservation/Passage aux largeurs 390, 800 et 1440 px.
- Déploiement Render DEV et validation visuelle des deux formulaires encore nécessaires. V3/MAIN non autorisés.


## Prépublication RM-005 — revue CI 13/11/2026

- **Statut global : CI PASS — À TESTER CLONE AVEC LES DEUX RÔLES / NON AUTORISÉ POUR V3 OU MAIN.** Rapport complet : [RM005_PREPUB_AUDIT_RESULT_20261113.md](audits/RM005_PREPUB_AUDIT_RESULT_20261113.md).
- **3 workflows réussis / 3** sur [PR QA #117](https://github.com/DylanL-Dev/RestoManager/pull/117) (non fusionnée) : 152 tests Node/152, syntaxe 124/124, 13+98 scénarios browser, 14 affichages, tests hebdomadaires et créneaux sur 390/800/1440 px, PostgreSQL et Supabase local RLS/Auth/Realtime. Aucune erreur automatique résiduelle.
- Tests préexistants corrigés sur DEV pour la nouvelle version de script et les icônes Lucide, **sans désactiver les garde-fous métier**.
- Comparaison SQL distante **lecture seule** : PROD ne dispose pas des champs de planning/fermetures ni du RPC de fusion 2–4 tables présents en DEV. Pas de migration ni copie de configuration DEV vers PROD.
- Aucune validation de parcours hébergé authentifié Render pour les nouvelles fonctions ; consentement utilisateur obligatoire avant chaque lot V3/MAIN. Ne pas déclarer « prêt à publier » sans tests terrain, revue des dépendances et préparation de migrations distinctes.


## Incident RM-005 — passage hors horaires historiques (13/11/2026)

**Retour utilisateur Render DEV :** six tests métier validés sur huit (1 créneaux, 2 réservation, 3 synchronisation Réception/Restaurant, 4 hôtel/extérieur, 7 fusions, 8 salles/Prestige). Tests **5 installer/libérer un passage** et **6 planning/fermetures** initialement non validés. Puis incident : les passages du vendredi (service midi 12:00–16:30) et du samedi/dimanche (12:00–17:30) sont refusés malgré le planning sauvegardé.

**Cause confirmée côté SQL :** le planning hebdomadaire est bien enregistré en DEV ; plusieurs RPC `SECURITY DEFINER` consultaient encore les champs horaires généraux `lunch_end=14:30` plutôt que les horaires par date. Le groupe SQL de passage `install_walkin_group_v3/v4` était directement concerné.

**Correction DEV uniquement :** migrations `20261113153000_rm005_walkin_weekly_server_dev.sql` et `20261113164500_rm005_weekly_helper_writer_grant_dev.sql` appliquées à Supabase DEV. Sept fonctions serveur utilisent la règle hebdomadaire partagée ; la deuxième migration accorde l'EXECUTE du helper **uniquement au rôle interne `resto_service_writer`**, sans accorder d'accès direct à `anon` ni `authenticated`. Messages de formulaire clarifiés et durée réellement configurée utilisée. Aucun changement de réservation ou base PROD.

**Preuves DEV :** 10/10 cas jour/heure et autre établissement conformes ; installation d'un passage authentifié `install_walkin_group_v3` vendredi midi prolongé **PASS**, et créations Réception `reception_booking_v3` vendredi 15:50, samedi 16:00, dimanche 16:00 **PASS**, toutes réalisées en transaction **ROLLBACK** ; vérification de **0 réservation de test persistée**. Fonction helper inaccessible directement à `anon`/`authenticated`. QA finale : [#119](https://github.com/DylanL-Dev/RestoManager/pull/119).

**Statut :** correctif technique appliqué et tests SQL réels PASS ; recette navigateur hébergé Render du passage et du planning par utilisateur **EN ATTENTE**. MAIN/V3 et Supabase PROD restent interdits de publication sans validation explicite et revue des migrations PROD.


## RM-005 — Recette utilisateur clôturée 8/8 (13/11/2026)

**Statut de la recette sur DEV : 8 tests utilisateur sur 8 validés.** Retour du propriétaire du projet et captures Render DEV :

1. Créneaux horaires intelligents — **VALIDÉ**.
2. Création d'une réservation — **VALIDÉ**.
3. Synchronisation Réception / Restaurant — **VALIDÉ**.
4. Client hôtel / client extérieur — **VALIDÉ**.
5. Installation et libération d'un passage — **VALIDÉ** après correction des gardes horaires serveur. Capture : table 2, installation vendredi à 15:52, puis statut « libéré » observé en base DEV.
6. Planning et fermetures — **VALIDÉ** pour les horaires ouverts testés : vendredi 12:00–16:30, réservation samedi 14/11 à 16:00 et dimanche 15/11 à 13:00. Le rejet hors horaire est couvert par la recette automatique. Les réservations de démonstration du week-end apparaissent comme annulées lors du contrôle DEV en lecture seule.
7. Fusions intelligentes — **VALIDÉ**.
8. Salles et Salle Prestige — **VALIDÉ**.

**Tests automatiques :** [QA #119](https://github.com/DylanL-Dev/RestoManager/pull/119), trois workflows PASS / trois (158 tests Node), PostgreSQL, Playwright et Supabase local. **Render DEV :** commit `ba93af5`, statut LIVE. Les RPC SQL DEV ont également été validés sur des transactions annulées (0 réservation fictive persistée par les tests SQL).

**Important :** la réussite de la recette DEV ne constitue PAS une autorisation de migrer Supabase PROD ou de publier sur MAIN/V3. Avant mise en production : préparer le diff SQL ciblé (planning hebdomadaire, rôles, RPC fusion et contrôle des noms extérieurs), prévoir sauvegarde/rollback, revérifier sécurité RLS et SQL, sauvegarder les branches divergentes, puis demander la validation explicite de l'utilisateur pour chaque publication.


## RM-006 — proposition de feuille de route (13/11/2026)

- **État : CANDIDAT / PÉRIMÈTRE À VALIDER, aucune fonctionnalité RM-006 publiée ou développée à ce titre.**
- Proposition détaillée : [RM006_ROADMAP_PROPOSAL_20261113.md](RM006_ROADMAP_PROPOSAL_20261113.md).
- Préparer RM-005 ET RM-006 sans les mélanger : RM-005 passe par la revue SQL/branches/rollback puis demande d'accord explicite ; RM-006 reste à l'étape de sélection des fonctions avant développement.
- Pas de modification de MAIN, RestoManager-V3 ou Supabase PROD sans accord explicite.

## RM-013-A — Retour de recette : dépliant Clôture et durée — À TESTER CLONE (16/11/2026)

- Même évolution RM-013-A, reprise après les captures utilisateur : « clôture de service ça se déroule pas » et encadré de durée « 1 h » à retravailler. Aucune nouvelle règle de clôture RM-012.
- Base DEV : `76a5a7e` (PR #152), publiée sur le clone Render par `dep-dbtc60gae00c73aakgdg`. Branche corrective : `fix/rm013a-closure-duration`.
- Critères : dépliant Clôture ouvrable au toucher et au clavier avec la vraie protection authentifiée ; état et archives visibles ; durée compacte, sans double encadré, sélecteur/sauvegarde conservés ; mobile/tablette/PC et Réception inchangée en lecture seule.
- Risques à contrôler : filtrage des clics par identifiant, navigation confondue avec mutation, styles hérités après déplacement de la durée, droits, PWA/cache. Tests fictifs uniquement ; pas de réservation, clôture ni écriture en base distante. V3/MAIN attendent la validation utilisateur du clone.

- Correctif : navigation Clôture distinguée des mutations ; action manuelle transmise au gestionnaire partagé uniquement pour Restaurant connecté, sans changer les règles de clôture ; durée sans double cadre et valeur compacte.
- Validation technique : syntaxe 133/133, 51 fichiers de tests, matrice Playwright 14 combinaisons avec vrais clics, sauvegarde de durée et clôtures fictives protégées. Ressources modifiées versionnées `20261116-rm013a2`. Rapport et captures : [retour de recette RM-013-A](audits/RM013A_RETOUR_RECETTE_20261116.md).
- Validation utilisateur sur le clone : EN ATTENTE. Aucun statut VALIDÉE CLONE et aucune promotion V3/MAIN.

## RM-013-A — Formulaire Assistance avant publication — PRÊTE À PUBLIER (16/11/2026)

- Validation utilisateur du lot précédent et du correctif Clôture/durée : « Parfait je pense qu'on peut valider et mettre sur main sur V3 main », avec demande préalable de renommer « Contacter le créateur » en « Assistance » et d'harmoniser ce formulaire.
- Même mission RM-013-A ; branche `feature/rm013a-assistance-form` depuis DEV `91e8017`. Nouveau formulaire à vérifier sur mobile/tablette/PC et pour les deux rôles ; maintien de l'envoi privé, des types et priorités enregistrés, de la protection des champs et de la conservation d'un message en cas d'échec.
- Périmètre UI uniquement : remplacer les anciennes fenêtres de choix par des contrôles intégrés cohérents, moderniser les champs et la confirmation d'envoi. Aucun changement de droits ou de schéma Supabase ; tests fictifs, aucun message d'essai envoyé à l'assistance réelle.
- Préparer ensuite la livraison ciblée V3 puis MAIN autorisée par l'utilisateur, en conservant les configurations propres aux environnements et en excluant les migrations DEV. Ne pas fusionner DEV en masse.

- Réalisé : choix intégrés et libellés Assistance, champs et bouton harmonisés, retours d’envoi et mode sombre ; aucune modification des enums, de la table ou de la confidentialité des signalements.
- Tests techniques : syntaxe 134 fichiers, 51 fichiers unitaires, 14 combinaisons navigateur d’Assistance, 110 scénarios Mission 3. Captures et détail : [Assistance RM-013-A](audits/RM013A_ASSISTANCE_20261116.md). Livraison ciblée V3 puis MAIN demandée après ce dernier ajustement ; configurations de production préservées.

## RM-013-A — PUBLIÉE V3 / PUBLIÉE MAIN (16/11/2026)

- Validation utilisateur : « Parfait je pense qu'on peut valider et mettre sur main sur V3 main », avec harmonisation d’Assistance réalisée avant publication.
- DEV : PR [#154](https://github.com/DylanL-Dev/RestoManager/pull/154), fusion `70531067b10536a44964fb579cc22b2d13f2a6f9`. Render DEV `dep-dbtdi5jbc2fs73drpf60` LIVE ; les ressources de la version `20261116-rm013a3` correspondent au code testé.
- V3 : PR [#155](https://github.com/DylanL-Dev/RestoManager/pull/155), fusion `e5e98ca879628cf6efa8ed0e4542f2a97e3bda1f`, avant MAIN. MAIN : PR [#156](https://github.com/DylanL-Dev/RestoManager/pull/156), fusion `a8915f9d04e51914d25280e910c3d60b4a027fd2`. Arbre commun `4836499956a0de8ec7acdf2cdf5f0d136bb99ed3`.
- Contrôles de publication : deux workflows V3 réussis et cinq MAIN réussis ; configuration PROD préservée, 154 tests unitaires, Gestion 14 combinaisons et Assistance 14 combinaisons, scénarios complémentaires des salles/planning/réservations et PostgreSQL isolé. Le fichier du test hebdomadaire manquant au premier paquet a été ajouté ; toutes les vérifications du paquet final sont vertes.
- GitHub Pages : [déploiement 43849260979](https://github.com/DylanL-Dev/RestoManager/actions/runs/43849260979) réussi. HTML canonique et douze fichiers/ressources publiés en HTTP 200, empreintes identiques à la livraison testée. [Preuve machine](audits/preuves/rm013a-publication-20261116.json).
- Aucun routage DEV, changement de dépendances PROD ni migration transmis. Modules de connexion PROD inchangés ; aucun message, réservation ou clôture de test écrit dans les données du restaurant.
- Retour arrière : `backup/rm013a-v3-before-20261116` (`cc516a3`) et `backup/rm013a-main-before-20261116` (`2f0c2bc`).
- Statut final technique : **PUBLIÉE V3 / PUBLIÉE MAIN**. La confirmation de l’utilisateur sur la production réelle reste distincte ; ne pas inscrire « CONFIRMÉE EN PRODUCTION » sans ce retour.


## RM-014 — Centre de notifications — EN COURS DEV (16/11/2026)

- Demande explicite : issue #158, tous les lots sur `feature/rm014-notification-center`, créée depuis DEV `e3a5daa`. La mission RM-013-A est publiée ; son historique n’est pas réécrit. RM-014 est la seule évolution engagée ici.
- Périmètre : cloche unique, rappels et événements Réception réunis, lecture/priorités/report, nouveautés publiées et mise à jour protégée RM-011-A, adaptateur futur RM-012 inactif.
- Critères : deux rôles × 360/390/430/768/1024/1440/1920 ; absence de fuite, de doublon, de données sensibles en aperçu ; résolution après arrivée/libération y compris après minuit Paris ; panne explicite ; clavier/focus/thème sombre ; aucune perte de brouillon.
- Risques : événements persistants et rappels dynamiques ont des durées de vie différentes ; état local isolé par utilisateur/établissement ; PWA et multi-onglets ; aucune annonce avant preuve de publication effective.
- Tests exclusivement sur harnais isolé et données en mémoire. Aucune migration ni écriture sur Supabase DEV/PROD, aucune réservation ou clôture dans les données réelles. PR vers DEV uniquement ; aucune modification V3/MAIN, aucune fusion automatique.


### Livraison RM-014 — À TESTER CLONE après intégration (16/11/2026)

- Les cinq lots de l’issue #158 sont réalisés sur `feature/rm014-notification-center`, depuis DEV `e3a5daa` : audit/prototype, centre unifié, nouveautés/mise à jour sécurisée, contrat RM-012 inactif, validations et corrections de régression. PR [#159](https://github.com/DylanL-Dev/RestoManager/pull/159) préparée vers DEV uniquement ; aucune fusion automatique ni publication Render dans cette mission.
- Code testé `d08e8f6777f986c67bec79aead7fa6d8fcbbd915` : **six workflows GitHub réussis / six**, 212 tests Node, syntaxe 141 fichiers, RM-014 14 combinaisons / 24 groupes de cycle de vie / 12 groupes PWA. Régressions Réservations, Gestion, Assistance, horaires, tables, PostgreSQL et Auth/RLS/Realtime isolés validées. [Rapport détaillé, captures avant/après et preuves](audits/RM014_NOTIFICATIONS_20261116.md).
- Préservation : modules de connexion, configuration d’environnement et lockfile inchangés ; aucune migration ni écriture dans Supabase DEV/PROD, aucune réservation/clôture fictive dans les données réelles. V3 reste `e5e98ca`, MAIN `a8915f9`, DEV cible `e3a5daa` au contrôle de livraison.
- État : **PR prête à relire, validation utilisateur du clone encore en attente**. Les captures sont celles du frontend DEV authentifié via frontière fictive, pas d’une session Render réelle. Cette fiche ne vaut ni validation visuelle de terrain ni autorisation de promotion V3/MAIN. Les ressources applicatives des preuves restent identiques lors de l’ajout documentaire final.


### RM-014 — Render DEV publié, À TESTER CLONE (16/11/2026)

- Nouvelle instruction propriétaire après préparation de la PR : « Pour que je puisse voir », en réponse au déploiement Render non encore réalisé. Intégration et publication du clone DEV autorisées ; aucune autorisation V3/MAIN/PROD.
- PR [#159](https://github.com/DylanL-Dev/RestoManager/pull/159) fusionnée vers DEV uniquement, commit `3e3a08a807093b196648be1eb8da80e244b69f77`, après les six workflows verts. L’arbre fusionné est identique au paquet relu/testé `6a10ff5`.
- Render : service `srv-dbm8o15g1s2s73cemju0`, branche `feature/v3-supabase-full-clone`, déploiement `dep-dbticiei0phs73f0pd00` **LIVE**, fin `2026-11-16T15:50:54Z`. Build statique inchangé, sans migration.
- Vérification publique : 17 ressources HTTP 200 avec empreintes identiques aux fichiers testés/protégés ; HTML et manifeste canoniques vérifiés séparément, version `2026.11.16-rm014`, canal `dev`. [Preuve du déploiement](audits/preuves/rm014-render-20261116.json).
- Lien : https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html?preview=rm014 . La nouvelle cloche donne accès au centre et à « Quoi de neuf ? » ; la rubrique est également dans Gestion.
- Aucune réservation, clôture ou donnée d’essai réelle, aucune écriture Supabase effectuée par le déploiement. V3/MAIN préservées. Le clone est disponible pour la recette du propriétaire ; aucune validation visuelle/authentifiée hébergée prétendue à sa place.


### RM-014 — Retour de recette : accès aux nouveautés — EN COURS DEV (16/11/2026)

- Signalement propriétaire : clic « Voir les nouveautés » sans effet sur Render DEV. Branche `fix/rm014-release-history-navigation`, créée depuis DEV `c73f953`.
- Reproduire les accès carte de notification / pied du centre / Gestion, puis allers-retours, fermeture et réouverture et marqueur lu. Critère : contenu réel de l’historique visible, focus correct, aucune perte de brouillon, mobile/tablette/PC et deux rôles.
- Correctif limité à la navigation et au rendu du centre ; tests isolés, aucune réservation/clôture ou écriture en base réelle. Déploiement sur le même clone Render DEV dans le cadre du retour de recette. V3/MAIN/PROD restent interdits.

- Reproduction confirmée avant correction : cache d’historique réutilisé alors que le conteneur affichait les notifications. Correction : identité de la vue dans la validation du cache, sans supprimer le cache des rafraîchissements identiques. Version `2026.11.16-rm014.1`, références de scripts et cache PWA renouvelés.
- Tests locaux : 14 combinaisons avec accès réels carte/pied/Gestion et allers-retours, 24 groupes de cycle de vie, 12 groupes PWA, syntaxe et tests Node réussis. [Compte rendu et captures](audits/RM014_NEWS_NAVIGATION_20261116.md). Contrôles GitHub à confirmer avant fusion DEV et déploiement du correctif sur Render.


### RM-014 — « Voir les nouveautés » corrigé et publié sur Render DEV (16/11/2026)

- Reproduction avant correction puis clics carte/pied/Gestion, filtres et allers-retours validés aux sept largeurs pour les deux rôles. Six workflows GitHub verts sur `7863f13` ; PR #161 fusionnée vers DEV `bb2ed4b`.
- Render `dep-dbtj12ei0phs73dgbk10` **LIVE** à `16:34:36Z`, version `2026.11.16-rm014.1`, dix-sept ressources HTTP 200 / empreintes conformes ; HTML, manifeste et lien de prévisualisation également vérifiés sans cache obsolète. [Rapport et preuve](audits/RM014_NEWS_NAVIGATION_20261116.md).
- À TESTER CLONE par le propriétaire ; aucune validation de terrain inventée. Aucun changement V3/MAIN, RLS, configuration ou base Supabase, aucune donnée d’essai réelle.


### RM-014 — VALIDÉE CLONE, livraison V3 puis MAIN autorisée (16/11/2026)

- Validation explicite propriétaire après le correctif « Voir les nouveautés » : « C’est parfait on valide on déploie sur V3 et main ».
- Source validée : DEV `12ce881`, code correctif `7863f13`, PR #159 et #161 ; Render `dep-dbtj12ei0phs73dgbk10` LIVE, version `2026.11.16-rm014.1`.
- Préparation d’une livraison ciblée sur branches filles de V3 et MAIN. Copier seulement notifications, navigation protégée, nouveautés/PWA et tests correspondants. Conserver les modules de connexion PROD, les dépendances existantes et les règles de données ; pas de fusion DEV globale.
- Adapter le canal de publication à `main` et le précache aux fichiers réellement présents en production ; ne pas annoncer comme publiée une version uniquement DEV. Sauvegarder les deux branches, vérifier CI du paquet réel, fusionner V3 puis MAIN, puis contrôler GitHub Pages et les empreintes servies.
- Supabase PROD reste hors autorisation de modification : aucune migration, RLS, écriture de réservation/clôture/message ou opération de données.


### RM-014 — PUBLIÉE V3 / PUBLIÉE MAIN (16/11/2026)

- Recette Render validée et publication expressément autorisée : « C’est parfait on valide on déploie sur V3 et main ». Validation enregistrée par PR #163. Livraison ciblée, aucun transfert de configuration DEV ou migration.
- V3 : PR [#164](https://github.com/DylanL-Dev/RestoManager/pull/164), trois workflows réussis, fusion `c5ef487813e27821c1435350cc44429dd719438d` effectuée en premier. MAIN : PR [#165](https://github.com/DylanL-Dev/RestoManager/pull/165), six workflows réussis, fusion `f17e6ea43f94452d3608eb778e218f350542e730` ensuite. Arbre de fichiers identique `4e31d4c6b39bad8b3f6570e24c970f9dd6688b8a`.
- Paquet réel production : 135 fichiers de syntaxe, 184 tests Node, 14 combinaisons notifications, 24 groupes de cycle de vie, 12 groupes PWA ; régressions Gestion/Assistance/salles/réservations et PostgreSQL isolé dans les CI propres aux cibles. SDK npm 2.57.0 et lockfile d’origine conservés.
- GitHub Pages : [déploiement 43918618758](https://github.com/DylanL-Dev/RestoManager/actions/runs/43918618758) réussi sur le commit MAIN. Dix-huit ressources HTTP 200 / empreintes conformes ; entrée et manifeste canoniques et lien de version vérifiés. Version `2026.11.16-rm014.1`, canal `main`, historique limité aux publications réelles de production. [Preuve machine et CI](audits/preuves/rm014-publication-20261116.json).
- Modules de connexion PROD, creator-auth.js, login.html et lockfile inchangés avant/après la publication publique. Précache 71 ressources, sans restomanager-env.js. Aucun schéma, droit RLS, paramètre de restaurant ou donnée Supabase PROD modifié ; aucune donnée fictive réelle créée.
- Sauvegardes : `backup/rm014-v3-before-20261116` (`e5e98ca`) et `backup/rm014-main-before-20261116` (`a8915f9`). [Rapport production](https://github.com/DylanL-Dev/RestoManager/blob/main/docs/releases/RM014_NOTIFICATIONS_20261116.md).
- Statut technique : **PUBLIÉE V3 / PUBLIÉE MAIN**. La validation du clone par le propriétaire ne remplace pas sa confirmation de l’affichage en production ; aucune mention « CONFIRMÉE EN PRODUCTION » inventée. Aucun test authentifié sur les données réelles effectué par l’agent.
