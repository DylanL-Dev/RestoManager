# RM-017.3.2 — Préparation des demandes de compte et établissement (DEV)

**Date :** 23 novembre 2026. **Cible :** GitHub DEV `feature/v3-supabase-full-clone`, Render DEV, Supabase **DEV** `lykoybacslvmhtzftqsf` uniquement. Ne jamais appliquer cette migration à PROD sans validation expresse et recette de publication.

## Ce qui est réellement livré

- Une table `public.rm017_lifecycle_requests`, à RLS forcée, contenant des **demandes** (et non des opérations sur comptes ou restaurants).
- Deux types de demande : `account_deletion` pour un compte individuel, et `restaurant_closure` pour un restaurant précisément identifié.
- Pour `restaurant_closure`, le serveur vérifie que `public.rm017_establishment_profiles.created_by = auth.uid()`. Le rôle opérationnel `fb_admin` ne constitue **pas** une preuve de propriété.
- Table `private.rm017_lifecycle_events` pour le journal des demandes et des changements d'état, inaccessible directement aux clients.
- Deux fonctions serveur accessibles **uniquement** aux comptes Supabase authentifiés : demande de gestion et changement **de statut d'examen** par Root actif avec MFA AAL2. Aucune suppression, suspension, archivage, modification de réservation ni gestion d'un compte Auth par ces fonctions.
- Deux interrupteurs serveur indépendants, tous deux **désactivés au déploiement** : `requests_enabled=false` et `reviews_enabled=false`. Ils ne doivent pas être ouverts sans phase d'essai autorisée.
- Tableau Root `creator.html` > « Comptes & demandes » : liste **en lecture seule**, contrôle d'accès via la RLS serveur existante et message d'absence de droits lorsque nécessaire. Aucune action destructrice dans l'interface.

## Protections

- Les demandes personnelles ne sont visibles qu'au demandeur. Root ne peut les voir que s'il est **actif** dans `public.platform_admins` ; révoquer le membre admin ferme immédiatement cet accès.
- Anon ne peut pas appeler les fonctions, ni lire la table. Authenticated ne dispose d'aucun droit SQL direct d'INSERT, UPDATE ou DELETE sur les demandes.
- La fonction de revue exige une deuxième authentification : `auth.jwt()->>'aal' = 'aal2'`, un membre Root actif, la porte d'examen ouverte et une transition permise.
- Les états `closed_reviewed` et `closed_rejected` signifient **suivi administratif uniquement**, jamais effacement de données.
- Les clés étrangères sont restrictives : pas de purge accidentelle à travers une demande de fermeture.
- Toutes les valeurs fournies à l'interface sont insérées avec `textContent`, pas `innerHTML`.
- Les inscriptions publiques restent désactivées (`rm017-runtime.json.enabled=false` et `private.rm017_signup_gate.enabled=false`).

## Tests

- `tests/rm01732-lifecycle.test.cjs` : règles statiques de sécurité, absence de DELETE et interface Root uniquement consultative.
- `tests/postgres/rm01732.cjs` : PostgreSQL 17 jetable hors réseau. Un vrai système de rôles/RLS fictif teste les accès entre deux restaurants, les portes fermées, les demandes personnelles, le refus des accès anonymes, Root révoqué, Root AAL1, Root AAL2, le journal et le maintien des lignes de réservations, restaurants et collaborateurs.
- `tests/browser/rm01732-creator.cjs` : affichage Root 360/390/768/1440 px, absence d'écritures réseau et d'actions destructrices ; l'authentification est simulée **dans le test navigateur uniquement** tandis que les vrais droits sont éprouvés dans PostgreSQL.

## Phase distincte avant ouverture des demandes réelles

Il faudra ensuite réaliser le parcours authentifié de chaque propriétaire, tester le SMTP et la vérification des emails, configurer le MFA Root et les notifications, définir les délais légaux et l'export des données, traiter le transfert de propriété, puis concevoir **une procédure de suppression réelle distincte** avec confirmation renforcée et audit. Aucun compte réel et aucune donnée client ne doivent être supprimés ou modifiés par RM-017.3.2.

Le travail documentaire RM-018 (CGU, CGV, mentions légales, confidentialité, cookies et consentement) doit être achevé avant commercialisation.
