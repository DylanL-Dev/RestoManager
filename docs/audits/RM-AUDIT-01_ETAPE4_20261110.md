# RM-AUDIT-01 — Étape 4 : recette authentifiée DEV Render

**Mise à jour finale du 10/11/2026 :** [nouveaux tests et proposition de clôture](RM-AUDIT-01_VERIFICATIONS_FINALES_20261110.md). Statut technique proposé : **VALIDÉE / PRÊTE À CLÔTURER**, sans fusion de la PR #75 et sous réserve de validation formelle par le responsable. Les sections ci-dessous sont le **compte rendu historique initial**, avant les confirmations manuelles DEV et les nouveaux tests isolés ; leurs constats et preuves ne sont pas réécrits.

Contrôle du 10 novembre 2026. Référence Git de préparation : `27054a9bea94028b481efeca921f0a2c18ea1d42`. Aucune étape antérieure n'est requalifiée. **Étape 4 bloquée ; clôture impossible à ce stade. RM-005 non commencée.**

## État constaté et preuves

Le clone est `https://restomanager-v3-supabase-integration.onrender.com/v3-connected.html`. Render déclare le déploiement `dep-dbp6mp5bedkc73frhvhg`, commit `8924fa6249aabd0d34e36ef1c19d17fc2e69700a`, en état `live`. Ce commit est antérieur aux corrections des harnais des étapes 2/3 ; la présence de ces corrections dans Git ne constitue pas une nouvelle publication. Aucune publication n'est effectuée ici.

Le module **réellement importé par Chromium sur le clone** retourne `name: DEV` et `url: https://lykoybacslvmhtzftqsf.supabase.co`. Le connecteur identifie séparément RestoManager-DEV et RestoManager-V3 (`tnsrkargogckgtsxipwd`). Ce constat confirme la cible de configuration, pas toutes les politiques RLS ou les écritures métier.

Preuves machine sans secret : [JSON des contrôles](preuves/rm-audit-01-etape4-20261110.json). Les captures de connexion PC/mobile et le journal du script temporaire sont livrés hors dépôt. Le contrôle navigateur ne fait que GET/HEAD, ferme les WebSocket et refuse les hôtes autres que le clone, Supabase DEV et le CDN. Aucun secret ni donnée nominative n'est exporté.

| ID | Contrôle | Statut | Preuve / limite |
| --- | --- | --- | --- |
| P01 | Cible Supabase isolée du clone | PASS | Import du module natif : DEV `lykoybacslvmhtzftqsf` ; deux projets distincts dans le connecteur. |
| P02 | Connexion publique PC 1440 × 1000 | PASS | `PUBLIC-1440` : login visible, pas de débordement global ni erreur JavaScript non interceptée. Ce n'est pas une connexion au compte Restaurant. |
| P03 | Connexion publique mobile 390 × 844 | PASS | `PUBLIC-390` : même résultat ; viewport Chromium émulé, pas un appareil physique. |
| P04 | Import natif SDK 2.119.0 | PASS | HTTP 200 du module CDN ; `createClient` et lecture de session vide sans erreur. Aucune authentification testée. |
| P05 | Comparaison minimale SDK 2.57.0 | PASS | Même contrôle d'import et session vide. Le chargement PC de 2.57.0 est explicite pour cette comparaison, pas une dépendance native supplémentaire. |
| P06 | Fonctions de date réellement servies | PASS | À 00:01 Paris simulé le 09/11/2032, `today()` et `bookingToday()` renvoient tous deux `2032-11-09`. Cela ne valide pas le rendu authentifié lors du changement de jour. |
| P07 | Présence des deux comptes DEV | PASS | Lecture agrégée DEV : un profil actif par rôle, relié à Auth, confirmé, non banni/non supprimé, mot de passe présent, alias public correspondant. Aucune valeur de mot de passe ni hash lue. |
| A01 | Authentification Restaurant et Réception | BLOQUÉ | Aucun secret de recette dans le runtime ; aucune session authentifiée exploitable dans les outils. Les deux contextes neufs arrivent sur `login.html`. |
| A02 | Création, modification, annulation fictives | BLOQUÉ | Nécessite A01 ; aucune réservation créée. |
| A03 | Realtime entre deux sessions indépendantes | BLOQUÉ | Nécessite A01 ; aucune preuve hébergée de propagation. |
| A04 | Droits Restaurant/Réception effectifs | BLOQUÉ | Nécessite les JWT des utilisateurs ; les lectures SQL d'administration ne remplacent pas ce test. |
| A05 | Verrouillage concurrentiel et notes conservées | BLOQUÉ | Nécessite deux éditeurs connectés et des réservations fictives identifiées. |
| A06 | Service authentifié PC/mobile et minuit | BLOQUÉ | Le PASS des helpers et du login public ne vaut pas PASS de ce parcours. |
| A07 | Nettoyage ciblé en DEV | BLOQUÉ | Scénario non exécuté car aucune donnée de recette créée ; zéro création, zéro suppression. Aucun nettoyage global tenté. |
| A08 | Parité fonctionnelle des deux SDK | BLOQUÉ | Les imports fonctionnent, mais les parcours Auth/REST/Realtime/conflits n'ont pas été comparés avec les deux versions. Réserve P2 maintenue. |

**Bilan : 7 contrôles préparatoires PASS, 0 FAIL observé dans ces contrôles et 8 scénarios/ensembles de validation BLOQUÉS.** Zéro parcours authentifié hébergé exécuté. Ce score n'est pas un taux de validation de l'étape 4. Les succès des étapes 2/3 figurent dans le registre, mais ne sont pas annoncés comme réexécutés dans cette session.

## Blocage d'accès précis

Les observations du runtime sont à jour : zéro secret et zéro variable de recette configurés. Seul le nom d'une variable technique Playwright est présent ; ce n'est pas un identifiant d'équipe. Aucun mot de passe n'a été deviné, demandé dans la conversation, changé ou récupéré depuis les tables Auth. Aucun jeton administratif n'a été utilisé pour se faire passer pour un collaborateur.

Les comptes existent : une création n'est **pas nécessaire**. Un responsable doit fournir deux accès DEV via un stockage de secrets de l'environnement ou rendre accessibles deux sessions navigateur indépendantes. La présence d'un compte et d'un mot de passe configuré ne prouve ni que le mot de passe est connu, ni qu'un login réussira.

## Procédure sécurisée d'accès / création conditionnelle DEV

1. Ouvrir exclusivement le Dashboard du projet `lykoybacslvmhtzftqsf` et vérifier le nom RestoManager-DEV. Ne pas ouvrir une opération mutatrice sur `tnsrkargogckgtsxipwd`. Vérifier le routage du clone avant tout essai.
2. Réutiliser les deux comptes DEV existants correspondant aux alias publics `admin-fb` (Restaurant) et `reception`. Ne pas les dupliquer, les supprimer, les réaffecter ou réinitialiser leurs mots de passe automatiquement. Si une récupération est nécessaire, elle doit être décidée par leur responsable pour éviter d'interrompre une autre recette.
3. Fournir les accès dans les secrets du runtime, par exemple `RM_DEV_RESTAURANT_PASSWORD` et `RM_DEV_RECEPTION_PASSWORD`, ou connecter les deux sessions du navigateur de recette. Ces noms sont proposés : ils ne sont pas configurés actuellement. Ne mettre ni mots de passe ni `storageState`/JWT dans Git, un rapport ou un message.
4. **Seulement si les comptes sont ultérieurement absents** : l'administrateur crée deux utilisateurs dans Auth DEV par le Dashboard ou l'API Admin DEV, avec mots de passe aléatoires stockés directement dans le gestionnaire de secrets. Ne pas insérer des lignes à la main dans `auth.users`, ne pas ouvrir l'inscription anonyme, ne pas utiliser l'API de production.
5. Les identités doivent correspondre aux adresses des deux alias autorisés dans `supabase-login.js` : `admin-fb@accounts.restomanager.example.com` et `reception@accounts.restomanager.example.com`. Si ces adresses existent déjà, arrêter la création et résoudre l'accès existant. Un nouveau compte avec une adresse arbitraire ne sera pas utilisable par le formulaire actuel ; ne pas modifier l'allowlist dans cette mission.
6. Associer l'UUID Auth DEV à un `staff_profiles` actif du seul établissement DEV de recette : rôle `fb_admin` ou `reception`. Ne jamais accorder `platform_admin`, un rôle SQL privilégié ou BYPASSRLS. Ne pas modifier les comptes ou politiques de production. Si aucun établissement n'est dédié aux données fictives, le responsable doit définir ce périmètre avant de provisionner ou réaffecter un compte.
7. Tester réellement les deux logins, relever le projet des requêtes réseau, puis vérifier les rôles dans l'application. Tant que ce point manque, conserver A01 à BLOQUÉ.

Cette procédure n'a pas été appliquée : aucun compte créé, mot de passe changé, rôle réaffecté ou privilège élargi.

## Scénarios authentifiés prêts à exécuter

Ils peuvent être exécutés manuellement par le responsable sur DEV, ou automatisés avec Playwright dès mise à disposition des accès. Chaque essai doit utiliser un marqueur unique `RM-AUDIT-01-<date>-<run>` et un manifeste contenant projet DEV, établissement, IDs des réservations/maintiens créés et horodatages. Ne jamais utiliser une réservation préexistante comme réservation de recette.

| Scénario | Actions DEV uniquement | Attendu et preuves à conserver |
| --- | --- | --- |
| S01 — Deux connexions | Deux contextes sans cookies communs, comptes Restaurant / Réception. Contrôler le module d'environnement avant de saisir. | Projet `lykoybacslvmhtzftqsf`, bon rôle affiché, chargement complet. Captures sans secrets, requêtes Auth sans headers/tokens exportés. |
| S02 — Création hôtel / extérieur | Créer une réservation fictive par rôle, sur un créneau futur réellement ouvert et une table compatible libre. Utiliser chambre fictive au format autorisé, nom fictif et marqueur en notes ; ne modifier aucun horaire. | Une seule confirmation par opération, ID serveur relevé ; chambre/type et attribution correcte. Contrôler la seconde session. |
| S03 — Modification et notes | Sur les IDs du manifeste, modifier la chambre puis les couverts et le nom ; conserver une note et une allergie fictives. | Version actualisée, ancienne chambre remplacée, notes/allergies conservées, Réception réattribuée automatiquement si nécessaire. Captures et lecture après rechargement. |
| S04 — Édition concurrente | A et B ouvrent le même ID. A ajoute une allergie fictive et valide. B conserve son ancienne fiche, change le nom puis valide. | B refusé sans écrasement ; allergie de A conservée ; saisie de B préservée ; rechargement soumis à confirmation explicite. Captures avant/après et versions techniques. |
| S05 — Collision table | Deux comptes demandent simultanément la même table et le même intervalle pour deux réservations fictives distinctes. | Une seule attribution incompatible acceptée ; maintien concurrent ou conflit expliqué, pas de doublon. Conserver les deux réponses et les IDs créés. |
| S06 — Annulation | Annuler uniquement un ID du manifeste depuis un rôle autorisé ; observer l'autre session. | Statut propagé, table libérée selon le métier ; une ancienne fiche ne ressuscite pas la réservation. |
| S07 — Permissions | Réception : absence de choix manuel de table/installation/gestion réservée au Restaurant. Essai négatif contrôlé uniquement sur une réservation fictive. Restaurant : opérations autorisées sur ses objets fictifs. | Refus serveur des opérations interdites, pas seulement bouton caché. Aucun essai sur l'objet d'un client réel. Toute opération négative éventuellement acceptée ne doit toucher qu'un ID de recette DEV. |
| S08 — Realtime / reconnexion | Créer, modifier et annuler un ID fictif depuis A ; relever les heures puis l'apparition chez B, sans rechargement. Couper/reprendre le réseau de B. | Les deux interfaces convergent ; une opération non confirmée n'est pas annoncée réussie ; les modifications distantes ne sont pas écrasées. Mesurer les délais réels, sans inventer de seuil observé. |
| S09 — PC/mobile et minuit | 1440 × 1000 et 390 × 844, les deux rôles. Sur un contexte DEV de test, horloge Paris juste avant/après 00:00 ; rester en lecture pendant la simulation temporelle. | Même journée pour tables/réservations/formulaire, état réseau cohérent et pas de débordement. Ne pas écrire des réservations avec une heure simulée ; garder l'heure serveur pour les écritures réelles. |
| S10 — Nettoyage ciblé | Relire chaque ID du manifeste dans DEV et vérifier établissement + marqueur + création pendant le run. Annuler puis supprimer uniquement si le parcours autorisé le permet ; libérer seulement les maintiens propriétaires du run. | Énumération des IDs nettoyés et des éventuels résidus. En cas de doute : ne pas supprimer. Ne jamais faire de DELETE/TRUNCATE global, de purge par préfixe seul, ni supprimer les comptes réutilisés. |

Si une UI ou une RPC n'autorise pas une suppression sûre, laisser les données fictives annulées identifiées et signaler précisément les résidus au responsable. Un effacement administratif ad hoc ne doit pas masquer un défaut de parcours.

## Réserve SDK P2

Le frontend publié charge **2.119.0** depuis jsDelivr. `package.json`/lockfile et l'UMD injecté par `tests/supabase/browser-tests.cjs` restent en **2.57.0**. Le harnais réécrit les imports CDN vers ce module local : ses étapes 2/3 vertes ne sont donc pas une preuve d'exécution du SDK frontend 2.119.0.

Les deux versions s'importent dans Chromium et `auth.getSession()` retourne une session vide sans erreur, sur la cible DEV. Ce test réduit le doute sur l'import, mais ne couvre ni login/refresh, ni contrat RPC, ni reconnexion Realtime ou conflits. **La réserve n'est pas levée.** Pour la lever, préparer une évolution de tests distincte : aligner le SDK isolé sur celui du frontend ou effectuer deux runs différentiels avec versions épinglées et les mêmes scénarios Auth/REST/Realtime, puis terminer la recette native DEV. Ne pas assouplir le filtrage réseau du laboratoire et ne pas publier de fonctionnalité à cette occasion.

## Décision

**CLÔTURE NON POSSIBLE.** Les précontrôles automatiques passent, mais aucune preuve de recette authentifiée du clone hébergé n'est disponible. L'accès aux comptes DEV et les scénarios S01–S10 restent à exécuter ; la réserve SDK P2 reste ouverte. RM-AUDIT-01 demeure en cours, étape 4 BLOQUÉE ; cela n'est ni une validation utilisateur, ni une demande de passer à RM-005.

La mise à jour du registre est proposée sur une branche documentaire dédiée. Aucune fusion de PR n'est réalisée. V3, MAIN et Supabase production ne sont pas modifiés.
