# DEV — audit navigateur du 12 novembre 2026

Cette PR ne modifie aucun fichier applicatif ni migration SQL. Elle déclenche exclusivement les workflows Playwright pour la branche DEV via un événement pull_request.

- Cible : `feature/v3-supabase-full-clone` uniquement.
- Tests : Mission 2 puis Mission 3, navigateur Chromium isolé.
- Aucun identifiant ni donnée de production utilisé.
- Ne pas fusionner automatiquement, ne pas promouvoir vers V3 ou MAIN.
- Suite unitaire GitHub : 121/121 PASS sur commit `6eecb402`.

Les contrôles réels Auth/RLS et les scénarios multi-utilisateurs doivent être documentés séparément avant publication.
