# AGENTS.md — règles communes des agents de développement RestoManager

S'applique à tout agent (OpenAI Codex, Claude Code…). Le propriétaire du projet décide et valide ; aucun agent ne fusionne, ne déploie ni ne touche la production de sa propre initiative.

## 1. Projet en bref

- Application web responsive + PWA en JavaScript natif (modules ES, sans framework ni build applicatif). Entrée : `v3-connected.html`. Icônes : Lucide local.
- Backend : Supabase (Auth, PostgreSQL/RLS, Realtime, Cron, Edge Functions dans `supabase/functions`). Migrations : `supabase/migrations`.
- Routage des environnements : `restomanager-env.js` et `reservation/environment.mjs`. **Ne pas modifier ce routage sans mission explicite.**
- Documentation : `README.md`, `docs/ENVIRONMENTS.md`, `docs/RELEASE_TRACKER.md`, rapports de mission dans `docs/audits/`.

## 2. Environnements et interdictions

| Cible | Rôle | Règle agent |
| --- | --- | --- |
| `feature/v3-supabase-full-clone` (DEV) | intégration, déployée sur Render | jamais de push direct ; PR uniquement |
| V3 (`feature/refonte-service-responsive-v3` / `RestoManager-V3`) | version utilisée en service | **interdit** sans autorisation écrite du propriétaire |
| `main` | production (GitHub Pages) | **interdit** sans autorisation écrite du propriétaire |
| Supabase DEV | base de développement | migration ou écriture seulement si la mission l'autorise |
| Supabase PROD | données réelles | **interdit** : ni écriture, ni migration, ni test, ni `db push` |

Toujours interdit, sauf autorisation explicite pour l'opération précise :
- fusion de PR, déploiement Render/GitHub Pages, modification de configuration Supabase ou Render ;
- `git push --force`, réécriture d'historique, suppression de branches (`backup/*` compris) ;
- migration destructrice, reset/seed, suppression ou écrasement de réservations ;
- ajout ou modification de workflows `.github/workflows/` ;
- tests pointant vers une base partagée contenant des données réelles.

Une autorisation ne vaut que pour la mission et la cible nommées : une promotion V3/MAIN n'autorise pas une migration PROD.

## 3. Secrets et dépôt public

Le dépôt est **public**. Ne jamais écrire dans le code, les commits, les PR, les logs ou les rapports : clé `service_role`/secrète, mot de passe, jeton, URL de connexion PostgreSQL, adresse e-mail ou donnée client réelle. Seules les clés Supabase *publishable* déjà présentes dans le routage sont admises côté navigateur. En cas de doute : ne pas commiter et signaler.

## 4. Branches

- Partir du **dernier commit DEV** : `git fetch origin feature/v3-supabase-full-clone`.
- Nommage : `<agent>/<ticket>-<sujet-court>` (ex. `claude/rm-021-planning`, `codex/rm-021-planning`) ; les préfixes historiques `feature/`, `fix/` restent valides.
- Une branche = une mission = une PR ciblée vers DEV, en **brouillon** tant que la validation n'est pas obtenue.
- Avant une intervention risquée sur une branche partagée, le propriétaire peut demander une sauvegarde `backup/<ticket>-<cible>-before-<AAAAMMJJ>`.

## 5. Éviter les conflits entre agents (à chaque mission)

1. `git fetch` puis lire les 15 derniers commits de DEV.
2. Lister les PR ouvertes vers DEV et leurs fichiers modifiés.
3. Si un fichier visé est déjà modifié par une PR ouverte d'un autre agent : **signaler avant d'écrire** et attendre l'arbitrage du propriétaire.
4. Avant d'ouvrir ou de mettre à jour la PR, refaire l'étape 1 ; en cas de nouveau commit DEV, fusionner DEV dans sa branche (jamais de rebase d'une branche déjà poussée) et relancer les tests.
5. Ne jamais modifier, pousser sur ou commenter la branche d'un autre agent sans instruction.

Fichiers à fort risque de conflit : `service-v3.js`, `service-v3.css`, `v3-connected.html`, `sw.js`, `app-release.json`, `docs/RELEASE_TRACKER.md`.

## 6. Tests

```bash
npm ci
npm run test:syntax
npm test
```

Puis les suites ciblées de `package.json` correspondant aux fichiers touchés (`test:*:browser` Playwright, `test:*:postgres` et `test:*:supabase` sur conteneurs isolés via Docker). Ne jamais lancer ces suites contre une base partagée. Une modification documentaire seule n'exige que la vérification qu'aucun fichier de code n'a changé. Ne jamais désactiver ni affaiblir un test pour obtenir une CI verte.

## 7. Traçabilité

- Commits : `<TICKET> DEV — <résumé>` (ex. `RM-021 DEV — horaires de fermeture`).
- Ajouter dans le message un trailer identifiant l'agent (ex. `Co-Authored-By:`), car l'auteur Git est partagé.
- PR : objectif, fichiers modifiés, tests exécutés avec leur résultat réel, risques, ce qui n'a **pas** été vérifié. Ne jamais présenter comme validé ce qui n'a pas été testé.
- Mission significative : rapport dans `docs/audits/<TICKET>_<SUJET>_<AAAAMMJJ>.md` et entrée dans `docs/RELEASE_TRACKER.md` si le propriétaire le demande.

## 8. Validation

1. L'agent livre une PR brouillon vers DEV avec CI verte.
2. Le propriétaire (assisté de ChatGPT) relit et valide.
3. Fusion DEV, déploiement Render, promotion V3/MAIN et toute action Supabase : **uniquement sur instruction écrite du propriétaire**, chacune séparément.

## 9. Principes produit

Améliorations progressives compatibles avec l'existant ; pas de réécriture d'une fonctionnalité qui marche sans justification. Interfaces mobile/tablette/ordinateur, Lucide, accessibilité, isolation stricte entre établissements, aucune donnée fictive dans une base réelle.
