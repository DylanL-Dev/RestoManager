# RM-018 — Cadre juridique RestoManager DEV (23 novembre 2026)

## Périmètre et sécurité
- Développé **uniquement** sur `feature/rm018-legal-framework-dev-20261123`, cible `feature/v3-supabase-full-clone`, Render **DEV**.
- **Aucune intervention** sur MAIN, V3 historique, Supabase PROD, Supabase DEV (données, Auth, Edge, RLS) ou comptes réels.
- Conserver les inscriptions sur invitation désactivées. L'accès public aux **brouillons** juridiques sur DEV n'autorise ni connexion ni création de compte.

## Contenu livré
- `legal.html` : accueil et statut transparent de la préparation.
- `mentions-legales.html` : identité de l'entreprise individuelle Dylan LEFEBVRE, nom commercial Web Labs, SIREN/SIRET/RNE, adresse professionnelle déclarée ; contacts professionnels et coordonnées d'hébergeur explicitement non finalisés.
- `cgu.html` : utilisation par établissements/équipes et portail client, rôles et responsabilités, séparation des données, restrictions.
- `cgv.html` : **projet B2B sans vente active**. Aucun tarif, SLA, renouvellement ou délai de paiement inventé ; échéances et intérêts à définir avant première transaction.
- `confidentialite.html` : rôles distincts entre Web Labs et établissements ; traitement des comptes et réservations ; informations potentiellement sensibles (allergies) ; finalités, droits, conservation et transferts à formaliser.
- `cookies.html` : informations sur session, localStorage, PWA/cache, Turnstile **désactivé côté pilote DEV** ; ne crée pas de faux bandeau.
- `dpa.html` : projet d'annexe responsable/sous-traitant selon article 28 du RGPD, à compléter avant contrat.
- `legal.css` : mise en page mobile/PC cohérente, typographie locale, sans JavaScript, traceur, CDN ni collecte.

## Points d'entrée contrôlés
- Connexion : `login.html` (liens directs).
- Inscription : `inscription.html` (liens visibles dans le footer).
- Créateur : `creator.html` (pied de page).
- Gestion : `v3-connected.html` (pied de navigation).
- Démonstration réservation publique : `reservation/index.html` (liens distincts des boutons d'information de la démo).

## Audit technique ciblé des traceurs
Observations confirmées à partir des fichiers du dépôt DEV :
- Pages juridiques RM-018 : HTML/CSS statiques, aucun `script`, `iframe`, stockage local ni appel externe nécessaire au chargement.
- `creator-auth.js` : raccourci `rootdev` utilisant localStorage après vérification Root ; pas de secret créé par ce mécanisme.
- `rm017-register.js` : charge `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` uniquement dans le parcours d'inscription pilote activé ; `rm017-runtime.json` laisse `turnstileSiteKey=null` et `enabled=false`.
- Auth Supabase JS et PWA : des mécanismes de session/cache peuvent être actifs. Le recensement global et exact des cookies, localStorage, SDK tiers, durées de vie, audiences et transferts doit être complété avant ouverture.
- **Aucun bandeau « Accepter/Refuser » simulé**. Si un traceur non essentiel est découvert, son chargement doit être conditionné à un consentement valide, symétrique et révocable ; préférences traçables.

## Données de l'éditeur — confirmées pour ces brouillons
Web Labs : entreprise individuelle de Dylan LEFEBVRE ; SIREN 853 148 161, SIRET 853 148 161 00039, RNE 08/11/2023, siège professionnel 600 rue de la Résistance, 76410 Saint-Aubin-lès-Elbeuf ; APE 5829C.
**Ne pas exposer l'email personnel DEV comme adresse de contact commerciale/DSAR sans décision explicite.**

## Bloquants avant mise en service / validation juridique
1. Confirmer email professionnel, contact droits RGPD, numéro de téléphone commercial et mentions de TVA réellement applicables.
2. Confirmer entité juridique, adresse/téléphone du fournisseur d'hébergement, régions, sous-traitants, et garanties de transferts (Render, Supabase et éventuels services tiers).
3. Définir offres B2B, tarifs et prix unitaires HT, remises/escompte, délais et pénalités de paiement, modalités de souscription et résiliation, support, réversibilité et conditions particulières.
4. Définir responsables de traitement, registre, conservation et destruction, sauvegardes, procédure d'incident, catégories de données (notamment allergies) et DPA effectif.
5. Audit cookies du **site complet** avec blocage de traceurs non essentiels avant consentement si nécessaire. Ne pas prétendre à une dispense sur la seule base de l'absence de scripts dans les pages juridiques.
6. Validation finale par un professionnel du droit et mise en place d'une acceptation traçable au moment d'une souscription ou inscription réelle ; versionner les documents et les dates d'effet.
7. Vérifier le parcours de communication des conditions de réservation du **restaurant** au client final, distinct des CGU SaaS.

## Sources institutionnelles utilisées
- [Service-Public Entreprendre — mentions obligatoires site professionnel](https://entreprendre.service-public.gouv.fr/vosdroits/F37351)
- [DGCCRF / Économie — CGV B2B](https://www.economie.gouv.fr/entreprises/gerer-sa-comptabilite-et-ses-demarches/conditions-generales-de-vente-entre)
- [CNIL — Cookies, exemption et consentement](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi)
- [CNIL — Transparence RGPD](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence)
- [CNIL — RGPD article 28](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4)

## Recette prévue
- `node --test tests/rm018-legal.test.cjs`.
- `node tests/browser/rm018-legal.cjs` : 7 pages × 4 tailles, contrôles WCAG 2.1 AA en mobile/desktop, zéro script externe ou stockage, aucun POST.
- 14 workflows existants du dépôt + nouveau workflow RM-018, puis **Render DEV uniquement** après validation.
