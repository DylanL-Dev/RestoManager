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
| RM-002 | Nouvelle interface des formulaires, champs et icônes Lucide, actions/raccourcis de table | Code présent dans DEV | Publié, PR #68 | Publié, PR #67 | **Publication code confirmée ; validation complète en situation réelle non consignée.** À vérifier séparément pour raccourcis, modification, deux rôles, tablette/mobile. |
| RM-003 | Réception : alignement de « Table disponible — Attribution automatique », suppression du texte ajouté et du bouton manuel | Ancien texte parasite absent du code DEV ; CSS modernisé | Publié, PR #71 | Publié, PR #72 | **Publication code confirmée ; validation du rendu après PR #71/#72 à consigner.** Ne pas déclarer validé sans vérification. |
| RM-004 | « Client hôtel » sélectionné par défaut pour Restaurant et Réception, initialement et après nouvelle réservation | Corrigé | Publié, PR #71 | Publié, PR #72 | Tests CI verts, **validation visuelle finale à consigner**. Client extérieur reste sélectionnable. |

*Les lignes historiques RM-001 à RM-004 décrivent l'état des livraisons passées, pas quatre tâches ouvertes en parallèle. Pour chaque évolution future, ajouter une ligne avant le premier commit et assurer son passage d'état.*

## Évolution en cours / prochaine évolution

**Aucune nouvelle évolution fonctionnelle n'est engagée.** Avant d'en démarrer une, clôturer/consigner les vérifications encore ouvertes de RM-002 à RM-004 ou les marquer explicitement `BLOQUÉE / REPORTÉE` avec accord utilisateur. Ensuite demander quelle **seule** amélioration sera traitée.

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
