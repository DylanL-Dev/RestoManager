# RM-AUDIT-02 — Plan de la phase 2 (tests isolés PostgreSQL / Supabase et service simulé)

**25/11/2026 — préparation uniquement.** Issue #144. Aucun workflow déclenché, aucun nouveau workflow, MAIN non modifié.

## 1. Preuves déjà disponibles sans rien déclencher

La PR #228 (release MAIN RM-RELEASE-01A, tête `83e387b`) a **le même arbre Git** que MAIN figé `d852c19` (`5699cea7…`). Ses contrôles du 23/11 portent donc exactement sur le code audité.

| Job (workflow MAIN) | Résultat sur l'arbre `d852c19` | Contenu |
| --- | --- | --- |
| `postgres-isolated` (`rm005-main-full-acceptance.yml`) | ✅ **62/62**, conteneur `--network none` | Migrations et rollback sans superutilisateur, éditions concurrentes (version périmée refusée, allergies conservées), deux réservations concurrentes sur une même chambre ou une même table refusées, maintiens temporaires, double confirmation → une seule réservation, isolation entre établissements, droits plateforme et BUG-01 |
| `closeout` (`rm012-closeout.yml`) | ✅ 94 vérifications | `test:closeout:postgres`, politique `rm012-policy`, navigateur aux sept largeurs et deux rôles, réponse perdue, reconnexion, deux sessions, clôture concurrente |
| `browsers`, `isolated-browser`, `learning`, `notifications`, `management-responsive`, `release-guard` | ✅ | Recoupent la phase 1 ; `learning` confirme que l'échec local de `rm016-learning` venait de l'environnement |

Ces résultats comptent comme exécutés pour la phase 2. Domaines concernés : 2 (réservations), 7 (tables et RLS) et une partie du 5 (deux sessions, sur la clôture).

## 2. Réutiliser les workflows existants : analyse

| Workflow sur MAIN | `workflow_dispatch` | Jobs | Intérêt phase 2 |
| --- | --- | --- | --- |
| `rm005-main-full-acceptance.yml` | Oui | unitaires, navigateurs, `postgres-isolated` | **Redondant** : déjà exécuté sur l'arbre exact (§1) |
| `mission3-validation.yml` | Oui | `unit`, `postgres`, `browser-mock`, **`supabase-isolated`** | **Seul moyen sans nouveau workflow** d'obtenir Auth + PostgREST + Realtime réels en local. **N'a jamais tourné sur MAIN** (aucune exécution `workflow_dispatch` ni sur `main`) |

**Garantie « zéro PROD » (vérifiée dans le code de `d852c19`) :**
- PostgreSQL et Supabase en conteneurs Docker éphémères : PostgreSQL seul en `--network none` ; pile Supabase sur un réseau Docker dédié dont les ports ne sont publiés que sur `127.0.0.1` ;
- aucun secret GitHub utilisé, `permissions: contents: read`, aucune étape de déploiement ;
- dans le navigateur, `context.route('**/*')` annule toute origine autre que l'application locale et le Supabase local, et les WebSockets non locaux sont fermés ;
- le SDK CDN est remplacé par un module local.

**Anomalie du harnais (bloquante pour l'interprétation) :** `tests/supabase/browser-tests.cjs` ne réécrit l'adresse PROD et la clé publique que dans `supabase-service-bridge.js` et `supabase-login.js`. Depuis RM-015.10 (21/11), MAIN centralise cette configuration dans `restomanager-env.js`. Ce fichier n'est pas réécrit et refuse toute origine autre que `https://dylanl-dev.github.io`.
- **Conséquence probable :** le job `supabase-isolated` échouerait sur MAIN à cause du harnais, pas du produit.
- **Aucun risque PROD** pour autant : le routage du navigateur annule la requête.
- Hypothèse non exécutable ici, faute de Docker.

**Comment figer `d852c19` :** `workflow_dispatch` n'accepte qu'une branche ou une étiquette, pas un SHA.
- **Option A :** lancer sur `main` après avoir vérifié que `main` = `d852c19`, puis contrôler `head_sha` de l'exécution. Le harnais reste celui de MAIN, avec l'échec attendu ci-dessus.
- **Option B (recommandée) :** branche d'audit `audit/rm-audit-02-d852c19`, créée depuis `d852c19`, contenant **uniquement des fichiers `tests/`** :
  - la correction du harnais (réécriture de `restomanager-env.js` comme des deux autres fichiers) ;
  - le scénario du §3.

  Lancement de `mission3-validation.yml` sur cette branche, en réutilisant le workflow existant. Le code applicatif reste celui de MAIN, à vérifier par `git diff --stat d852c19..` limité à `tests/`. MAIN n'est pas modifié.

## 3. Scénario « service simulé » — 54 places, Réception + Restaurant

Inséré dans `tests/supabase/` (option B) et exécuté par `supabase-isolated` contre Auth, PostgREST et Realtime locaux réels, avec des comptes fictifs indépendants.

**Jeu de données fictif.** Un établissement « Restaurant fictif », 15 tables pour 54 places (6 × 2, 6 × 4, 3 × 6) et une salle. Midi 12:00–14:30, soir 19:00–21:30, samedi et dimanche midi fermés. Seuil des arrivées 45 %, soit 25 couverts. Comptes `reception` et `fb_admin` fictifs. Un second établissement fictif sert au contrôle d'isolation.

| Étape | Session | Action | Vérification |
| --- | --- | --- | --- |
| S1 | Réception + Restaurant | Ouverture simultanée (390 px et 1024 px) | Deux sessions prêtes, aucun accès hors local |
| S2 | Réception | 24 réservations fictives pour 50 couverts, 19:00–21:30 (hôtel avec chambre, extérieurs) | Apparition côté Restaurant ; **délai de propagation mesuré** (médiane et maximum) |
| S3 | Réception | Pointe : plus de 25 couverts entre 19:00 et 20:00 | Alerte d'affluence et créneaux moins chargés proposés |
| S4 | Réception | Tentative de dépasser 54 places, puis de réserver samedi midi | **Refus serveur** (surcapacité, service fermé), aucune réservation créée |
| S5 | Réception + Restaurant | Même table, même créneau, deux sessions en même temps | Une seule confirmation, l'autre reçoit un refus explicite |
| S6 | Restaurant | Arrivées échelonnées, installation, retard, absence, départ et libération en une touche | Compteurs attendus, arrivés et installés cohérents des deux côtés |
| S7 | Réception + Restaurant | Seuil 45 % → 70 % (38), puis retour 45 % (25) | Valeur affichée seulement après confirmation serveur ; même valeur sur les deux postes |
| S8 | Restaurant | Coupure Realtime simulée (WebSocket fermé), puis reconnexion | Réconciliation visible, aucune donnée ancienne présentée comme confirmée |
| S9 | Les deux | Contrôle final | Nombre de réservations = attendu ; second établissement inchangé (isolation) |

**Livrables :** résultats JSON (`MISSION3_ARTIFACTS`), délais mesurés, captures, journal anonymisé des refus. Durée estimée : 15 à 25 minutes de CI.

## 4. Autorisations nécessaires

1. Créer la branche `audit/rm-audit-02-d852c19` depuis `d852c19` avec des modifications limitées à `tests/`.
2. Lancer `mission3-validation.yml` (existant) sur cette branche par `workflow_dispatch`. À défaut, l'option A sur `main`.

Ensuite : score par domaine et global sur 100, verdict GO / GO avec réserves / NO GO, et les 5 tests manuels de l'équipe.
