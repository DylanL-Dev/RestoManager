# RM-017.2.1 — Pilote privé et confirmation email (DEV)
22 novembre 2026. **Périmètre strict :** GitHub \`feature/v3-supabase-full-clone\`, Supabase **RestoManager-DEV** uniquement (\`lykoybacslvmhtzftqsf\`) et Render DEV (\`restomanager-v3-supabase-integration.onrender.com\`).

## État livré
- UI RM-017.1 conservée, nouvelle confirmation email lisible dans la page même après rechargement ou lien expiré.
- Suppression du fragment d'authentification de l'adresse après la vérification de session.
- Contrôle Turnstile **au troisième écran visible** : token transmis à \`auth.signUp(options.captchaToken)\`, expirations et erreurs bloquantes, jeton réinitialisé après chaque tentative.
- Invitations privées \`private.rm017_pilot_invites\` : une adresse normalisée et un type d'établissement autorisés, date d'expiration, désactivation et consommation transactionnelle.
- \`public.rm017_complete_signup_v1\` (vérification serveur indépendante du navigateur) exige un email confirmé, invitation active et non consommée, type conforme et verrou global ouvert.
- Hook \`public.rm017_before_user_created_v1(jsonb)\` préparé pour Auth > **Before User Created** : refuse aussi la création de comptes Auth non invités, avant confirmation. Il n'est **pas activé automatiquement**.
- Nouveau runtime \`rm017-runtime.json\`, \`schema: 2\`, \`enabled: false\`, \`pilotOnly: true\`, \`captchaRequired: true\`, \`turnstileSiteKey: null\`. Il reste fermé tant que les prérequis ne sont pas prouvés.

## Limite de vérification importante
Les connecteurs Supabase disponibles permettent de vérifier SQL, tables, permissions, migrations et audits mais **pas** de lire/modifier les réglages hébergés Auth/SMTP/redirect/CAPTCHA/Hooks. Ils ne permettent pas non plus d'ouvrir une boîte mail de test pour constater la réception. Les tests navigateur utilisent des réponses **simulées**, jamais un email réel. Ne pas les confondre avec un test de délivrabilité.

## Vérifications manuelles obligatoires, seulement dans Supabase DEV
1. Dans **Authentication > Providers > Email**, activer **Confirm Email** ; vérifier l'ouverture des inscriptions Auth uniquement pour les tests et désactiver les fournisseurs d'authentification non souhaités.
2. Dans **Authentication > URL Configuration**, définir le site URL DEV \`https://restomanager-v3-supabase-integration.onrender.com/\` et autoriser exactement \`https://restomanager-v3-supabase-integration.onrender.com/inscription.html?verified=1\`.
3. Dans **Authentication > SMTP Settings**, vérifier l'envoi. Le service email intégré Supabase n'autorise normalement que les emails des membres du projet et limite les envois à **2 par heure**. Pour tester d'autres adresses, configurer un fournisseur SMTP dédié. **Ne jamais committer de mot de passe SMTP**.
4. Dans **Authentication > Bot and Abuse Protection**, configurer Cloudflare Turnstile avec la **clé secrète** côté Supabase DEV. Créer/autoriser le domaine Render DEV dans Turnstile ; seule la **clé publique du site** ira dans \`rm017-runtime.json\`.
5. Activer les protections contre les mots de passe divulgués, vérifier les limites Auth et tester l'envoi d'un message jusqu'à réception réelle.
6. Insérer dans **Supabase DEV uniquement** deux adresses de test consentantes, avec un type différent, par exemple (remplacer les valeurs ; aucune adresse n'est ajoutée automatiquement) :

\`\`\`sql
insert into private.rm017_pilot_invites(email,establishment_type,expires_at)
values
  (lower(trim('TEST-INDEPENDANT@VOTRE-DOMAINE.FR')),'independent',now()+interval '48 hours'),
  (lower(trim('TEST-HOTEL@VOTRE-DOMAINE.FR')),'hotel',now()+interval '48 hours');
\`\`\`

7. Dans **Authentication > Hooks > Before User Created**, sélectionner la fonction Postgres \`public.rm017_before_user_created_v1\`. Le hook bloque les créations de comptes Auth non invités, mais **s'il est activé lorsque le verrou est fermé, il bloque toute création de compte**, y compris de nouveaux comptes employés. Les utilisateurs existants et leurs connexions ne sont pas modifiés.
8. Après validation du hook sur des événements simulés et contrôle des permissions, autoriser temporairement l'inscription pilote SQL, **DEV uniquement** :

\`\`\`sql
update private.rm017_signup_gate
set enabled=true, updated_at=now()
where id=1;
\`\`\`

9. Sur la branche **DEV seulement**, mettre \`rm017-runtime.json.enabled=true\` et y inscrire la **clé publique Turnstile réelle**, jamais une clé de test. Redéployer Render DEV. Vérifier que la page fait le CAPTCHA au dernier écran, puis \`signUp\`, puis l'email, puis \`?verified=1\`, puis crée exactement un restaurant avec ses horaires fermés. Vérifier le rejet des adresses non invitées au niveau **Auth et SQL**, des liens expirés et des tentatives répétées.
10. Après les essais, **refermer les deux verrous** : remettre \`enabled=false\` dans \`rm017-runtime.json\` et le déployer, puis \`update private.rm017_signup_gate set enabled=false,updated_at=now() where id=1;\` dans Supabase DEV. La table des invitations reste privée, ne pas réutiliser d'adresses sans consentement.

## Recette technique sans emails réels
- \`node --test tests/rm0171-signup.test.cjs tests/rm0172-signup.test.cjs tests/rm01721-pilot.test.cjs\`
- \`node tests/postgres/rm01721.cjs\` : deux restaurants pilotes fictifs, invitation absente/invalide/expirée, confirmation refusée, hook refusé/autorisé, une création, isolation RLS, horaires fermés. PostgreSQL temporaire, **sans réseau**.
- \`node tests/browser/rm01721-pilot.cjs\` : CAPTCHA simulé, retour de confirmation valide, refus de lien expiré, aucun accès extérieur réel.
- \`node tests/browser/rm0171-signup.cjs\` : préservation de la maquette approuvée et accessibilité sur 7 largeurs.

## Périmètre et précautions
Aucune modification MAIN, V3, Supabase PROD. Aucun compte, invitation ou email réel créé par la migration. L'Auth Hook est **opt-in** et peut bloquer d'autres flux de création de comptes : contrôler les utilisateurs employés avant activation. Le pilote ne doit pas être présenté comme une inscription publique commercialisable.

Références officielles :
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
- https://supabase.com/docs/guides/auth/testing-auth-flows
