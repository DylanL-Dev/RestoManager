# RM-017.2.2 — Contrôle SIRET professionnel (DEV uniquement)
22 novembre 2026 · Portée limitée à GitHub branche DEV, Supabase **RestoManager-DEV** (\`lykoybacslvmhtzftqsf\`), Render DEV. Préserver MAIN, V3 et Supabase PROD.

## Objet
Rendre l'inscription pilote plus crédible, en vérifiant **côté serveur** que le SIRET de l'entreprise exploitante correspond à un établissement français **actif** sur une source gouvernementale. Le contrôle n'est pas une preuve de propriété : il reste nécessaire de confirmer l'email et d'appliquer la règle d'invitation ou une validation manuelle avant l'ouverture commerciale.

## UX
- Charte RM-017.1 conservée, suppression du double contour vert + doré sur la carte de type sélectionnée au toucher (une seule bordure verte, focus doré réservé à la navigation au clavier), sans modifier le cadre global du formulaire.
- Champ SIRET de 14 chiffres dans la deuxième étape, prévisualisation lisible à la troisième.
- Le SIRET n'est **jamais accepté uniquement sur le calcul Luhn du navigateur**. La validation extérieure est obligatoire avant \`auth.signUp\` et demeure obligatoire après la confirmation email via une preuve serveur en base.
- Affichage du nom légal, de la ville et du code d'activité APE officiels si vérifiables. Le **nom commercial** du restaurant est conservé distinctement.
- Restaurant d'hôtel : l'exploitant peut être juridiquement distinct de l'hôtel ; demander le SIRET de l'exploitation. Aucun choix automatique de l'identité de l'entreprise basée sur la chaîne d'hôtel.
- Entreprise à diffusion restreinte, établissement non couvert par les résultats officiels ou API indisponible : refus **fail-closed** et aide pour une vérification manuelle, jamais acceptation sur déclaration seule.

## Défenses serveur
- \`rm017-siret\` Supabase Edge **DEV uniquement**, endpoint pré-inscription, sans JWT, car il doit fonctionner avant la création du compte ; ne pas le déployer sur PROD.
- Vérification de l'origine Render DEV, taille et forme de la demande, SIRET Luhn. Attention : \`Origin\` n'est pas une authentification et peut être falsifié par un client non navigateur.
- RPC \`public.rm017_siret_allow_lookup_v1\` accessible au service backend seulement. Elle exige **simultanément** le verrou privé ouvert, une invitation valide non consommée, un type correspondant et l'absence de doublon ; maximum 6 appels officiels par adresse invitée et par heure.
- Lookup sur un hôte gouvernemental fixe : API Recherche d'Entreprises, avec route de secours SocialGouv à SIRET exact. Vérifier **l'établissement exact** et son activité ; une correspondance du seul SIREN ne suffit pas.
- Contrôle de l'activité APE : ouverture automatique seulement pour les codes d'hébergement/restauration commençant par 55 ou 56. Activité absente, hors secteur, holding ou exploitation juridiquement atypique : **aucun compte automatique**, examen manuel plutôt qu'une exclusion permanente. Le code APE est indicatif et n'atteste pas des pouvoirs du responsable.
- Preuve officielle stockée uniquement en \`private.rm017_siret_prechecks\`, par email+SIRET+type, avec expiration 48 h.
- Hook Auth « Before User Created » préparé en RM-017.2.1, renforcé pour refuser un compte dont le SIRET annoncé dans les métadonnées n'a pas de preuve serveur préalablement enregistrée.
- \`rm017_complete_signup_v1\` exige email confirmé, invitation valide, SIRET correspondant à la preuve serveur non expirée et absent des autres établissements. Ajout d'une unicité SQL sur les nouveaux SIRET. Le processus consomme l'invitation et la preuve en une transaction.
- Les anciens établissements n'avaient pas tous de SIRET enregistré. **La détection des doublons n'est exhaustive qu'après la mise en correspondance contrôlée des SIRET existants** (avec autorisation de l'exploitant).
- \`rm017-runtime.json.enabled=false\`, \`turnstileSiteKey=null\`, \`private.rm017_signup_gate.enabled=false\` et invitations vides tant qu'un test email réel, SMTP, CAPTCHA et hook Auth ne sont pas validés.

## Sources et limites
- https://recherche-entreprises.api.gouv.fr/docs/ : recherche directe par SIRET ; vérifier précisément l'établissement.
- https://api.recherche-entreprises.fabrique.social.gouv.fr/ : API d'établissement par SIRET, issue des données Sirene (secours).
- Le registre principal peut fournir seulement le siège pour un SIRET d'établissement secondaire ; un résultat ambigu **n'est pas considéré comme une vérification réussie**.
- Les données publiées peuvent être incomplètes ou nécessiter un contrôle humain.

## Validation avant publication DEV
1. Tests Node : SIRET invalide, fermeture, correspondance du SIREN seul refusée, activité APE absente/hors secteur refusée, demande d'origine non autorisée refusée, contrôles serveurs.
2. PostgreSQL 17 jetable : 0172 + 01721 + 01722, preuves serveur et invitations, expirations, doublons, hook Auth, isolement RLS restaurant indépendant / hôtel.
3. Tests navigateur simulés du tunnel existant : SIRET exigé avant Auth, statut officiel visible, confirmation email, lien expiré, 7 largeurs et accessibilité.
4. Vérification exhaustive des pipelines GitHub (12 campagnes) sur la PR dédiée avant d'appliquer la migration Supabase **DEV**.
5. Avant de déployer l'Edge \`rm017-siret\` sur DEV, valider explicitement \`SUPABASE_URL=...lykoybacslvmhtzftqsf...\` et la fonction service_role dans le code serveur (jamais dans le navigateur). Le service reçoit ses secrets via les variables d'environnement du projet Supabase DEV.
6. Déployer uniquement sur Render DEV et vérifier l'identifiant de commit et le mode pilote **fermé**.
7. Aucun envoi email ni création effective d'établissement jusqu'à ce que les paramètres Auth/SMTP/Turnstile soient validés dans Supabase DEV et qu'un test réel soit constaté.

## Après livraison
Parcours réel à tester sur invitation : inscription → SIRET → reconnaissance entreprise active → CAPTCHA → confirmation email → création du restaurant isolé, puis accès gestion. En cas de SIRET déjà enregistré, proposer une demande d'accès plutôt que créer un autre établissement. Cela nécessitera un parcours d'approbation distinct (jamais attribution automatique des droits).
