
## RM-013-A — Gestion et Assistance — livraison V3 puis MAIN autorisée (16/11/2026)

- Validation et demande explicites : « Parfait je pense qu'on peut valider et mettre sur main sur V3 main juste avant » d’harmoniser Assistance. Les corrections précédentes de Render sont validées ; le dernier ajustement demandé est inclus et testé avant publication.
- Périmètre : salles horizontales, Gestion en accordéons, tables compactes, Clôture/durée et Assistance harmonisée. Le formulaire garde ses types/priorités, sa validation et son envoi privé authentifié.
- Source DEV : `9c57ae9` et correctifs des PR #152/#153. Branche de livraison isolée, aucune fusion DEV globale. Configurations, routes de connexion, dépendances et SQL de production préservés.
- Technique sur le candidat production : syntaxe 126/126, 154 tests unitaires, 14 combinaisons Gestion et 14 Assistance, sans message/réservation/clôture réelle. CI de publication obligatoire avant chaque fusion.
- Sauvegardes : `backup/rm013a-v3-before-20261116` (`cc516a3`) et `backup/rm013a-main-before-20261116` (`2f0c2bc`). Rapport et empreintes : [livraison RM-013-A](releases/RM013A_UI_ASSISTANCE_20261116.md).
- Ordre : V3, puis MAIN, puis vérification des ressources publiées sur GitHub Pages. Ne pas confondre réussite CI, publication technique et confirmation finale sur les appareils du restaurant. Aucune modification Supabase PROD.


## RM-014 — Centre de notifications — livraison V3 puis MAIN autorisée (16/11/2026)

- Recette Render validée par le propriétaire : « C’est parfait on valide on déploie sur V3 et main », après correction de « Voir les nouveautés ».
- Livraison ciblée RM-014.1, treize fichiers applicatifs, sans configuration DEV ni migration. Canal main et historique des publications réelles ; cache adapté aux fichiers de production.
- Garde des brouillons RM-011-A, rôles, marqueurs existants et configuration PROD conservés. Tests isolés, aucune donnée fictive réelle.
- Sauvegardes `backup/rm014-v3-before-20261116` et `backup/rm014-main-before-20261116`. CI du paquet exact avant V3, puis MAIN ; contrôle de GitHub Pages ensuite. [Rapport et manifeste](releases/RM014_NOTIFICATIONS_20261116.md).
