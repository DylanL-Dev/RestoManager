
## RM-013-A — Gestion et Assistance — livraison V3 puis MAIN autorisée (16/11/2026)

- Validation et demande explicites : « Parfait je pense qu'on peut valider et mettre sur main sur V3 main juste avant » d’harmoniser Assistance. Les corrections précédentes de Render sont validées ; le dernier ajustement demandé est inclus et testé avant publication.
- Périmètre : salles horizontales, Gestion en accordéons, tables compactes, Clôture/durée et Assistance harmonisée. Le formulaire garde ses types/priorités, sa validation et son envoi privé authentifié.
- Source DEV : `9c57ae9` et correctifs des PR #152/#153. Branche de livraison isolée, aucune fusion DEV globale. Configurations, routes de connexion, dépendances et SQL de production préservés.
- Technique sur le candidat production : syntaxe 126/126, 154 tests unitaires, 14 combinaisons Gestion et 14 Assistance, sans message/réservation/clôture réelle. CI de publication obligatoire avant chaque fusion.
- Sauvegardes : `backup/rm013a-v3-before-20261116` (`cc516a3`) et `backup/rm013a-main-before-20261116` (`2f0c2bc`). Rapport et empreintes : [livraison RM-013-A](releases/RM013A_UI_ASSISTANCE_20261116.md).
- Ordre : V3, puis MAIN, puis vérification des ressources publiées sur GitHub Pages. Ne pas confondre réussite CI, publication technique et confirmation finale sur les appareils du restaurant. Aucune modification Supabase PROD.
