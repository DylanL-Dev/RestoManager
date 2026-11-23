# RM-017.4 — Tableau de préparation des inscriptions (DEV uniquement)

Date : 23 novembre 2026. Branch cible : `feature/v3-supabase-full-clone`. Déploiement autorisé uniquement sur Render DEV `restomanager-v3-supabase-integration.onrender.com`.

## Constat vérifié avant développement

- `rm017-runtime.json` : `enabled=false`, `turnstileSiteKey=null`, pilote sur invitation uniquement.
- Supabase DEV `lykoybacslvmhtzftqsf` : `private.rm017_signup_gate.enabled=false` ; 0 invitation active ; 0 preuve SIRET en attente ; 0 profil d'établissement créé par le pilote.
- Supabase Edge Function `rm017-siret` : présente et active en DEV. Le statut actif de la fonction n'atteste **pas** du succès réel d'une vérification de SIRET.
- La confirmation effective des emails (SMTP et fournisseur), le hook Auth `Before User Created`, le CAPTCHA secret et les URLs Auth restent à **vérifier par une recette réelle**, pas par un mock.

## Livré

Nouvelle rubrique Root « Préparation inscriptions » avec :
- lecture dynamique **uniquement** de la configuration publique `rm017-runtime.json` depuis le même origin, sans cache ;
- état explicite de la porte d'inscription **côté interface**, distinct du verrou serveur privé ;
- affichage de présence ou d'absence de **clé publique** Turnstile, sans prétendre vérifier la clé secrète ;
- checklist métier : emails, CAPTCHA, invitations, vérification SIRET, isolation entre tenants et documents légaux ;
- liens vers le formulaire DEV et les paramètres Auth du projet Supabase DEV.

Aucune donnée nominative d'invitation, aucun secret, aucune capacité d'ouverture des verrous, aucune écriture serveur ni élévation de permissions. Les droits Root continuent à être vérifiés avant l'installation du tableau.

## Limites

Un indicateur `enabled=true` côté front-end **ne signifie pas** qu'une inscription est opérationnelle : le serveur peut refuser toutes les créations. Un fichier absent, invalide ou non conforme affiche un état de prudence. La page ne peut pas accéder aux paramètres privés Auth/SMTP/hooks ou à la réception de vrais emails. L'ouverture commerciale et les vérifications juridiques sont des jalons ultérieurs.

## Recette

- `node --test tests/rm0174-pilot.test.cjs`.
- `node tests/browser/rm01739-root-console.cjs` avec les nouvelles assertions sur les trois états (fermé, déclaration d'ouverture, config invalide) et trois largeurs d'écran.
- Tests d'intégration DEV du dépôt sur la PR avant fusion.
- Publication Render DEV après CI verte, sans toucher à MAIN, V3, Supabase PROD.

## Suite

RM-017.5 : recette Auth DEV réelle du pilote sur invitations consentantes, vérifications du hook, délivrabilité SMTP, Turnstile et isolation. Ne pas ouvrir le pilote sans validation préalable des prérequis et des documents légaux.
