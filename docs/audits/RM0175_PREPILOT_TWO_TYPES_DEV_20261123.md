# RM-017.5 — Pré-recette du pilote à deux établissements (DEV)
Date : 23 novembre 2026. **Périmètre strict :** GitHub DEV `feature/v3-supabase-full-clone`, Render DEV et lecture seule Supabase RestoManager-DEV (`lykoybacslvmhtzftqsf`). **MAIN, V3 et Supabase PROD sont exclus.**

## Objectif
Préparer une validation complète de l'inscription pilote pour un **restaurant indépendant** et un **restaurant d'hôtel** sans activer les inscriptions publiques ni créer de comptes réels. L'ouverture d'un vrai pilote est conditionnée à la configuration Auth/SMTP/CAPTCHA/hook et au consentement des personnes utilisant les emails de test.

## Situation initiale vérifiée sur Supabase DEV
- `private.rm017_signup_gate.enabled=false`, 0 invitation active, 0 preuve SIRET en attente et 0 établissement issu de la nouvelle inscription.
- `public.rm017_complete_signup_v1` : `anon` ne possède pas EXECUTE ; `authenticated` possède EXECUTE mais la fonction exige confirmation email, invitation, SIRET officiel et verrou privé.
- `public.rm017_before_user_created_v1` : `supabase_auth_admin` possède EXECUTE, `anon` ne l'a pas. **La permission ne prouve pas que le hook est effectivement configuré dans Authentication.**
- Fonction Edge `rm017-siret` active en DEV ; cela ne prouve pas la délivrabilité email ni une requête réussie auprès du registre.

## Changements livrés
1. Le champ SIRET est demandé et validé **dès l'étape 2**, avant le récapitulatif, avec erreur accessible et retour du focus. Correction du numéro possible sur le même écran. Une mauvaise clé n'entraîne aucun appel réseau.
2. Une fonction de vérification de **format uniquement**, `RestoSignupDraft.validSiret`, est utilisée à la fois dans l'aperçu et avant l'appel Edge de création de compte. La validation **officielle serveur** demeure obligatoire et n'est pas remplacée par le contrôle navigateur.
3. Les tests navigateur couvrent désormais les parcours **hôtel et indépendant**, la transmission du type et du SIRET, le CAPTCHA simulé, la confirmation email simulée et le refus d'une vérification SIRET côté Edge avant toute création Auth.
4. Les tests PostgreSQL isolés déjà présents dans `tests/postgres/rm01722.cjs` continuent à vérifier deux comptes fictifs et deux SIRET différents, invitations à usage unique, transactions et isolation RLS. Aucun accès à Supabase PROD.

## Conditions indispensables pour une **recette réelle** ultérieure (non réalisées ici)
1. **Authentication > Sign In / Providers (DEV)** : vérifier confirmation email obligatoire et aucun fournisseur public non désiré.
2. **Authentication > URL Configuration** : autoriser exactement le domaine Render DEV et le retour `/inscription.html?verified=1`.
3. **Authentication > SMTP Settings** : fournisseur de courrier fonctionnel pour des adresses réellement accessibles. Contrôler une réception réelle ; le service SMTP par défaut Supabase peut limiter les destinataires aux membres de l'organisation.
4. **Authentication > Bot and Abuse Protection** : protection Turnstile complète, clé secrète **dans Supabase uniquement**, clé publique réelle sur le site. Ne pas stocker la clé secrète dans GitHub/Render public.
5. **Authentication > Hooks > Before User Created** : connecter et tester la fonction SQL `rm017_before_user_created_v1`. **ATTENTION :** ce hook global peut bloquer la création d'autres comptes, notamment employés ; planifier un créneau isolé, prévoir le retour arrière et **ne pas l'activer tant que le verrou SQL reste fermé**.
6. Définir deux **emails de test consentants et accessibles**, un indépendant, un hôtel, avec SIRET officiel valide chacun. Ne jamais inventer de faux SIRET pour la vérification gouvernementale.
7. Autoriser temporairement **DEV uniquement** les invitations privées et les deux verrous, après tests négatifs, sans jamais exposer la base privée. Effectuer un vrai `signUp`, réception, clic, confirmation email, création du restaurant et vérification RLS inter-établissements.
8. À l'issue, refermer les verrous côté interface et SQL, supprimer/révoquer les invitations inutilisées selon la procédure choisie, auditer les données de test et vérifier que les services existants restent disponibles. Ne pas déclencher de suppression de comptes existants.

### Portée des tests
La validation JavaScript/Playwright et PostgreSQL jetable **ne vaut pas** test réel des réglages SMTP/Turnstile/Hook. Aucun email n'a été envoyé, aucun compte Auth n'a été créé sur Supabase DEV et aucune inscription réelle n'a été activée.

### Références
- https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/testing-auth-flows
- https://supabase.com/docs/guides/auth/general-configuration
