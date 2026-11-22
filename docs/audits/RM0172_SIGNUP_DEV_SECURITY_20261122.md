# RM-017.2 — Authentification DEV et isolement inter-établissements
Date : 22 novembre 2026. Portée : exclusivement GitHub DEV + Supabase RestoManager-DEV (\`lykoybacslvmhtzftqsf\`) + Render DEV.

## Audit de l'existant

- \`public.restaurants\`, \`staff_profiles\`, \`restaurant_hours\`, \`restaurant_rooms\`, \`reservations\` et \`restaurant_tables\` existent déjà, liés par \`restaurant_id\`.
- \`private.staff_restaurant()\` et \`private.current_staff_role()\` dérivent l'établissement et le rôle d'un profil serveur lié à \`auth.uid()\` ; ne jamais utiliser \`raw_user_meta_data\` ou des champs JWT modifiables comme autorisation.
- Plusieurs policies \`SELECT\` et \`ALL\` avaient des prédicats rôle seulement. Parce que les policies PERMISSIVE se combinent par **OR**, \`same_restaurant\` ne les rendait pas sûres. L'étape RM-017.2 renforce ces policies pour y ajouter \`restaurant_id = private.staff_restaurant()\`.
- \`private.initialize_restaurant_hours\` et le trigger \`rm012_initialize_policy\` créent les règles par défaut à l'insertion. Ne pas dupliquer la ligne des horaires.
- L'UI actuelle est une PWA statique. Les comptes Réception/Restaurant existants sont des alias et ne doivent pas être remplacés.

## Fonctionnalité développée (mise en service différée)

1. Garder la page et l'identité visuelle RM-017.1, ajouter un mot de passe de 12 caractères minimum et une validation côté UI.
2. Avec la clé **publishable DEV uniquement**, appeler \`supabase.auth.signUp\` (Supabase Auth, pas d'écriture directe vers restaurants).
3. Demander la confirmation par email avec \`emailRedirectTo=https://restomanager-v3-supabase-integration.onrender.com/inscription.html?verified=1\`.
4. Au retour Auth vérifié, invoquer \`public.rm017_complete_signup_v1\`. Ce RPC n'est autorisé qu'aux utilisateurs authentifiés dont l'email est **confirmé dans auth.users**, non anonymes et sans \`staff_profiles\` existant.
5. L'opération crée dans **une seule transaction** le restaurant, son profil type Hôtel / Indépendant, l'administrateur \`fb_admin\`, la salle principale et les horaires fermés par trigger. Aucun portail client n'est ouvert.
6. Nouveau compte DEV : connexion possible par email, sans modifier les alias existants.

## Sécurité et activation

**Activation fermée par défaut à deux niveaux :**

- \`private.rm017_signup_gate.enabled=false\` côté Supabase DEV, non accessible à \`anon\` ni \`authenticated\`.
- \`rm017-runtime.json.enabled=false\` côté Render DEV ; l'interface explique que les inscriptions sont suspendues.

Le formulaire contient le workflow complet, mais **aucun utilisateur réel ne peut être créé par l'interface tant que ces deux verrous restent fermés**. Cette limite est volontaire et doit être signalée clairement.

Avant tout déverrouillage DEV, le responsable doit contrôler dans **Supabase DEV exclusivement** :
- Auth > Providers > Email : *Confirm Email* activé, inscription email activée ;
- Auth > URL Configuration : Site URL et liste des redirections contenant exactement le domaine Render DEV et \`/inscription.html?verified=1\` ;
- SMTP : délivrabilité testée. L'envoi standard de Supabase peut être limité aux membres de l'organisation et à deux messages par heure ; préférer SMTP dédié avant une phase pilote ;
- Auth > Bot and Abuse Protection : CAPTCHA et limites raisonnables, notamment en cas d'ouverture à Internet ;
- Test de bout en bout avec comptes fictifs et email reçu, puis SQL de vérification de l'isolement multi-établissements ;
- Vérification que les nouvelles salles/horaires ne contiennent aucune donnée d'un autre restaurant.

**Ne pas ouvrir** à des comptes publics avant ces contrôles. Ne jamais modifier MAIN, V3 ou Supabase PROD automatiquement.

## Tests

- \`node --test tests/rm0171-signup.test.cjs tests/rm0172-signup.test.cjs\`
- \`node tests/postgres/rm0172.cjs\` : environnement PostgreSQL 17 **jetable et sans réseau**, deux tenants existants + un nouveau compte fictif, refus des demandes non confirmées, vérification de l'étanchéité RLS et des doublons
- \`node tests/browser/rm0171-signup.cjs\` : 7 largeurs, parcours Hôtel/Indépendant, WCAG AA, zéro POST tant que la double activation est fermée.
- Supabase DEV : vérification catalogues / grants / RLS après migration + \`get_advisors\`. Aucun test ne crée de compte ni de réservation dans PROD.

## Suite

Une fois la livraison visuelle DEV vérifiée sur Render, demande distincte pour valider SMTP, le CAPTCHA, les URLs de confirmation et réaliser la recette réelle d'inscription DEV. Mise en production uniquement avec un audit plus large des RPC historiques, indépendamment du présent développement.
