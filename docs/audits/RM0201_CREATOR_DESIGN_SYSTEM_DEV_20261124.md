# RM-020.1 — Refonte intégrale de la structure visuelle Créateur (DEV)
Date : 24 novembre 2026.

## Demande validée
Refaire l'ensemble de l'espace Créateur, interface neuve et icônes Lucide, tout en préservant les sept rubriques existantes et les autorisations en place. RM-020.1 représente la **phase structure/design system**, les écrans métier avancés seront traités dans les phases 020.2+.

## Livrable
- Sidebar Créateur **vert sapin profond**, navigation avec sept véritables icônes Lucide : Vue générale, Établissements, Centre d’assistance, Comptes & demandes, Préparation inscriptions, Supervision et Paramètres.
- Bandeau de contexte environnement DEV et identité de compte Créateur distincte du restaurant. Bouton déconnexion existant et opérationnel.
- Nouveau header : fil d'Ariane synchronisé avec l'onglet actif, accès rapide aux établissements, thème clair/sombre, menu compact sur grand écran, tiroir accessible sur mobile.
- Dashboard retravaillé : grande bannière de bienvenue, deux raccourcis réels vers les vues existantes, quatre indicateurs **non inventés** alimentés par le code original, cartes de navigation.
- Styles renouvelés sur **toutes les pages** (typographies, cartes, listes, formulaires de connexion, sections d'administration, marges, ombres, fond), responsive 360–1440 px.
- Icônes Lucide embarquées localement, pas de CDN d'icônes, de police distante, d'image générée ni de traceur.
- Choix thème clair/sombre et mode compact enregistrés localement (uniquement préférences visuelles), sans droits supplémentaires. Le serveur n'en reçoit aucune donnée.

## Fichiers
- `creator.html` : structure HTML et éléments de présentation, sans modification des formulaires ou IDs de fonctionnalités.
- `creator-shell.css` : nouveau design system chargé après les anciens styles pour conserver les fonctionnalités en place.
- `creator-shell.js` : thème, menu compact, icônes des lignes d'établissement et fil d'Ariane, indépendant de Supabase.
- `creator-lucide.js` : paths Lucide SVG locaux contrôlés, aucune source distante.
- Test historique RM-019 adapté à l'icône Lucide ; nouveau test structurel et navigateur ; CI dédiée.

## Protections
- DEV uniquement. Supabase DEV et PROD **non modifiés** ; MAIN et V3 **non modifiés**.
- `creator-auth.js`, `creator-console.js` et `creator-admin.js` conservés à l'identique, ainsi que l'identifiant `rootdev`, la vérification `platform_admins`, le mot de passe et le rôle. Aucun nouvel accès.
- Pas de migration, aucun changement des réservations, contrats, emails, RLS, badges de données ou statuts.
- Pages Préparation inscriptions et Comptes & demandes restent en lecture seule ; Supervision reste annoncée comme à venir, sans indicateurs artificiels.
- Les couleurs/modificateurs et les icônes font partie du shell uniquement ; l'intérieur métier de chaque page pourra être repensé plus tard, après validation du design global.

## Recette
- Node : intégrité des sections, contrôles Auth, statut DEV, absence de code réseau et d'icônes distantes.
- Playwright local : cinq résolutions (360, 390, 768, 1280, 1440 px), sept vues, menu mobile, icônes, thème, menu compact, aucun débordement, aucun appel à Supabase, axe WCAG 2.1 AA.
- Vérification de l'assistance RM-019.1 et des suites métier du projet avant fusion / Render DEV.

## Prochaines phases proposées après validation
- RM-020.2 : consolider dashboard, établissements et état de supervision avec des métriques réelles.
- RM-020.3 : moderniser les écrans Comptes & demandes, Préparation inscriptions et Paramètres.
- RM-020.4 : recette utilisateur mobile/tablette/PC, micro-interactions, puis préparation sélective des fonctions sûres à la production.
