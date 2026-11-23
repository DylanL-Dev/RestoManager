# RM-RELEASE-01A — Publication ciblée de l'administration Créateur (23 novembre 2026)

## Décision et périmètre
Le propriétaire autorise la mise à niveau des fonctionnalités adaptées à la production dans l'ordre V3 → MAIN, sous autonomie et vérifications. Une copie globale DEV vers PROD est **exclue**.

Livrable exact **sans migration** : recherche locale dans l'annuaire Root des établissements déjà autorisés par RLS ; carte « Publications » lisant deux fichiers JSON publics déjà présents sur GitHub Pages ; indicateurs prudents et état non vérifiable lorsque la configuration est invalide. UI téléphone/tablette/PC, pas de script tiers. Les données affichées ne valent pas mesure de disponibilité ou d'ouverture d'un restaurant particulier.

### Fichiers applicatifs autorisés
- `creator.html` : onglet Publications, filtre établissement et libellés accessibles.
- `creator-console.js` : recherche parmi les lignes RLS existantes ; lecture uniquement de `app-release.json` et `reservation/runtime.json` du **même origin**.
- `creator-console.css` : styles accessibles sur mobile.
- `creator-auth.js` : **changement unique de query string d'import** `creator-console.js?v=20261123-rmrelease01a` pour invalider le cache. Authentification Root PROD, alias `root`, Supabase PROD, logout, permissions et URL import env inchangés.

Aucun autre fichier applicatif, `app-release.json`, service worker, clés, base, inscriptions ou réservations n'est modifié.

### Blocages documentés
Supabase PROD inspecté **en lecture seule** le 23/11 :
- `restaurants`, `platform_reports`, `platform_admins` présents.
- `rm017_lifecycle_requests` et `rm017_establishment_profiles` **absents**. Ne pas importer l'onglet « Comptes & demandes », les RPC, la simulation ou les verrous du pilote DEV.
- Ne jamais transférer l'authentification `rootdev` (développée pour DEV), ni les inscriptions RM-017 sans vérification Auth/SMTP/Turnstile/permissions RLS PROD et décision de migration distincte.
- Les pages juridiques RM-018 contiennent des champs incomplets : ne pas les présenter comme CGU/CGV opposables sur la version officielle.
- Le statut `reservation/runtime.json.activated=true` signifie uniquement que le portail technique est activé en configuration, pas qu'un établissement accepte effectivement une réservation.

### Sauvegardes
- `backup/rmrelease01a-v3-before-20261123` → commit `7c1bdff6e00fd531895ea7eafb2ef2366e571d8e`
- `backup/rmrelease01a-main-before-20261123` → commit `3bfde37b55163de96c40e8ca557d393f370f22bd`

### Procédure de livraison
1. V3 : `release/rmrelease01a-v3-20261123` → PR, workflows `release-guard.yml` + `rmrelease01a-creator.yml`; validation avant fusion.
2. MAIN : branche fille `release/rmrelease01a-main-20261123` depuis MAIN, **rejeu ciblé de quatre fichiers seulement**, tests identiques, PR, fusion après succès V3.
3. Contrôler GitHub Pages si publication effective, ouvrir `creator.html`, s'assurer que Root PROD est inchangé, annuaire et Publications fonctionnent. Pas de test d'authentification réelle avec identifiants personnels ni de réservation fictive PROD.
4. En cas de problème, revenir aux sauvegardes via une PR de restauration ciblée et les mêmes contrôles (ne pas réinitialiser brutalement des branches partagées).

### Vérifications automatiques
- `npm run test:syntax`, `npm test`, `node --test tests/rmrelease01a-creator.test.cjs`.
- `node tests/browser/rmrelease01a-creator.cjs` : trois écrans 390/768/1440px, recherche accents, ID, cas vide, lien de publication correct, fail-closed si configuration invalide, aucune requête POST, aucun appel Supabase et aucune URL externe. Les droits Root sont simulés **dans ce test uniquement** ; les contrôles de droits en production restent ceux du serveur.
- `release-guard.yml` vérifie la cible Supabase PROD, le portail public, la syntaxe et les tests historiques.

### Suite après publication
Terminer les informations obligatoires RM-018, finaliser l'email et le SIRET de la phase pilote RM-017.6 en DEV, puis planifier l'audit des migrations PROD sans les appliquer automatiquement.
