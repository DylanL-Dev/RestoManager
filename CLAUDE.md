# CLAUDE.md — instructions propres à Claude Code

Lire d'abord **[AGENTS.md](AGENTS.md)** : ses règles s'appliquent intégralement et priment sur ce fichier.

## Spécifique à Claude Code

- **Branches :** `claude/<ticket>-<sujet>` créées depuis le dernier commit DEV ; push uniquement sur cette branche (`git push -u origin <branche>`).
- **GitHub :** via `gh api` (REST). PR toujours en brouillon, vers `feature/v3-supabase-full-clone` uniquement. Ne jamais appeler les endpoints de fusion, `ready_for_review` ou `auto_merge` sans instruction écrite.
- **Commits :** terminer le message par le trailer `Co-Authored-By:` de Claude fourni par l'environnement.
- **Supabase / Render :** aucun outil ni appel réseau vers ces services sans mission explicite nommant l'environnement DEV ; ne jamais demander ni stocker une clé secrète.
- **Mode lecture seule :** si la mission est un audit, ne créer ni branche, ni fichier, ni commit.
- **Navigateur :** Playwright/Chromium est préinstallé dans l'environnement cloud ; ne pas lancer `playwright install` ni changer la version de `playwright` du `package.json`.
- **Quotas :** lectures ciblées (`grep`, extraits) plutôt que fichiers entiers — `service-v3.js`, `service-v3.css` et `v3-connected.html` dépassent 90 Ko ; tests proportionnés au changement ; signaler toute opération coûteuse avant de la lancer.
- **Compte rendu :** concis, en français, distinguant faits vérifiés et hypothèses ; terminer en attendant la validation du propriétaire.
