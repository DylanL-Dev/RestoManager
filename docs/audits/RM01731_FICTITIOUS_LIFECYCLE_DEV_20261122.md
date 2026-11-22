# RM-017.3.1 — Simulation d'inscription et cycle de vie (DEV seulement)

Date : 22 novembre 2026. Périmètre : branche `feature/v3-supabase-full-clone`, publiée sur Render DEV seulement après CI complète. **Aucune modification MAIN, RestoManager-V3 ni Supabase PROD**.

## Objectif

Créer une démonstration réellement exploitable sur mobile, tablette et PC des futurs parcours de gestion des comptes et établissements, avant d'autoriser des inscriptions réelles.

## Démonstration isolée

- Page : `/rm0173-simulation.html`, liée depuis `/inscription.html` et l'annuaire de la console Créateur DEV.
- Charte graphique : vert RestoManager, blanc, accent doré et icônes Lucide locales. `noindex, nofollow`, CSP **`connect-src 'none'`**, scripts internes uniquement.
- Données préremplies fictives : « Le Jardin (démo) », SIRET **00000000000000** et `demo@example.test` ; aucune identité réelle, y compris Web Labs, n'est utilisée. Le SIRET ne subit qu'un calcul de format / clé de contrôle, **pas une validation officielle**. Son SIREN est déduit localement des neuf premiers chiffres.
- Parcours restaurateur : formulaire indépendant / hôtel → compte fictif en attente d'email → clic de confirmation **simulé** → établissement actif **fictif** → demandes distinctes « suppression de mon compte » et « fermeture de mon restaurant ».
- Parcours Créateur / Root **fictif sans authentification** : suspension, réactivation, archivage après suspension, puis effacement seulement après archivage et saisie de la phrase « EFFACER LA DÉMO ». Aucune de ces actions n'accorde de privilège Root réel.
- Journal événementiel et états visibles. Un rechargement du navigateur abandonne toute la démonstration.
- Machine à états immuable côté navigateur ; événements conservés **en mémoire seulement**. Aucune API, aucun formulaire envoyé, pas de Supabase, pas d'authentification réelle, pas de cookies, pas de stockage local, pas d'email et pas d'effacement effectif.

## Sécurité et non-régression

- Démonstration déconnectée des environnements PROD et DEV Supabase : aucun `fetch`, SDK, RPC, persistance ou clé secrète dans le code de simulation.
- Le serveur réel de confirmation et les verrous RM-017.2.2 ne sont pas modifiés. Le pilote public demeure fermé (`rm017-runtime.json.enabled=false`, `private.rm017_signup_gate.enabled=false`).
- Les composants du portail réel, les réservations, les restaurants existants et les données Auth restent intacts.
- Tests Node : validation fictive SIRET, extraction SIREN, confirmation email simulée, indépendance demande compte/fermeture, droits Root fictifs, ordre suspension → archive → effacement, reset et contrat anti-réseau.
- Tests Playwright : parcours indépendant et hôtel, écran mobile/tablette/PC, réinitialisation au rechargement, actions interdites, phrase d'effacement, absence d'appels externes et WCAG via axe.
- Intégration CI : workflow `.github/workflows/rm0171-signup.yml` enrichi, sans retirer les contrôles précédents.

## À développer ultérieurement (hors périmètre)

1. Configurer et vérifier réellement SMTP, email de confirmation, Auth Hook, CAPTCHA et invitations privées sur **Supabase DEV**, sans créer de faux comptes.
2. Élaborer les permissions réelles d'un propriétaire et de Root, avec MFA, authentification récente, contrôle serveur, traçabilité et confirmation forte.
3. Concevoir un cycle de vie réel à plusieurs étapes : suppression du seul compte utilisateur, transfert de propriété si nécessaire, suspension commerciale, export réglementaire, politique de rétention puis purge contrôlée selon l'ensemble des clés étrangères et données liées.
4. Tester une vraie inscription privée, à une étape distincte, avec une entreprise réelle sous autorisation explicite et une procédure de nettoyage documentée.
5. **Aucune suppression réelle de restaurant ne doit être déclenchée depuis cette simulation.**
