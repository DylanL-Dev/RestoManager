# RM-005 — seconde exécution de recette prépublication, 13/11/2026

Base DEV contrôlée : `c5d20a988a2dc437405d0721a64fd2b4a6b3b7af`.

## Pourquoi cette deuxième passe ?

La PR QA précédente #116 a trouvé 3 tests Node obsolètes (ancien jeton de cache et anciennes icônes Lucide) et un contrôle Playwright obsolète (nouvelle coche de sélection). Les assertions ont été corrigées sur **DEV uniquement**. Les tests ne désactivent aucun contrôle métier ; ils vérifient maintenant les vrais éléments rendus.

## À exécuter

- 152+ tests unitaires, syntaxe JS et actualisation des composants ;
- Playwright mobile/tablette/PC, deux rôles, horaires et créneaux ;
- PostgreSQL et Supabase Auth/RLS/Realtime sur systèmes jetables isolés.

**Ne pas fusionner cette PR** : elle déclenche uniquement la CI. Aucune publication V3/MAIN, aucune modification des bases réelles.

Critère d'éligibilité à une future publication : tous les workflows verts **puis** contrôle authentifié réel sur Render DEV et accord utilisateur pour chaque lot.
