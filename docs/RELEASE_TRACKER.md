# RestoManager — registre officiel des évolutions DEV → V3 → MAIN

**Source de vérité du projet : ce document sur `feature/v3-supabase-full-clone`.**  
Créé le 10 novembre 2026, après l'incident de synchronisation lié à la journée de service.  
**Règle absolue : une seule évolution active à la fois.** Ne pas passer à une nouvelle fonctionnalité tant que la précédente n'est pas **VALIDÉE CLONE** par l'utilisateur ou explicitement **BLOQUÉE / REPORTÉE**. Une réparation urgente mettant le service en sécurité fait exception et suspend la fonctionnalité en cours.

## Statuts autorisés

| Statut | Sens et action autorisée |
| --- | --- |
| À FAIRE | Demandée, pas encore commencée. |
| EN COURS DEV | Modification sur le clone uniquement. Ne rien pousser vers V3/MAIN. |
| À TESTER CLONE | Développement et tests techniques terminés, attente d'essais visuels/fonctionnels sur Render et des deux rôles. |
| VALIDÉE CLONE ✅ | L'utilisateur a explicitement validé la fonctionnalité sur Render, avec preuves et critères. Prête à préparer une livraison. |
| PRÊTE À PUBLIER | Diff analysé, dépendances complètes, sécurité DB vérifiée, tests automatiques réussis. |
| PUBLIÉE V3 | Fusion de la PR V3 réussie. Ne signifie pas encore que MAIN est à jour. |
| PUBLIÉE MAIN | Fusion de la PR MAIN réussie. Ne signifie PAS que GitHub Pages ou l'écran utilisateur est validé. |
| CONFIRMÉE EN PRODUCTION ✅ | L'utilisateur a constaté sur la vraie interface que la fonction marche, sans test destructif. |
| BLOQUÉE / REPORTÉE | Cause et plan de reprise décrits ; l'utilisateur accepte de suspendre l'évolution. |

**Ne jamais confondre** « commit GitHub », « tests CI réussis », « déploiement réussi » et « validation de l'écran réel ».

## Procédure obligatoire pour CHAQUE évolution

1. **Avant de coder**, ajouter une ligne avec ID, intitulé, périmètre, critères d'acceptation (Restaurant, Réception, mobile/tablette/PC), risques et statut `EN COURS DEV`. Une seule ligne peut être active simultanément.
2. Développer/committer **sur DEV Clone** ; ne jamais copier la configuration Supabase DEV dans la production. Mettre à jour le statut et les tests dans ce registre au même commit ou immédiatement après.
3. Tester sur **Render connecté à Supabase DEV** : créer, modifier, annuler (données fictives DEV uniquement), tables, rôles, synchronisation, écrans mobiles ; inclure des scénarios autour de **00:00 Europe/Paris**. Enregistrer les résultats.
4. Passer à `À TESTER CLONE` et demander une **validation explicite de l'utilisateur** : « oui validé » / « corrige ». Si refus, rester sur la même évolution ; **ne pas ouvrir la suivante**.
5. Après `VALIDÉE CLONE`, comparer l'ensemble des dépendances (HTML, CSS, JS, icônes, PWA, tests), exclure fichiers de routage DEV, migrations et RPC non disponibles en production. Créer une branche/PR V3 et sa PR MAIN ; jamais de fusion massive de DEV.
6. CI : vérification syntaxe, tests de régression, sélection du bon projet Supabase, Réception sans gestion de tables, sauvegarde automatique de l'attribution, jour du service. Contrôler les clés de cache du HTML et du service worker.
7. Fusionner **V3 d'abord**, puis **MAIN**, uniquement si les tests sont verts. Conserver références PR et SHA.
8. Vérifier le déploiement GitHub Pages **et** le navigateur (dont la PWA et le cache). Ne considérer l'opération terminée qu'après validation visuelle et fonctionnelle de l'utilisateur. **Ne jamais saisir de fausse réservation dans la base réelle.**
9. Confirmer `CONFIRMÉE EN PRODUCTION`, inscrire les preuves, puis seulement commencer l'évolution suivante.

### Contrôle critique permanent : date et sécurité

- `service-v3.js` doit conserver `const today=()=>bookingToday();` : tables et réservations sur la **même journée dès 00:00 à Paris**. Ne jamais réintroduire le décalage à 01:00 ; maintenir `tests/service-day-rollover.test.cjs`.
- Les deux projets Supabase sont **indépendants** : DEV `lykoybacslvmhtzftqsf`, production `tnsrkargogckgtsxipwd`. Les migrations SQL, les changements de droits ou les données de DEV ne sont **jamais** poussés automatiquement en production.
- **Réception :** création/édition/annulation autorisées selon statut, mais pas de changement manuel de table ni d'installation. **Restaurant :** gestion des tables et des passages. Les formulaires et icônes restent visuellement cohérents.
- Lors d'une régression en production : suspendre les publications ; sauvegarder MAIN/V3 ; restaurer la dernière version vérifiée, contrôler la date et le cache, consulter les journaux sans écriture DB, puis inscrire l'incident ci-dessous.
- Une correction au registre ou un commit ne constitue **pas** une validation utilisateur.

## Historique connu — ne pas réécrire les validations

| ID | Évolution isolée | DEV Clone | V3 | MAIN | Confirmation utilisateur / reste à vérifier |
| --- | --- | --- | --- | --- | --- |
| RM-001 | Jour de service : bascule à **00:00** plutôt qu'à 01:00 ; tables et réservations concordantes | Corrigé, test de non-régression ajouté | Publié, PR #66 | Publié, PR #65 | **Confirmé en production par l'utilisateur** le 10/11 : « c'est revenu l'erreur venait de là » |
| RM-002 | Nouvelle interface des formulaires, champs et icônes Lucide, actions/raccourcis de table | Code présent dans DEV | Publié, PR #68 | Publié, PR #67 | **CONFIRMÉE EN PRODUCTION ✅** — confirmation globale explicite de l'utilisateur le 10/11/2026. Cette confirmation ne constitue pas un procès-verbal détaillé de tests tablette/mobile. |
| RM-003 | Réception : alignement de « Table disponible — Attribution automatique », suppression du texte ajouté et du bouton manuel | Ancien texte parasite absent du code DEV ; CSS modernisé | Publié, PR #71 | Publié, PR #72 | **CONFIRMÉE EN PRODUCTION ✅** — confirmation globale explicite de l'utilisateur le 10/11/2026 pour le formulaire Réception. |
| RM-004 | « Client hôtel » sélectionné par défaut pour Restaurant et Réception, initialement et après nouvelle réservation | Corrigé | Publié, PR #71 | Publié, PR #72 | **CONFIRMÉE EN PRODUCTION ✅** — confirmation globale explicite de l'utilisateur le 10/11/2026 ; Client extérieur reste sélectionnable. |

*Les lignes historiques RM-001 à RM-004 décrivent l'état des livraisons passées, pas quatre tâches ouvertes en parallèle. Pour chaque évolution future, ajouter une ligne avant le premier commit et assurer son passage d'état.*

## Contre-vérification technique indépendante — 10/11/2026

Vérification par l'assistant demandée après confirmation utilisateur :

| Test | Constat |
| --- | --- |
| Synchronisation des fichiers V3 / MAIN | **OK** : mêmes empreintes pour `service-v3.js`, `v3-connected.html`, `v3-connected-auth.js`, `service-v3-reservation-fields.css`, `service-v3-reservations.js`, `service-v3-table-choices.js`, `sw.js`, `supabase-service-bridge.js` et `supabase-login.js`. |
| RM-001 — Bascule à minuit | **OK en lecture de code** sur DEV, V3 et MAIN : `const today=()=>bookingToday();` et test de changement de journée présents. |
| RM-002 — Interface/raccourcis | **OK en présence des fichiers** V3 / MAIN : mêmes scripts de réservation, de sélection des tables et structure moderne du formulaire. Test visuel non réalisé par l'assistant. |
| RM-003 — Réception | **OK en lecture de code** : carte `bookingAutoTableInfo`, CSS de la Réception, suppression du paragraphe injecté ; code de restriction du choix manuel toujours présent. Test visuel non réalisé par l'assistant. |
| RM-004 — Hôtel par défaut | **OK en lecture de code** sur les deux branches : radio hôtel cochée et réinitialisation de la sélection lors d'une nouvelle réservation, test correspondant présent. |
| Sécurité Supabase | **OK en lecture de code** : les modules officiels utilisent le projet production `tnsrkargogckgtsxipwd` et non le projet DEV. Aucun essai destructif réalisé. |
| GitHub Pages réel / PWA installée | **NON VÉRIFIABLE depuis les outils du contrôle** : aucune preuve supplémentaire de rendu live ni de test end-to-end. Les confirmations utilisateur précédentes restent la validation de terrain. |

Cette contre-vérification ne doit pas être présentée comme une preuve de fonctionnement interactif de tous les scénarios en production ; les validations du terrain et les tests de non-régression restent nécessaires à chaque future livraison.

## Évolution en cours / prochaine évolution

**RM-AUDIT-01 — CLÔTURÉE OFFICIELLEMENT ✅ (10/11/2026).** Validation explicite du responsable dans la conversation : « Oui, je valide officiellement RM-AUDIT-01. Tu peux finaliser et fusionner la PR #75 uniquement vers la branche DEV, puis préparer RM-005 sans toucher à la production. » PR [#75](https://github.com/DylanL-Dev/RestoManager/pull/75) fusionnée **uniquement** vers `feature/v3-supabase-full-clone` ; commit de fusion `d82d3adb0cc16fa851f5695ad212fd4f95ab3357`. Aucun développement RM-005 engagé, aucune fusion V3/MAIN, aucune migration Supabase production.

- **Étape 1 — VALIDÉE (chargement de DEV Render uniquement)** : le déploiement DEV `8924fa6249aabd0d34e36ef1c19d17fc2e69700a` est revenu `live` sur Render le 10/11/2026 après nettoyage du cache. L'utilisateur confirme « Oui ça fonctionne j'ai effectué aucune réservation de teste ». Cela confirme l'accès/l'affichage de l'application, **pas** la création, l'édition, l'annulation, ni les deux sessions authentifiées.
- **Étape 2 — VALIDÉE TECHNIQUEMENT (10/11/2026)** : six tests unitaires remis en cohérence sur DEV Clone ; aucune modification métier ni production. GitHub Actions **DEV Clone - audit unit tests** (exécution `42732837143`, PR de contrôle [#73](https://github.com/DylanL-Dev/RestoManager/pull/73)) : **111 tests réussis / 111 ; 0 échec ; vérification syntaxique réussie**. Les changements concernent `booking-recovery`, `bug01-security`, `platform-owner-security`, `rush-dashboard-status-split`, `rush-slider-source` et `tutorial-source` ; ne pas confondre réussite unitaire et scénarios navigateur authentifiés.
- **Étape 3 — VALIDÉE TECHNIQUEMENT AVEC RÉSERVE (10/11/2026)** : harnais Playwright réparé sur DEV, sans modification des fonctions métier. Fermeture du didacticiel par le vrai bouton « Plus tard » (missions 2/3 et Supabase local), assertions des libellés complets, actions de réservation selon les rôles, boutons adaptés à l'affichage mobile, et `restomanager-env.js` remplacé **uniquement pendant les tests locaux** pour diriger Auth/REST vers une pile jetable 127.0.0.1. Tests CI de la PR de contrôle [#74](https://github.com/DylanL-Dev/RestoManager/pull/74), commit `9bd6e0bf` : **unitaires 111/111, navigateur Mission 2 13/13, navigateur Mission 3 77/77**, tous sans réseau distant ; workflow GitHub `42736088257` **réussi**. Workflow Mission 3 intégration `42736088651` **réussi** : PostgreSQL, browser mock, Auth/REST/Realtime locale ; **2 scénarios pré-migration, 29 API et 6 navigateurs authentifiés fictifs réussis**, dont deux sessions et protections RLS. **Réserve P2 : le SDK de dépendance du harnais reste sur `@supabase/supabase-js 2.57.0` tandis que les modules frontend importent `2.119.0`; la validation est passée mais la parité de version n'est pas encore établie.** À traiter sans déploiement de fonctionnalité et sans assouplissement réseau.
- **Étape 4 — BLOQUÉE (10/11/2026, précontrôles exécutés)** : [compte rendu, preuves et procédure de recette](audits/RM-AUDIT-01_ETAPE4_20261110.md). La cible effective du clone est Supabase DEV `lykoybacslvmhtzftqsf`. Deux profils actifs sont reliés à Auth, confirmés, non bannis et correspondent aux alias Restaurant/Réception ; aucun accès de recette n’est cependant fourni au runtime (zéro secret). **7 précontrôles PASS, 0 FAIL et 8 ensembles de recette BLOQUÉS ; aucun parcours authentifié hébergé exécuté.** Les deux connexions publiques PC/mobile, les imports SDK et les helpers de minuit ont été contrôlés sans écriture. Les imports 2.57.0/2.119.0 réussissent, mais la parité fonctionnelle SDK reste en réserve P2. Aucune création de compte nécessaire ni effectuée ; procédure sécurisée conditionnelle et scénarios S01–S10 préparés. Aucune donnée fictive créée, donc aucun nettoyage exécuté. **Clôture non possible sans preuve authentifiée.** Les validations techniques des étapes 1–3 restent inchangées.
- **Complément final — VALIDÉ TECHNIQUEMENT (proposition, 10/11/2026)** : [tableau final, niveaux de preuve et réserves](audits/RM-AUDIT-01_VERIFICATIONS_FINALES_20261110.md). Le [complément manuel de la PR #75](https://github.com/DylanL-Dev/RestoManager/pull/75#issuecomment-6763913217) confirme déclarativement la recette DEV ; il ne constitue pas une trace Playwright hébergée. Nouveaux essais : 111 tests Node, 13 groupes Mission 2, 77 Mission 3, 14 affichage, 2 rôles au passage de minuit ; replay isolé des **58 fonctions, 47 RLS, ACL et 24 triggers DEV** : **62 scénarios SQL, 34 scénarios API et 6 groupes navigateur Auth/Realtime**, tous réussis. SDK du harnais aligné à **2.119.0** comme le frontend, lockfile et bundle réel testés ; réserve P2 de divergence de version levée sur cette branche. Les tentatives intermédiaires et les preuves initiales sont conservées. Aucun test robot authentifié hébergé ajouté ; cette couverture reste apportée par les confirmations manuelles déclarées. Pas de fusion/publication/écriture production.
- **Décision de clôture** : `RM-AUDIT-01 — CLÔTURÉE ✅` par validation explicite du responsable le 10/11/2026 et fusion documentaire/harnais vers DEV (PR #75). Les limites sont acceptées : parcours hébergés confirmés manuellement, scénarios de sécurité/concurrence/Auth/Realtime automatisés sur pile locale isolée ; aucune prétention de robot authentifié sur Render. La ligne historique « Étape 4 — BLOQUÉE » conserve l'état du précontrôle avant ces compléments, **et ne représente pas le statut final**.
- **Préparation RM-005 uniquement** : [candidat issue #3, périmètre/dépendances/risques/ordre proposé](audits/RM-005_PREPARATION_SANS_DEVELOPPEMENT.md). Aucun développement engagé ; identification à confirmer après clôture.
- **Après clôture** : RM-005 peut être cadrée à partir de [l'issue #3](https://github.com/DylanL-Dev/RestoManager/issues/3) et du document de préparation ci-dessus. **Ne pas commencer son développement sans validation distincte du périmètre.** Conserver la règle d'une seule évolution active et la séparation DEV / V3 / MAIN / Supabase production.

## Évolution active — RM-005 (étape 1, horaires configurables)

**Statut : EN COURS DEV — 10/11/2026.** Démarrage explicitement autorisé par l'utilisateur (« C'est parti »). Branche de travail isolée : `feature/rm-005-horaires`, issue métier [#3](https://github.com/DylanL-Dev/RestoManager/issues/3). **Une seule évolution RM-005**, qui regroupe horaires, messages d'erreur, liste des réservations et présentation visuelle des tables de passage. Chaque volet doit être testé et accepté successivement ; **une seule livraison finale** après accord explicite.

- **Étape 1 active :** horaires par restaurant (début/fin des services, dernière réservation, clôture, changement du jour de service, restaurants nocturnes). Préserver les valeurs actuelles du Mercure : midi 12:00–14:30, soir 19:00–21:30, clôture 23:30, changement de jour 00:00 Europe/Paris.
- **Critères :** réglages isolés par établissement ; modification autorisée uniquement au rôle Restaurant habilité, Réception lecture seule ; aucun client installé ne disparaît ni ne se ferme silencieusement ; pas de réservation antidatée ou modifiée sans action ; reprise serveur en cas de coupure ; contrôle horaire cohérent sur deux appareils, été/hiver et après minuit.
- **Risques critiques :** séparation date civile/journée de service, RLS, collisions et clôtures concurrentes, PWA/cache, notifications et continuité des réservations. Avant migration : tests sur base jetable, revue des RPC et sauvegarde de la configuration DEV ; aucune migration production.
- **Volets suivants déjà cadrés :** erreur rouge explicite hors horaires à la création et à la modification ; liste Réservations compacte et accessible ; amélioration **visuelle uniquement** de la sélection des tables réellement libres pour les passages. Conserver l'étape actuelle d'installation après choix, sans nouveau statut « arrivé ».
- **État au 11/11/2026 :** à la demande du responsable, priorité temporaire au **volet interface Réservations**, sans abandonner le volet horaires. Première implémentation de liste compacte commune Restaurant/Réception effectuée uniquement sur `feature/rm-005-horaires` (`service-v3-reservations.js`, CSS RM-005 dédié, lien HTML et cache). Colonnes heure, client/chambre, couverts, table(s), origine, statut, notes/allergies et actions. Affichage mobile responsive. **Contrôle statique syntaxique JS réussi uniquement ; rendu visuel, navigateur authentifié, tests de régression et validation utilisateur EN ATTENTE.** Pas de fusion DEV, V3 ou MAIN, aucune écriture Supabase production. Le volet horaires reste à développer.

## Fiche à dupliquer pour chaque mise à jour

```md
### RM-XXX — [Intitulé] — [STATUT]
- Demande / problème :
- Critères de validation (Restaurant / Réception / PC / tablette / téléphone) :
- Fichiers et dépendances :
- Risques (synchronisation / jour de service / rôles / PWA / Supabase) :
- Commit(s) DEV :
- Tests automatiques et résultats :
- Test Render DEV (date et résultat) :
- Validation explicite de l'utilisateur (citation/date) :
- PR + commit V3 :
- PR + commit MAIN :
- Vérification GitHub Pages / PWA :
- Confirmation de production (date) :
- Prochaine action :
```

**Rappel impératif à annoncer à l'utilisateur lorsqu'il demande une nouvelle tâche :** « Nous avons déjà RM-XXX en cours / à valider. On la termine ou on la reporte explicitement avant d'ouvrir la suivante. »


## Audit direction RM-JOHN-01 — 12/11/2026 (DEV UNIQUEMENT)

- **Statut : À TESTER CLONE / PARTIEL**. Demandé explicitement par l'utilisateur : auditer les sept retours du directeur, corriger sur DEV sans toucher à V3 ni MAIN. C'est un volet d'audit de RM-005, pas une autorisation de publication.
- **Preuves détaillées :** [RM-JOHN-01 — sept remarques](audits/RM-JOHN-01_RETours_20261112.md).
- **Modifications DEV :** créneaux quart d'heure, choix de couverts, erreurs près des champs, explication du seuil conseillé ; salle Prestige ajoutée dans Supabase DEV, sans table déplacée.
- **Fermeture du week-end : correction DEV codée et vérifiée en SQL** : champs samedi/dimanche dédiés dans Supabase, trigger empêchant les nouvelles réservations du midi et les changements d'horaire vers ce service fermé ; choix de créneaux et Gestion raccordés. Essais transactionnels sans enregistrement fictif. **Toujours À TESTER CLONE sur Render** avec les deux rôles avant V3/MAIN.
- **Configuration DEV restaurée** après constat des valeurs de test inhabituelles : midi 12:00–14:30, soir 19:00–21:30, durée de table 90 min. Les anciennes valeurs étaient 00:00–18:00, 19:00–23:55 et 45 min ; aucune réservation déjà présente n'a été supprimée.
- **Validation utilisateur :** en attente pour les nouvelles interactions Réception/Restaurant sur Render ; aucun déploiement V3 / MAIN.

- **Audit technique final RM-JOHN-01** : PR QA #102 non fusionnée, 6/6 contrôles GitHub réussis dont 127/127 tests unitaires ; fermeture samedi/dimanche midi vérifiée par test SQL sans réservation persistée. **Statut : À TESTER CLONE**, validation utilisateur sur Render nécessaire.


## RM-JOHN-02 — Planning hebdomadaire par jour — À TESTER CLONE (12/11/2026)

- Demande validée par l'utilisateur : reprendre la maquette de planning hebdomadaire sur PC, tablette et mobile, sans modifier V3/MAIN. Volet actif de RM-005.
- **DEV uniquement** : sept jours indépendants, ouverture midi/soir, heures de début et dernière réservation, copier vers jour cible et copier lundi→jours ouvrés.
- Réglages par restaurant synchronisés via `restaurant_hours.weekly_schedule` et garde serveur sur chaque création / changement d'horaire. Le jour est déterminé selon **Europe/Paris**.
- Migration DEV : `20261112211500_weekly_schedule_dev.sql`. Permissions durcies : `20261112212500_weekly_hours_rls_dev.sql`.
- Navigation responsive : tableau PC, disposition intermédiaire tablette, cartes repliables téléphone. Tests Playwright `tests/browser/weekly-ui.cjs` pour 1440/800/390 px.
- **Aucune réservation existante modifiée** ; durée existante conservée (60 min au moment de l'audit), jours fermés antérieurs conservés.
- Rapport : [RM-JOHN-02](audits/RM-JOHN-02_PLANNING_HEBDOMADAIRE.md).
- Fermetures ponctuelles par date : **hors de cette version**, à cadrer séparément.
- État : tests GitHub en cours, test Render et validation explicite utilisateur encore nécessaires avant promotion.

## RM-JOHN-03 — Indicateur des places restantes par créneau (DEV, à valider)

- **Origine** : proposition validée visuellement par l'utilisateur : « 4 places à 19h30 », couleurs de disponibilité comme billets de train, pour Réception et Restaurant.
- **Code DEV** : `service-v3-slot-capacity.js` estime les places physiques non occupées sur l'intervalle complet à partir des tables connues, des réservations bloquantes et des verrous temporaires. Une fusion autorisée sert à confirmer la compatibilité du groupe mais ne crée jamais de capacité artificielle. `service-v3-booking-director-choices.js` présente l'indicateur sous chaque bouton de créneau ; code de réservation initial et attribution restent inchangés.
- **Sécurité d'affichage** : synchronisation absente, hors ligne ou réservation sans table assignée → « À vérifier » ; absence de table compatible pour le nombre de couverts demandé → « Pas de table pour N », bouton indisponible ; les autres créneaux indiquent un nombre estimatif sous réserve de confirmation serveur.
- **Échelle** : vert ≥5 places ; orange 2–4 ; rouge 1 ; gris complet. C'est **un indicateur de places physiques disponibles**, pas une promesse de table unique ; la validation Supabase reste l'autorité.
- **Régression** : `tests/booking-slot-capacity.test.cjs` couvre places libres, chevauchements, réservations installées, verrous, fusions, comptes de groupes, réservations non attribuées et connexion indisponible.
- **État** : À TESTER CLONE (Réception + Restaurant, PC/tablette/mobile, vraie concurrence multi-appareils). Pas d'autorisation de publication V3/MAIN.


## RM-JOHN-04 — Salle Prestige et visibilité des créneaux (13/11/2026)

- **DEV uniquement / À TESTER CLONE** : signalement utilisateur sur captures mobile, les créneaux montrent tous « À vérifier » et les tables de la Salle principale apparaissent même après sélection de Prestige.
- Vérifié dans Supabase DEV : Salle principale **22 tables actives / 23 enregistrées**, Salle Prestige **0 table**, aucune réservation à venir sans attribution constatée au moment du contrôle. Aucune donnée modifiée.
- **Correctif affichage** : le filtrage du panneau Tables prend désormais l'identifiant de salle sélectionné ; une Salle Prestige vide montre un état explicite et le formulaire conserve Prestige après ajout. Le choix de salle n'ajoute ni ne déplace automatiquement des tables. L'affichage des tables désactivées reste séparé pour permettre leur réactivation.
- **Suppression sécurisée** : salle vide = bouton Supprimer qui désactive la salle côté Supabase, en conservant l'historique ; salle contenant des tables = refus. Table utilisée = « Retirer » (désactivation et conservation de l'historique), restauration possible. Aucune suppression irréversible d'une table liée à une réservation.
- **Correctif créneaux** : estimations affichées si snapshot reçu et état de synchronisation `ok` ou `readonly` ; indisponibilité de connexion / donnée incomplète = « À vérifier ». Toujours soumis à la validation serveur.
- **Tests** : `tests/room-isolation-and-slot-visual.test.cjs`, suite existante; validation mobile/tablette dans DEV encore nécessaire.
- **Ne pas promouvoir vers V3 ou MAIN sans validation explicite**.


## RM-JOHN-05 — Créneaux & arrivée + nom des clients extérieurs (13/11/2026)

- **Demande** : lier visuellement la disponibilité des horaires et le suivi des arrivées, ajouter icônes Lucide de places restantes, éviter les erreurs de capacité en bas de formulaire ; **garder impérativement la grande modale « Forte affluence »** comme deuxième confirmation.
- **DEV seulement / À TESTER CLONE** : boutons de créneaux avec `users` (places estimées), `activity` (affluence élevée selon **le même moteur RestoRush** que le suivi des arrivées), `info` (explication des indicateurs). Couleurs des places préservées même lorsque le créneau est sélectionné.
- Incompatibilité connue : bouton cliquable pour expliquer l'impossibilité sous les horaires sans changer la sélection ; validation du même état avant enregistrement. État de synchro incertain : laisser « À vérifier » et déléguer aux contrôles Supabase existants.
- **La modale `RestoRush.confirm` n'a pas été remplacée ni retirée.** Les arrivées conseillées restent distinctes des places physiques.
- **Nom obligatoire uniquement pour client extérieur** : champ `bookingClient` obligatoire avec message adjacent dans les deux rôles ; côté hôtel nom facultatif, numéro de chambre selon règles existantes. Éditeur de réservation adapté, sauvegarde Supabase et nouveau trigger `private.require_named_exterior_guest` sur INSERT/UPDATE de `guest_name/notes` pour les réservations marquées `[RESTOMANAGER:EXTERIEUR]`.
- Migration DEV : `20261113015700_john_exterior_guest_required_dev.sql` **déjà appliquée à DEV seulement** ; tests SQL avec transaction annulée : nom générique refusé, nom réel accepté, aucune réservation factice conservée.
- Tests : `tests/browser/director-slot-form.cjs` (mobile 390, tablette 800, PC 1440 ; icônes et couleurs ; blocage d'une capacité impossible ; bascule Hôtel/Extérieur), plus tests unitaires. Le résultat sur la véritable application Render doit être validé avec les deux rôles avant V3/MAIN.


## RM-JOHN-07 — Maquettes mobile/tablette, affluence immédiate (13/11/2026)

- **DEV uniquement — À VALIDER SUR CLONE.** Maquettes mobile/tablette acceptées, refonte frontend des créneaux et du nombre de couverts.
- **Avant même le choix des couverts**, aperçu d'affluence indépendant du nombre de personnes via le **même moteur `RestoRush.evaluate`** : statut « Arrivées nombreuses » dès 80 % du seuil conseillé, « Seuil conseillé atteint » à 100 %, chiffres affichés sur chaque créneau et dans les formulaires Réservation et Passage.
- **Disponibilité physique distincte** : ne jamais assimiler `21 / 22 arrivées` à `1 place libre`. L'estimation des tables reste recalculée après le choix d'un nombre de personnes.
- **Mobile** : quatre créneaux visibles par défaut sur deux colonnes, bouton « Voir les autres horaires », boutons compacts `1..7 + 8+` pour les couverts. Le champ de nombre personnalisé n'apparaît que pour `8+`. La même logique est adaptée sur tablette et PC.
- Icônes Lucide `activity`, `users`, `info` ; explications dans une section repliable.
- **Sécurité conservée :** aucune modification de la grande modale `RestoRush.confirm` pour dépassement du seuil lors de la réservation, ni des règles de validation Supabase. Aucun changement de base.
- Nouveau module `service-v3-arrival-preview.js/.css`, modifications de `service-v3-booking-director-choices.js` ; tests Playwright du formulaire Réservation/Passage aux largeurs 390, 800 et 1440 px.
- Déploiement Render DEV et validation visuelle des deux formulaires encore nécessaires. V3/MAIN non autorisés.


## Prépublication RM-005 — revue CI 13/11/2026

- **Statut global : CI PASS — À TESTER CLONE AVEC LES DEUX RÔLES / NON AUTORISÉ POUR V3 OU MAIN.** Rapport complet : [RM005_PREPUB_AUDIT_RESULT_20261113.md](audits/RM005_PREPUB_AUDIT_RESULT_20261113.md).
- **3 workflows réussis / 3** sur [PR QA #117](https://github.com/DylanL-Dev/RestoManager/pull/117) (non fusionnée) : 152 tests Node/152, syntaxe 124/124, 13+98 scénarios browser, 14 affichages, tests hebdomadaires et créneaux sur 390/800/1440 px, PostgreSQL et Supabase local RLS/Auth/Realtime. Aucune erreur automatique résiduelle.
- Tests préexistants corrigés sur DEV pour la nouvelle version de script et les icônes Lucide, **sans désactiver les garde-fous métier**.
- Comparaison SQL distante **lecture seule** : PROD ne dispose pas des champs de planning/fermetures ni du RPC de fusion 2–4 tables présents en DEV. Pas de migration ni copie de configuration DEV vers PROD.
- Aucune validation de parcours hébergé authentifié Render pour les nouvelles fonctions ; consentement utilisateur obligatoire avant chaque lot V3/MAIN. Ne pas déclarer « prêt à publier » sans tests terrain, revue des dépendances et préparation de migrations distinctes.


## Incident RM-005 — passage hors horaires historiques (13/11/2026)

**Retour utilisateur Render DEV :** six tests métier validés sur huit (1 créneaux, 2 réservation, 3 synchronisation Réception/Restaurant, 4 hôtel/extérieur, 7 fusions, 8 salles/Prestige). Tests **5 installer/libérer un passage** et **6 planning/fermetures** initialement non validés. Puis incident : les passages du vendredi (service midi 12:00–16:30) et du samedi/dimanche (12:00–17:30) sont refusés malgré le planning sauvegardé.

**Cause confirmée côté SQL :** le planning hebdomadaire est bien enregistré en DEV ; plusieurs RPC `SECURITY DEFINER` consultaient encore les champs horaires généraux `lunch_end=14:30` plutôt que les horaires par date. Le groupe SQL de passage `install_walkin_group_v3/v4` était directement concerné.

**Correction DEV uniquement :** migrations `20261113153000_rm005_walkin_weekly_server_dev.sql` et `20261113164500_rm005_weekly_helper_writer_grant_dev.sql` appliquées à Supabase DEV. Sept fonctions serveur utilisent la règle hebdomadaire partagée ; la deuxième migration accorde l'EXECUTE du helper **uniquement au rôle interne `resto_service_writer`**, sans accorder d'accès direct à `anon` ni `authenticated`. Messages de formulaire clarifiés et durée réellement configurée utilisée. Aucun changement de réservation ou base PROD.

**Preuves DEV :** 10/10 cas jour/heure et autre établissement conformes ; installation d'un passage authentifié `install_walkin_group_v3` vendredi midi prolongé **PASS**, et créations Réception `reception_booking_v3` vendredi 15:50, samedi 16:00, dimanche 16:00 **PASS**, toutes réalisées en transaction **ROLLBACK** ; vérification de **0 réservation de test persistée**. Fonction helper inaccessible directement à `anon`/`authenticated`. QA finale : [#119](https://github.com/DylanL-Dev/RestoManager/pull/119).

**Statut :** correctif technique appliqué et tests SQL réels PASS ; recette navigateur hébergé Render du passage et du planning par utilisateur **EN ATTENTE**. MAIN/V3 et Supabase PROD restent interdits de publication sans validation explicite et revue des migrations PROD.


## RM-005 — Recette utilisateur clôturée 8/8 (13/11/2026)

**Statut de la recette sur DEV : 8 tests utilisateur sur 8 validés.** Retour du propriétaire du projet et captures Render DEV :

1. Créneaux horaires intelligents — **VALIDÉ**.
2. Création d'une réservation — **VALIDÉ**.
3. Synchronisation Réception / Restaurant — **VALIDÉ**.
4. Client hôtel / client extérieur — **VALIDÉ**.
5. Installation et libération d'un passage — **VALIDÉ** après correction des gardes horaires serveur. Capture : table 2, installation vendredi à 15:52, puis statut « libéré » observé en base DEV.
6. Planning et fermetures — **VALIDÉ** pour les horaires ouverts testés : vendredi 12:00–16:30, réservation samedi 14/11 à 16:00 et dimanche 15/11 à 13:00. Le rejet hors horaire est couvert par la recette automatique. Les réservations de démonstration du week-end apparaissent comme annulées lors du contrôle DEV en lecture seule.
7. Fusions intelligentes — **VALIDÉ**.
8. Salles et Salle Prestige — **VALIDÉ**.

**Tests automatiques :** [QA #119](https://github.com/DylanL-Dev/RestoManager/pull/119), trois workflows PASS / trois (158 tests Node), PostgreSQL, Playwright et Supabase local. **Render DEV :** commit `ba93af5`, statut LIVE. Les RPC SQL DEV ont également été validés sur des transactions annulées (0 réservation fictive persistée par les tests SQL).

**Important :** la réussite de la recette DEV ne constitue PAS une autorisation de migrer Supabase PROD ou de publier sur MAIN/V3. Avant mise en production : préparer le diff SQL ciblé (planning hebdomadaire, rôles, RPC fusion et contrôle des noms extérieurs), prévoir sauvegarde/rollback, revérifier sécurité RLS et SQL, sauvegarder les branches divergentes, puis demander la validation explicite de l'utilisateur pour chaque publication.


## RM-006 — proposition de feuille de route (13/11/2026)

- **État : CANDIDAT / PÉRIMÈTRE À VALIDER, aucune fonctionnalité RM-006 publiée ou développée à ce titre.**
- Proposition détaillée : [RM006_ROADMAP_PROPOSAL_20261113.md](RM006_ROADMAP_PROPOSAL_20261113.md).
- Préparer RM-005 ET RM-006 sans les mélanger : RM-005 passe par la revue SQL/branches/rollback puis demande d'accord explicite ; RM-006 reste à l'étape de sélection des fonctions avant développement.
- Pas de modification de MAIN, RestoManager-V3 ou Supabase PROD sans accord explicite.
