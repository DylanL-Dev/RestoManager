# RM-017.3.3 — Créateur / Root DEV : récupération de l'accès

**23 novembre 2026 — DEV uniquement.** Préserver MAIN, RestoManager-V3 et Supabase PROD `tnsrkargogckgtsxipwd`.

## Diagnostic vérifié

- RestoManager `creator-auth.js` utilisait un alias `root` résolu en `root@accounts.restomanager.example.com` dans les deux environnements.
- Supabase **PROD** contient ce compte et une ligne `platform_admins` active. Ne pas modifier ce compte ni ses mots de passe, et ne **jamais** recopier de hash ou de données Auth PROD vers DEV.
- Supabase **DEV** `lykoybacslvmhtzftqsf` ne contient ni ce compte ni aucune ligne Root active. Un mot de passe enregistré dans Android pour PROD ne peut donc pas fonctionner sur DEV.

## Développement DEV

- Connexion Root via une adresse email réellement accessible : le compte doit **déjà** avoir été créé / invité dans **Supabase DEV**.
- Le formulaire est bloqué en l'absence d'un compte authentifié et confirmé, d'une ligne `platform_admins` **active** correspondant à `auth.uid()` et d'une session MFA **AAL2**. Aucun rôle, mot de passe ou profil n'est créé par le code du navigateur.
- Un facteur TOTP existant doit être vérifié pour ouvrir la console ; à défaut, l'utilisateur Root vérifié doit procéder à l'enrôlement TOTP et confirmer un code à 6 chiffres.
- « Mot de passe DEV oublié » utilise `resetPasswordForEmail` et une page `creator-recovery.html` distincte. Un utilisateur doit posséder un lien sécurisé / une session Supabase Auth vérifiée avant de pouvoir définir son mot de passe ; aucun mot de passe n'est transmis à GitHub ni au chat.
- Les messages de récupération ne confirment jamais publiquement qu'une adresse est enregistrée.
- Aucun changement de RLS, de migration ni de tables métier. Les inscriptions publiques et toutes les demandes de suppression restent verrouillées.

## Procédure manuelle de première activation (NE PAS lancer avant validation email)

1. Recueillir **avec l'accord de l'utilisateur** son adresse email de récupération Root DEV. Ne pas demander ni consigner son mot de passe.
2. Dans le projet Supabase **DEV uniquement** : <https://supabase.com/dashboard/project/lykoybacslvmhtzftqsf/auth/users> → inviter l'adresse email réelle via la procédure d'invitation Auth admin. Ne jamais activer les inscriptions publiques pour cela.
3. Vérifier Supabase Auth **DEV** : SMTP opérationnel, confirmation des emails, site URL et liste d'URL de redirection comprenant **exactement** `https://restomanager-v3-supabase-integration.onrender.com/creator-recovery.html`. Si l'outil d'invitation autorise un `redirectTo`, cibler `https://restomanager-v3-supabase-integration.onrender.com/creator-recovery.html?invitation=1`. Sinon, utiliser le parcours « Mot de passe DEV oublié » après l'invitation et la confirmation.
4. Vérifier que l'utilisateur Auth DEV est confirmé. Un administrateur compétent **dans Supabase DEV** peut alors, sous revue, activer sa ligne `public.platform_admins` pour le bon UUID, `role='platform_admin'`, `active=true`. Vérifier explicitement le projet Supabase cible et l'email avant toute écriture. Ne pas accorder Root à un compte de restaurant partagé ni à un autre UUID par proximité.
5. L'utilisateur saisit uniquement dans RestoManager DEV son email et son mot de passe personnel DEV. Il active TOTP sur son téléphone ; sans MFA AAL2, la console reste fermée.
6. Vérifier la connexion puis la déconnexion, la révocation Root, les appels RLS (aucun accès au second tenant), et les parcours de récupération email. Aucun secret n'est copié entre DEV et PROD.

## Limites / sécurité restante

- La **configuration SMTP, les URL Auth et l'invitation réelle** doivent être vérifiées dans le tableau de bord Supabase DEV. Les outils actuels n'exposent pas de fonction d'administration Auth qui permettrait d'envoyer l'invitation sans connaître l'adresse ; **aucun compte Root DEV n'est créé par ce changement**.
- Les politiques d'accès Root existantes ne sont **pas toutes** garanties AAL2 côté serveur ; l'interface empêche l'ouverture de la console sans MFA, et les RPC sensibles RM-017.3.2 exigent déjà `aal2`, mais une revue générale RLS des lectures Root reste à faire avant commercialisation.
- Si SMTP, protection contre le spam et URL Auth ne sont pas correctement configurés, la récupération peut échouer ; le code n'affirme pas qu'un email a été envoyé avant la réponse de Supabase.
- Ce module ne touche pas au compte Root PROD ni à son mot de passe existant. Le mot de passe Android PROD ne devient **pas automatiquement** un mot de passe DEV.

## Tests

- `tests/rm01733-root-auth.test.cjs` : faux client Supabase, compte non autorisé, Root exigeant MFA, enrôlement MFA, email recovery, aucune escalade de droits.
- `tests/browser/rm01733-root-login.cjs` : layout Root et récupération 360/390/768/1440, vérification WCAG axe, aucune écriture réseau.
- `.github/workflows/rm01733-root.yml` + autres campagnes de CI de RestoManager, avant fusion DEV et Render DEV.

**Règle de publication :** GitHub DEV → 100 % CI → Render DEV. Ne jamais mettre à jour V3/MAIN/PROD sans validation distincte.

## Complément RM-017.3.4 — conserver l'identifiant `root` (23 novembre 2026)

- Aucun email personnel n'est inscrit dans le code source, les tests, les constantes JavaScript ou le dépôt public.
- Sur un **nouvel appareil**, le propriétaire Root DEV saisit son adresse email **une seule fois** avec son mot de passe DEV, puis valide son TOTP MFA. **Après** succès de la vérification de ses autorisations serveur et de MFA AAL2, le navigateur mémorise uniquement cet email dans son stockage local, sous `rm:rootdev:authorized-email-v1`. Le mot de passe, le code MFA, le facteur et le rôle Root ne sont jamais enregistrés par cette fonctionnalité.
- Aux connexions suivantes sur **cet appareil**, le propriétaire saisit simplement **`root`** et son mot de passe DEV ; le navigateur traduit `root` en email mémorisé localement, avant l'authentification standard Supabase (et le MFA obligatoire).
- Si l'appareil est neuf, si le stockage a été effacé, ou si le stockage local n'est pas disponible, `root` ne peut pas être traduit en email : **saisir à nouveau l'adresse email sur le formulaire**, puis repasser MFA. Aucun lookup public non authentifié de l'identité du Root n'est exposé.
- La récupération de mot de passe `root` utilise cet email local uniquement si disponible ; sinon, un email doit être saisi explicitement. Aucun mot de passe PROD n'est copié.
- Le compte Root DEV doit toujours être **créé/invité par un administrateur Supabase Auth DEV** (avec email vérifié), puis autorisé séparément dans la table `platform_admins`. L'accès Root reste inexistant avant ces deux opérations supervisées. Les inscriptions publiques restent désactivées.
- La création manuelle doit passer par **Supabase Dashboard > Authentication > Users > Invite user** ; ne pas créer de compte via INSERT SQL dans `auth.users` et ne pas exposer de clé `service_role`. Le nom du compte et son email DEV ne sont jamais transmis à une fonction publique anonyme.
