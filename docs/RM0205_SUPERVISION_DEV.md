# RM-020.5 — Supervision automatique DEV : phase 1

Le script `node scripts/rm0205-dev-probe.cjs` exécute trois lectures HTTP publiques, sans session, vers le seul site Render DEV. Résultat JSON limité aux états, codes HTTP, durées et date. Une réponse invalide, un timeout ou une erreur réseau n'est jamais déclaré sain. Ce n'est pas un contrôle de la base, de Realtime ou du service de réservation.

Tests isolés : `node --test tests/rm0205-dev-probe.test.cjs`. Aucun appel réseau réel dans ces tests.

## Étapes avant mise en service permanente

1. Valider #236 et ce script, puis tester sur Render DEV réellement publié.
2. Choisir un ordonnanceur indépendant (p. ex. cron Render, après validation de son coût). Ne pas ajouter une planification GitHub Actions à MAIN : les workflows planifiés exigent la branche par défaut.
3. Mettre en place une conservation limitée des métriques et une consultation Root strictement autorisée ; pas de secrets dans le front statique, pas de données clients dans les journaux. Ne pas collecter les URL avec jetons, emails, corps de requêtes ou stack traces brutes.
4. Alerter après plusieurs échecs consécutifs, dédupliquer les incidents, signaler les rétablissements et identifier les mesures périmées. Une sonde isolée ne prouve pas une panne globale.
5. Intégrer ultérieurement les journaux Render/Supabase par un backend sécurisé et en lecture seule, avec identifiants dédiés à DEV et principe du moindre privilège. Pas de migration, de clé ou de service payant créé dans cette phase.

MAIN, V3 et Supabase PROD restent hors périmètre. Aucune tâche permanente n'est activée par cette PR.
