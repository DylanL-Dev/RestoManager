# RM-017.3.6 — identifiant DEV « rootdev » (23/11/2026)

## Décision utilisateur
Séparer les identifiants pour éviter la confusion : **DEV = rootdev**, **MAIN = root**. Aucun mot de passe n'est changé par cette évolution et aucun environnement de production n'est modifié.

## Implémentation
- `creator.html` affiche `rootdev` dans le champ Identifiant et l'aide explique que `root` reste réservé à MAIN.
- `creator-auth.js` résout exclusivement **rootdev** vers l'email Root DEV mémorisé **localement après authentification et MFA AAL2**. Aucune adresse personnelle n'est embarquée dans le code ou dans le dépôt.
- La connexion **root** sur DEV est refusée avec une explication explicite, y compris si un email DEV a été mémorisé sur l'appareil.
- La première connexion sur un nouvel appareil nécessite l'email DEV et le mot de passe DEV, suivis du MFA ; ensuite l'identifiant `rootdev` remplace la saisie de l'email, sans contourner l'authentification Supabase ni le MFA.
- La récupération du mot de passe utilise l'email DEV, sans intervention sur Supabase PROD.
- La clé de préférence locale `rm:rootdev:authorized-email-v1` **reste identique** : un navigateur où un email DEV a déjà été vérifié n'a pas besoin de refaire l'association.

## Tests
- `tests/rm01733-root-auth.test.cjs` couvre la première connexion, l'enregistrement après MFA uniquement, la reconnexion par `rootdev` et le rejet de l'ancien alias `root`.
- `tests/bug01-security.test.cjs` vérifie le nouveau routage de l'alias et l'absence d'identifiants techniques inscrits en dur.
- `tests/browser/rm01733-root-login.cjs` vérifie le champ de connexion DEV sur mobile/tablette/ordinateur.
- CI GitHub avant fusion DEV puis Render DEV ; protection MAIN/V3/Supabase PROD.

## Limite
L'alias `rootdev` est une commodité d'interface **sur l'appareil** ; l'identité réelle reste l'utilisateur Supabase DEV vérifié par email + mot de passe + MFA. Aucune modification SQL ni changement de rôle serveur ne sont nécessaires.
