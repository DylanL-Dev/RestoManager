# RM-SEC-02 — Séparation des identités GitHub : conception

**24/11/2026 — conception uniquement.** Issue #251. Aucun compte créé, aucune connexion ni aucun accès modifié.

## 1. Situation actuelle (vérifiée)

- Le propriétaire, Claude Code et Codex agissent sous le **même compte personnel**, qui est **propriétaire et administrateur** du dépôt public `DylanL-Dev/RestoManager`. Les PR #243–#245 ont toutes cet auteur.
- Conséquences :
  - un agent peut techniquement modifier les réglages, désactiver un ruleset ou fusionner sur `main` ;
  - une approbation obligatoire est impossible, car l'auteur d'une PR ne peut pas l'approuver ;
  - l'historique ne distingue pas les intervenants.
- Connexions actuelles :
  - Claude Code : compte GitHub relié au compte Claude (claude.ai) + application GitHub Claude installée sur le dépôt ;
  - Codex : compte GitHub relié à ChatGPT + application « ChatGPT Codex Connector » ;
  - Render et GitHub Pages : liés au compte du propriétaire, **non concernés** par cette migration.

## 2. Règles GitHub applicables

- **Conditions d'utilisation :** une personne ne peut détenir qu'**un seul compte gratuit**, plus **un compte technique (« machine account »)** créé par un humain et réservé à l'automatisation. Le propriétaire reste responsable de ses actions.
  - Un compte technique commun est donc conforme.
  - **Deux comptes techniques gratuits** (un par agent) ne sont pas prévus par ces conditions.
- **Dépôt d'un compte personnel :** deux rôles seulement, propriétaire et collaborateur.
  - Un collaborateur lit, pousse des branches et ouvre des PR.
  - Il ne peut ni modifier les réglages, ni les rulesets, ni ajouter de collaborateurs, ni supprimer le dépôt.
  - La documentation GitHub est ambiguë sur la fusion des PR par un collaborateur : **à tester**. Les rulesets s'appliquent de toute façon.
- **Contournement des rulesets :** le rôle « administrateur du dépôt » ne désignerait plus que le propriétaire. Le contournement d'urgence redevient donc réservé à lui.

## 3. Options comparées

| | A. Compte technique commun | B. Comptes distincts (Claude, Codex) | C. Organisation GitHub |
| --- | --- | --- | --- |
| Conformité GitHub | Conforme | Hors cadre gratuit (2 comptes techniques) | Conforme (organisation gratuite pour dépôt public) |
| Droits des agents | Collaborateur (non administrateur) | Idem | Rôle *Write* fin, équipes |
| Traçabilité | Préfixes de branche, étiquettes, trailers de commit | Native par compte | Native si comptes distincts |
| Approbation du propriétaire | Possible : l'auteur est le compte technique | Possible, mais un agent pourrait approuver l'autre → CODEOWNERS nécessaire | Possible |
| Coût | 0 € | 0 € (si toléré) ou comptes payants | 0 € |
| Impact | Faible | Faible | **Élevé** : transfert du dépôt, l'URL GitHub Pages de PROD change, ce qui touche le routage `restomanager-env.js`, `release-guard`, les origines Supabase/Turnstile et les QR codes |

**Recommandation : option A.** C'est la seule option conforme, gratuite et sans impact sur la PROD. Un compte commun empêche aussi qu'un agent approuve le travail de l'autre. La traçabilité par agent reste assurée par nos conventions : `claude/*` et `codex/*`, étiquettes `agent:*`, trailer `Co-Authored-By`. L'option C reste envisageable plus tard, avec un projet de migration PROD dédié.

## 4. Permissions cibles

| Identité | Rôle | Peut | Ne peut pas |
| --- | --- | --- | --- |
| Propriétaire (compte personnel) | Administrateur | Tout ; approuver ; contourner en urgence | — |
| Compte technique (Claude + Codex) | Collaborateur | Branches, PR, issues, commentaires, fusion là où le ruleset l'autorise | Réglages, rulesets, collaborateurs, Pages, suppression du dépôt ; approuver ses propres PR |

Rulesets correspondants (variante de RM-SEC-01, à préparer après validation) :
- `main` et `RestoManager-V3` : 1 approbation obligatoire + fichier `CODEOWNERS` (`* @DylanL-Dev`) avec approbation du propriétaire du code.
- DEV : 1 approbation tant que la délégation n'est pas active. On passe à 0 pour activer la délégation de niveau B : la règle « autorisation avant fusion » devient alors appliquée techniquement.
- Contournement : administrateur du dépôt, c'est-à-dire le propriétaire seul.

## 5. Connexion des outils et coûts

- **Principe : relier le compte technique aux abonnements existants.**
  - Claude Code : via la page de connexion GitHub de claude.ai ;
  - Codex : via la connexion GitHub de Codex dans ChatGPT ;
  - les applications GitHub restent installées sur le compte du propriétaire, et le compte technique y accède en tant que collaborateur ;
  - **aucun abonnement supplémentaire.**
- **Effet de bord :** dans Claude et dans ChatGPT, *toute* utilisation de GitHub passera par le compte technique, y compris pour d'autres dépôts. Il faudra l'ajouter comme collaborateur là où c'est utile.
- **Alternative :** des comptes Claude/ChatGPT dédiés aux agents, ce qui implique des abonnements supplémentaires. Non recommandée.
- **Coûts :** compte GitHub technique gratuit ; une adresse e-mail dédiée (un alias suffit) ; double authentification obligatoire ; identifiants conservés par le propriétaire dans son gestionnaire de mots de passe.

## 6. Points à tester avant toute bascule

1. Une session Claude Code reliée au compte technique voit le dépôt via l'application GitHub Claude (installée par le propriétaire) avec `push: true`, `admin: false`.
2. Même vérification pour Codex.
3. Un collaborateur peut fusionner une PR qui respecte le ruleset, et ne peut ni modifier un ruleset ni pousser sur une branche protégée.
4. Les workflows restent déclenchés par les PR du compte technique. Pour un collaborateur, GitHub ne demande normalement pas d'approbation d'exécution, contrairement aux contributeurs externes : à confirmer.

## 7. Procédure de migration (propriétaire, avec assistance des agents)

1. **Préparer** : aucune PR en cours de fusion ; mettre les agents en pause.
2. **Créer** le compte technique : e-mail dédié, double authentification, identifiants dans le gestionnaire de mots de passe du propriétaire. Aucun identifiant ne transite par une conversation IA ni par GitHub.
3. **Inviter** le compte technique comme collaborateur du dépôt, puis accepter l'invitation.
4. **Claude Code** : relier le compte technique à la place du compte personnel, puis ouvrir une nouvelle session.
   - Vérifications en lecture seule : identité GitHub vue par la session, droits sur le dépôt (`admin: false`).
   - Test : branche et PR en brouillon.
5. **Codex** : même opération dans ChatGPT, avec les mêmes vérifications.
6. **Activer** les rulesets RM-SEC-01, dans la variante avec approbation (§4), avec la procédure progressive déjà décrite.
7. **Documenter** : mettre à jour `AGENTS.md` (identités, approbations) et le registre.
8. **Retour arrière** : relier de nouveau le compte personnel dans Claude/ChatGPT, retirer le collaborateur, désactiver les rulesets. Aucune donnée n'est perdue.

Durée estimée côté propriétaire : environ 30 minutes, hors validation des tests.

## 8. Risques résiduels

- Le compte technique peut toujours pousser sur les branches non protégées et ouvrir des PR. C'est voulu : c'est ce qui préserve l'autonomie.
- La compromission du compte technique ne donne pas les droits d'administration ; on la limite avec la double authentification et un e-mail dédié.
- Si l'option A est retenue, les deux agents restent indiscernables au niveau du compte. La séparation par agent repose sur les conventions, et leur respect doit rester contrôlé.
