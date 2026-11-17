# RestoManager — registre officiel des évolutions DEV → V3 → MAIN

### RM-012.1 — Promotion V3 puis MAIN autorisée, activation PROD à confirmer (17/11/2026)

- Instruction propriétaire après livraison Render : « Oui si tout est ok tu met à jour V3 et main ». Préparer la livraison ciblée de RM-012 et du correctif RM-012.1 ; ne pas fusionner DEV globalement.
- Source DEV `0e7f7b7`, PR #174/#176, sept workflows réussis sur `1553c20`, Render `dep-dbu83st9fdbs73dvg83g` LIVE, version `2026.11.17-rm012.1`, cache et 19 ressources conformes. Le propriétaire demande la promotion sous condition de validation technique ; aucune recette physique supplémentaire n’est inventée.
- Branches protégées de départ : V3 `b8f7a397fd35541e13d222421e43b0025ba13ead`, MAIN `a74e7ed9cab740b215e27946d75da35181f4b0e2`. Sauvegardes préalables et branches filles dédiées ; conserver URL/clé publiques PROD, SDK/lockfile existants et historique des publications réelles.
- Supabase PROD inspecté en lecture seule : prérequis RM-012 présents, module RM-012 et pg_cron non installés. L’autorisation de mise à jour V3/MAIN ne vaut pas autorisation explicite des migrations PROD, interdite dans les consignes initiales. Préparer leurs impacts et leur validation isolée, puis demander l’accord explicite avant toute application partagée PROD.

- Candidat production : 143 fichiers vérifiés, 201 tests Node, 29 groupes SQL, 15 groupes Cron et 23 groupes navigateur réussis ; [rapport, impacts des migrations et captures](releases/RM012_PRODUCTION_20261117.md). Activation Supabase PROD et fusions restent en attente des contrôles GitHub et de l’accord explicite pour la base.

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


## RM-014.2 — Glissement et annulation — livraison autorisée (17/11/2026)

- Décision explicite propriétaire : « Ok mes sur main est v3 », après disponibilité sur Render DEV et confirmation des six CI réussies. Autorisation consignée par PR #169 ; source DEV b6e6603, code bfbc5bc, tests b590cc6, PR #167.
- Livraison ciblée de six fichiers applicatifs, sans fusion globale DEV. Canal main, historique réel conservé, cache restomanager-shell-20261117-prod-rm014.2, précache 71 fichiers. Connexions PROD et lockfile préservés.
- Sauvegardes backup/rm0142-v3-before-20261117 (c5ef487) et backup/rm0142-main-before-20261117 (f17e6ea). Tests du paquet réel, puis CI propres à chaque cible ; V3 d’abord, MAIN ensuite, contrôle de GitHub Pages et empreintes publiques.
- Aucun changement Supabase PROD, aucune donnée fictive réelle, aucune réservation/clôture/message transmis. [Rapport et manifeste](releases/RM0142_DISMISS_20261117.md). La validation technique ne remplace pas la confirmation utilisateur sur la version publique.

- Candidat exact production : 136 fichiers de syntaxe, 188 tests Node, 14 combinaisons de glissement, 14 de régression, 24 groupes de cycle de vie et 12 groupes PWA réussis localement, deux rôles/sept largeurs. CI des PR encore requise avant fusion.
