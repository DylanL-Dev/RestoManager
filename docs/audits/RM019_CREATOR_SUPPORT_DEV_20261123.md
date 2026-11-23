# RM-019 — Refonte du Centre d'assistance Créateur (DEV)
Date : 23/11/2026.

## Décision
À la demande de l'utilisateur, **concentrer RM-019 sur le côté Créateur/Root**, et non sur le formulaire d'assistance des employés déjà amélioré dans RM-013-A.

## Fonctionnalités
- Nouvelle interface « Centre d'assistance » : liste de tickets et détail sur ordinateur, empilés sur mobile.
- Compteurs **à traiter**, **urgences ouvertes** et **résolus** calculés sur les 200 derniers messages retournés, sans prétendre afficher l'intégralité historique au-delà de 200.
- Recherche instantanée locale par titre, établissement, description, contact, écran ou identifiant ; filtre d'urgence ; catégories À traiter / Tous / Nouveaux / En cours / Résolus.
- Sélection d'un ticket avec détail : type, priorité, établissement, origine Restaurant/Réception, date Europe/Paris, écran et contact éventuels.
- Modification du **seul** champ `status` (`new`, `reviewing`, `resolved`), avec message de succès, retour arrière local en cas d'erreur serveur, rafraîchissement des compteurs de l'accueil et retrait d'une demande résolue du filtre « À traiter ».
- Affichage prudent des messages et coordonnées par **textContent** (pas d'injection HTML), clavier, focus, tailles 390/768/1440 et thème sombre.

## Protections
- **DEV uniquement** (branche `feature/v3-supabase-full-clone`, service Render DEV).
- Aucun changement de l'authentification `rootdev`, de la vérification `platform_admins`, des permissions/RLS, des données Supabase DEV/PROD, des bases, de MAIN ou de V3 historique.
- Aucun nouveau champ de `platform_reports`, aucune migration, aucun RPC. Lecture de la même liste privée déjà autorisée par RLS et mise à jour du statut existant.
- Le formulaire **Restaurant/Réception** `service-v3-feedback.js` reste identique ; pas de lecture des tickets par les employés. Pas de notifications clients promises.
- Les tickets ne sont **jamais supprimés** par le nouvel écran. Pas d'envoi de véritables tickets de test.
- Limite conservée à 200 tickets. Une pagination serveur et la conservation complète de l'historique demanderont une étape distincte (et potentiellement des index).

## Fichiers modifiés
- `creator-admin.js` : refonte de la boîte privée sans nouvelle permission.
- `creator-console.css` : styles d'assistance isolés, responsive, mode sombre.
- `creator.html` : nom, descriptif de la rubrique et version CSS.
- `creator-auth.js` : cache-buster de **l'import du module de boîte privée uniquement** ; aucune logique de connexion touchée.
- `tests/root-issue-counters.test.cjs` : nouveau cache-buster.
- `tests/rm019-creator-assistance.test.cjs`, `tests/browser/rm019-creator-assistance.cjs` et workflow dédié.

## Recette
- Tests syntaxe, Root historique, contrats sans changement SQL/RLS, tests navigateur avec tickets fictifs.
- 390/768/1440 pixels, recherche accentuée, filtres, changement statut réussi et échoué, retour arrière, absence de XSS, WCAG 2.1 AA ciblé, aucun appel à un serveur Supabase ni compte réel.
- Publication DEV Render après réussite ; ne pas publier MAIN/V3 sans validation de compatibilité production.

## Décisions pour la suite
- Éventuelle conversation Root↔restaurant, pièces jointes, SLA, historique d'actions, attribution de ticket et notifications nécessitent un **nouveau modèle serveur sécurisé**, avec isolation et gestion de l'autorisation côté employés ; **hors du périmètre RM-019.1**.
