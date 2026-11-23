# RM-017.3.8 — Connexion Root classique sur DEV (23/11/2026)

## Demande utilisateur
Retour explicite à une connexion **identifiant + mot de passe**, sans code TOTP ni QR code, sur **DEV uniquement**.

## Portée
- `creator-auth.js` est protégé par une vérification d'environnement : uniquement `supabaseEnvironment.name === 'DEV'`.
- L'accès à l'interface reste conditionné à une authentification Supabase Auth valide, à un email confirmé, à une identité non anonyme et à une appartenance **active** `platform_admins.role = 'platform_admin'` vérifiée sous RLS.
- Aucun changement au mot de passe, à `auth.users`, aux règles RLS ou aux permissions de la base.
- Les écrans d'enrôlement / challenge MFA ont été retirés **du parcours Root DEV** et les tests corrigés.
- `rootdev` reste un raccourci local qui ne peut être associé qu'après une première connexion email + mot de passe **d'un Root DEV autorisé** sur l'appareil. L'application n'expose pas l'email personnel du Root en dur dans les assets publics.
- Le mot de passe ne sera jamais inscrit dans le code ou le localStorage de cette fonctionnalité.

## Contrepartie de sécurité
La suppression du second facteur réduit la protection contre l'utilisation d'un mot de passe compromis. Acceptable pour une **expérimentation DEV isolée**, mais ne doit pas être reportée automatiquement sur MAIN/V3/PROD, ni sur les opérations réellement sensibles de gestion des comptes sans revue de sécurité.

## Vérifications
- Tests `rm01733-root-auth` : accès Root DEV sans MFA, refus hors rôle, association locale `rootdev`, récupération email, refus `root`.
- Test `bug01-security` : contrôle Root et RLS préservé.
- Playwright : login/recovery sur tailles mobiles/tablette/desktop, absence des anciens champs MFA.
- Contrôle CI complet avant fusion, puis publication Render DEV uniquement.
