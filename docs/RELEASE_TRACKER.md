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

**RM-AUDIT-01 — EN COURS (maintenance / audit, aucune nouvelle fonctionnalité).**

- **Étape 1 — VALIDÉE (chargement de DEV Render uniquement)** : le déploiement DEV `8924fa6249aabd0d34e36ef1c19d17fc2e69700a` est revenu `live` sur Render le 10/11/2026 après nettoyage du cache. L'utilisateur confirme « Oui ça fonctionne j'ai effectué aucune réservation de teste ». Cela confirme l'accès/l'affichage de l'application, **pas** la création, l'édition, l'annulation, ni les deux sessions authentifiées.
- **Étape 2 — VALIDÉE TECHNIQUEMENT (10/11/2026)** : six tests unitaires remis en cohérence sur DEV Clone ; aucune modification métier ni production. GitHub Actions **DEV Clone - audit unit tests** (exécution `42732837143`, PR de contrôle [#73](https://github.com/DylanL-Dev/RestoManager/pull/73)) : **111 tests réussis / 111 ; 0 échec ; vérification syntaxique réussie**. Les changements concernent `booking-recovery`, `bug01-security`, `platform-owner-security`, `rush-dashboard-status-split`, `rush-slider-source` et `tutorial-source` ; ne pas confondre réussite unitaire et scénarios navigateur authentifiés.
- **Étape 3 — VALIDÉE TECHNIQUEMENT AVEC RÉSERVE (10/11/2026)** : harnais Playwright réparé sur DEV, sans modification des fonctions métier. Fermeture du didacticiel par le vrai bouton « Plus tard » (missions 2/3 et Supabase local), assertions des libellés complets, actions de réservation selon les rôles, boutons adaptés à l'affichage mobile, et `restomanager-env.js` remplacé **uniquement pendant les tests locaux** pour diriger Auth/REST vers une pile jetable 127.0.0.1. Tests CI de la PR de contrôle [#74](https://github.com/DylanL-Dev/RestoManager/pull/74), commit `9bd6e0bf` : **unitaires 111/111, navigateur Mission 2 13/13, navigateur Mission 3 77/77**, tous sans réseau distant ; workflow GitHub `42736088257` **réussi**. Workflow Mission 3 intégration `42736088651` **réussi** : PostgreSQL, browser mock, Auth/REST/Realtime locale ; **2 scénarios pré-migration, 29 API et 6 navigateurs authentifiés fictifs réussis**, dont deux sessions et protections RLS. **Réserve P2 : le SDK de dépendance du harnais reste sur `@supabase/supabase-js 2.57.0` tandis que les modules frontend importent `2.119.0`; la validation est passée mais la parité de version n'est pas encore établie.** À traiter sans déploiement de fonctionnalité et sans assouplissement réseau.
- **Étape 4 — À TESTER** : exécuter les scénarios authentifiés sur DEV avec comptes de recette et vérifier deux sessions Réception/Restaurant ; aucune écriture de test en production.
- Ne pas ouvrir RM-005 tant que RM-AUDIT-01 n'est pas clôturé ou explicitement reporté avec accord de l'utilisateur.

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
