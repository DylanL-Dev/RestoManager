# RM-013-A — Livraison ciblée Gestion et Assistance, 16/11/2026

## Autorisation et périmètre

L’utilisateur a validé les corrections du clone puis demandé : « Parfait je pense qu'on peut valider et mettre sur main sur V3 main juste avant » d’harmoniser le formulaire Assistance. Cet ajustement est réalisé et testé dans le même lot, avant publication V3 puis MAIN.

Source DEV validée : PR #152 (accordéons/salles), PR #153 (clôture/durée), puis branche `feature/rm013a-assistance-form`, commit `9c57ae9cbce283edbfec7cc543817dfb1ce82f28` (Assistance). Dernier contrôle local du candidat : syntaxe 125 fichiers, 154 tests unitaires, 14 combinaisons Gestion et 14 combinaisons Assistance, toutes réussies. Les tests navigateur couvrent 360/390/430/768/1024/1440/1920, Restaurant et Réception, sur données fictives exclusivement.

## Contenu livré

- Salles horizontales avec texte/compteurs/actions séparés et formulaires conservés au repli/snapshot.
- Gestion en accordéons accessibles ; tables compactes filtrées par salle ; horaires et autres modules conservés ; contrôles réservés au Restaurant.
- Clôture : navigation et action partagée légitime non bloquées par le filtre des clics, conditions métier existantes conservées. Durée affichée comme une valeur compacte.
- Assistance : nom et messages harmonisés, choix intégrés Problème/Assistance/Suggestion et Normale/Urgente, champs/icônes/bouton cohérents, états d’échec/reprise et mode sombre.
- PWA : cache de production `restomanager-shell-20261116-prod-rm013a3`, ressources nécessaires précachées et versions de scripts/CSS cohérentes.

L’envoi privé conserve les valeurs `bug/question/suggestion`, `normal/urgent`, la table `platform_reports`, l’auteur vérifié par Auth et l’établissement authentifié. Aucun droit de lecture employé n’est ajouté. Aucun message, réservation ni clôture d’essai envoyé à une base distante.

## Séparation des environnements

Dix fichiers d’interface sont repris sur une branche fille de V3, sans fusion globale de DEV. Liste et empreintes : [manifeste](RM013A_RELEASE_MANIFEST_20261116.json).

Les fichiers suivants sont identiques à la base de production : `supabase-service-bridge.js`, `supabase-login.js`, `creator-auth.js`, `login.html`, `package-lock.json`. La dépendance npm Supabase de production reste épinglée à sa version existante. Les deux modules de connexion restent liés au projet PROD ; aucun import `restomanager-env.js`, aucun fichier de routage DEV et aucune migration/SQL ne sont copiés. Aucune modification Supabase PROD.

## Sauvegardes et ordre

- V3 avant livraison : `cc516a396b12eea0259e1563553b8223cf1549f2`, sauvegarde `backup/rm013a-v3-before-20261116`.
- MAIN avant livraison : `2f0c2bc21fccdfb2b0c515a89419e767a2810b53`, sauvegarde `backup/rm013a-main-before-20261116`.
- Les deux arbres applicatifs étaient identiques avant livraison. Le même patch ciblé est préparé depuis chacune de ces bases pour éviter d’importer un historique DEV ou d’autres travaux.
- CI du candidat, fusion vers V3 d’abord, puis vers MAIN. Vérifier la version réellement servie par GitHub Pages après fusion ; un commit ne suffit pas à prouver une publication.

## Preuves et limites

[Rapport et captures Assistance sur DEV](https://github.com/DylanL-Dev/RestoManager/blob/feature/rm013a-assistance-form/docs/audits/RM013A_ASSISTANCE_20261116.md), [clôture et durée](https://github.com/DylanL-Dev/RestoManager/blob/fix/rm013a-closure-duration/docs/audits/RM013A_RETOUR_RECETTE_20261116.md). Les workflows de chaque PR produisent aussi les captures de leur arbre exact, sur une frontière de service simulée, sans requêtes externes.

La vérification de publication porte sur le HTML et les ressources effectivement servies et leur correspondance au code testé. Aucun essai d’écriture dans les données du restaurant n’est nécessaire pour contrôler l’affichage. La confirmation fonctionnelle sur les comptes et appareils réels demeure distincte des tests techniques et de la publication.
